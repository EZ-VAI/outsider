/* Private sandbox configuration + lazy OAuth for the existing payout transport.
 * This does not create a payout decision, test acceptance, account or authority.
 * Tokens stay in memory; preparation and inspection never call PayPal.
 */
import path from "node:path";
import { createPayPalPayoutSandboxAdapter, PAYPAL_PAYOUT_SANDBOX_PROTOCOL }
  from "./outsider-paypal-payout-sandbox.js";
import { readPrivateExecutionBytes } from "./outsider-user-held-durable-execution-v2.js";

const TOKEN_URL = "https://api-m.sandbox.paypal.com/v1/oauth2/token";
const MAX_TOKEN_BYTES = 64 * 1024;
const CONFIG_KEYS = new Set(["directory", "credentialsFile", "testRecipientFile",
  "fetchImpl", "clock", "timeoutMs"]);
export const PAYPAL_SANDBOX_CONNECTION_PROTOCOL = Object.freeze({
  environment: "SANDBOX", tokenUrl: TOKEN_URL,
  requiredReturnedScope: PAYPAL_PAYOUT_SANDBOX_PROTOCOL.scope,
  sources: Object.freeze([
    "https://developer.paypal.com/api/rest/authentication/",
    "https://developer.paypal.com/api/payouts/standard",
    "https://developer.paypal.com/sandbox-testing/accounts",
  ]),
});
function fail(code) {
  const error = new TypeError(`OUTSIDER_PAYPAL_SANDBOX_CONNECTION_${code}`);
  error.code = code;
  throw error;
}
function privateJson(file, kind) {
  try { return JSON.parse(readPrivateExecutionBytes(file).toString("utf8")); }
  catch { fail(`${kind}_PRIVATE_JSON_REQUIRED`); }
}
function keysExactly(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function credentialPart(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && /^[\x21-\x7e]+$/u.test(value) && !value.includes(":");
}
async function tokenJson(response) {
  if (response.status !== 200 || response.redirected === true
    || (response.url && response.url !== TOKEN_URL)) {
    await response.body?.cancel();
    fail("OAUTH_RESPONSE_REJECTED");
  }
  const reader = response.body?.getReader();
  if (!reader) fail("OAUTH_RESPONSE_REJECTED");
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TOKEN_BYTES) {
        await reader.cancel();
        fail("OAUTH_RESPONSE_TOO_LARGE");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString("utf8")); }
  catch { fail("OAUTH_RESPONSE_REJECTED"); }
}

/** Same four transport operations. Only prepare fills the sandbox recipient
 * from its private file; it still requires the caller's original acceptance.
 * Injected fetch applies to OAuth AND payouts and remains PROVIDER_FIXTURE.
 */
export function createPayPalSandboxConnection(config = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)
    || Object.keys(config).some(key => !CONFIG_KEYS.has(key))
    || ["directory", "credentialsFile", "testRecipientFile"].some(key =>
      typeof config[key] !== "string" || !path.isAbsolute(config[key]))) {
    fail("CONFIG_INVALID_OR_ENDPOINT_OVERRIDE");
  }
  const credentialsFile = config.credentialsFile;
  const testRecipientFile = config.testRecipientFile;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const clock = config.clock ?? (() => new Date().toISOString());
  const timeoutMs = config.timeoutMs ?? 15000;
  if (typeof fetchImpl !== "function" || typeof clock !== "function"
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail("CONFIG_INVALID");
  const nowMs = () => {
    const value = clock(); const ms = Date.parse(value);
    if (typeof value !== "string" || !Number.isFinite(ms)
      || new Date(ms).toISOString() !== value) fail("CLOCK_INVALID");
    return ms;
  };
  let cached = null; let pending = null;
  async function acquireToken() {
    const credentials = privateJson(credentialsFile, "CREDENTIALS");
    if (!keysExactly(credentials, ["environment", "clientId", "clientSecret"])
      || credentials.environment !== "SANDBOX"
      || !credentialPart(credentials.clientId) || !credentialPart(credentials.clientSecret)) {
      fail("SANDBOX_APP_CREDENTIALS_REQUIRED");
    }
    const startedAt = nowMs();
    // PayPal's documented app-credential flow returns app-granted scopes.
    // Do not send an invented payouts-only narrowing parameter or claim that
    // the resulting bearer grants no other permissions.
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "grant_type=client_credentials",
    });
    const token = await tokenJson(response);
    if (typeof token?.access_token !== "string" || token.access_token.length < 1
      || token.access_token.length > 16384 || !/^[\x21-\x7e]+$/u.test(token.access_token)
      || typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer"
      || !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0
      || token.expires_in > 2147483647 || typeof token.scope !== "string"
      || !token.scope.split(/\s+/u).includes(PAYPAL_PAYOUT_SANDBOX_PROTOCOL.scope)) {
      fail("OAUTH_TOKEN_OR_PAYOUTS_SCOPE_INVALID");
    }
    const receivedAt = nowMs();
    // Request start is conservative: never extend validity by network delay.
    const lifetimeMs = token.expires_in * 1000;
    const expiresAt = startedAt + lifetimeMs;
    if (receivedAt < startedAt || receivedAt >= expiresAt) fail("OAUTH_TOKEN_ALREADY_EXPIRED");
    cached = { value: token.access_token, issuedAt: receivedAt,
      refreshAt: expiresAt - Math.min(30000, lifetimeMs / 2) };
    return cached.value;
  }
  async function getAccessToken(request) {
    if (request?.environment !== "SANDBOX"
      || request.scope !== PAYPAL_PAYOUT_SANDBOX_PROTOCOL.scope) fail("TOKEN_PURPOSE_INVALID");
    const now = nowMs();
    if (cached && now >= cached.issuedAt && now < cached.refreshAt) return cached.value;
    cached = null;
    if (!pending) {
      // Suppress remote bodies, secrets, file paths and transport causes.
      pending = acquireToken().catch(() => fail("OAUTH_UNAVAILABLE"))
        .finally(() => { pending = null; });
    }
    return pending;
  }
  const adapter = createPayPalPayoutSandboxAdapter({
    directory: config.directory, clock, timeoutMs, getAccessToken,
    ...(config.fetchImpl ? { fetchImpl } : {}),
  });
  return Object.freeze({
    prepare(input) {
      if (!keysExactly(input, ["sandboxTransfer", "sandboxAcceptance"])) fail("PREPARE_INPUT_INVALID");
      const record = privateJson(testRecipientFile, "RECIPIENT");
      if (!keysExactly(record, ["environment", "testRecipient"])
        || record.environment !== "SANDBOX") fail("SANDBOX_RECIPIENT_RECORD_REQUIRED");
      return adapter.prepare({ ...input, testRecipient: record.testRecipient });
    },
    submit: adapter.submit, reconcile: adapter.reconcile, inspect: adapter.inspect,
  });
}
