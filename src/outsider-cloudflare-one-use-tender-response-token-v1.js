/* Stateless Cloudflare routing token for a one-use tender response link. */

import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

const DOMAIN = Buffer.from(
  "outsider/cloudflare-one-use-tender-response-routing-token/v1\0", "utf8");
const TOKEN = /^[A-Za-z0-9_-]{86}$/u;

export const OUTSIDER_CLOUDFLARE_ONE_USE_TENDER_RESPONSE_TOKEN_V1_BOUNDARY
  = Object.freeze({
    entropyBytes: 32,
    authenticationTagBytes: 32,
    algorithm: "HMAC-SHA-256",
    verifiedBeforeDurableObjectLookup: true,
    anonymousInvalidTokenCreatesDurableObject: false,
    rawTokenStored: false,
    tokenIsProviderIdentity: false,
    tokenIsOwnerAuthority: false,
    decisionState: "HOLD",
  });

function keyBytes(value) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8")
    : Buffer.isBuffer(value) || value instanceof Uint8Array
      ? Buffer.from(value) : null;
  if (bytes === null || bytes.length < 32 || bytes.length > 512) {
    throw new TypeError("OUTSIDER_CLOUDFLARE_RESPONSE_TOKEN_V1_MAC_KEY_INVALID");
  }
  return bytes;
}

function entropyBytes(value) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError("OUTSIDER_CLOUDFLARE_RESPONSE_TOKEN_V1_ENTROPY_INVALID");
  }
  const bytes = Buffer.from(value);
  if (bytes.length !== 32) {
    throw new TypeError("OUTSIDER_CLOUDFLARE_RESPONSE_TOKEN_V1_ENTROPY_INVALID");
  }
  return bytes;
}

function tag(entropy, macKey) {
  return createHmac("sha256", keyBytes(macKey)).update(DOMAIN)
    .update(entropy).digest();
}

/** Caller supplies 32 bytes from a cryptographically secure random source. */
export function createCloudflareOneUseTenderResponseTokenV1(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Reflect.ownKeys(input).length !== 2
    || !Object.hasOwn(input, "entropyBytes")
    || !Object.hasOwn(input, "macKey")) {
    throw new TypeError("OUTSIDER_CLOUDFLARE_RESPONSE_TOKEN_V1_INPUT_INVALID");
  }
  const entropy = entropyBytes(input.entropyBytes);
  return Buffer.concat([entropy, tag(entropy, input.macKey)])
    .toString("base64url");
}

export function verifyCloudflareOneUseTenderResponseTokenV1(token, macKey) {
  if (typeof token !== "string" || !TOKEN.test(token)) return false;
  let bytes;
  try { bytes = Buffer.from(token, "base64url"); }
  catch { return false; }
  if (bytes.length !== 64 || bytes.toString("base64url") !== token) return false;
  const entropy = bytes.subarray(0, 32);
  const actual = bytes.subarray(32);
  let expected;
  try { expected = tag(entropy, macKey); } catch { return false; }
  return timingSafeEqual(actual, expected);
}

