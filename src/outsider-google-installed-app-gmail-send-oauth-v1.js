/*
 * Google installed-app OAuth helper for the single gmail.send scope.
 *
 * Credentials and stored grants enter only through injected Keychain
 * closures. Authorization uses PKCE S256, a random state value, and an
 * ephemeral server bound to 127.0.0.1. Tokens are retained in Keychain and a
 * one-shot private capability; public results and 0600 evidence are closed.
 */

import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, writeSync,
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const EVIDENCE_ID = /^oauth_[a-f0-9]{32}$/u;
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALLBACK_PATH = "/oauth2/callback";
const MAX_TOKEN_RESPONSE_BYTES = 1024 * 1024;
const HELPERS = new WeakMap();
const PRIVATE_RESULTS = new WeakMap();

export const OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS
  = Object.freeze({
    helper: "outsider/google-installed-app-gmail-send-oauth-helper/v1",
    evidence: "outsider/google-installed-app-gmail-send-oauth-evidence/v1",
    refreshRecord:
      "outsider/google-installed-app-gmail-send-refresh-keychain-record/v1",
    accessRecord:
      "outsider/google-installed-app-gmail-send-access-keychain-record/v1",
    privateAccess:
      "outsider/google-installed-app-gmail-send-private-access/v1",
  });

export const OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_BOUNDARY
  = Object.freeze({
    oauthProfile: "GOOGLE_INSTALLED_APP_LOOPBACK_PKCE",
    authorizationEndpoint: AUTH_ENDPOINT,
    tokenEndpoint: TOKEN_ENDPOINT,
    callbackBindAddress: "127.0.0.1",
    callbackPortAllocation: "EPHEMERAL",
    pkceMethod: "S256",
    stateRequired: true,
    exactScopes: Object.freeze([SEND_SCOPE]),
    gmailReadonlyRequested: false,
    gmailModifyRequested: false,
    fullMailboxScopeRequested: false,
    includeGrantedScopes: false,
    offlineAccessRequested: true,
    credentialsReadFromKeychain: true,
    clientIdOnlyKeychainRecordSupported: true,
    desktopClientSecretRequired: false,
    refreshTokenWrittenToKeychain: true,
    accessTokenWrittenToKeychain: true,
    tokenProjected: false,
    refreshTokenProjected: false,
    clientIdProjected: false,
    authorizationUrlProjected: false,
    evidenceMode: "0600",
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function clockInstant(state, code) {
  let value;
  try { value = state.clock(); } catch { fail(`${code}_FAILED`); }
  return instant(value, `${code}_INVALID`);
}

function locator(value, code) {
  exact(value, ["service", "account"], code);
  for (const field of ["service", "account"]) {
    if (typeof value[field] !== "string" || value[field].length < 1
      || Buffer.byteLength(value[field], "utf8") > 512
      || /[\u0000\r\n]/u.test(value[field])) fail(code);
  }
  return Object.freeze({ service: value.service, account: value.account });
}

function randomExact(state, length, code) {
  let value;
  try { value = Buffer.from(state.randomBytesImpl(length)); }
  catch { fail(`${code}_UNAVAILABLE`); }
  if (value.length !== length) fail(`${code}_INVALID`);
  return value;
}

function keychainBinding(config) {
  return digest("outsider/google-oauth-keychain-locators/v1", {
    client: config.clientCredentialLocator,
    refresh: config.refreshTokenLocator,
    access: config.accessTokenLocator,
  });
}

async function keychainRead(state, value, code) {
  let secret;
  try { secret = await state.keychainRead(value); }
  catch { fail(`${code}_READ_FAILED`); }
  if (typeof secret !== "string" || secret.length < 1
    || Buffer.byteLength(secret, "utf8") > 128 * 1024) fail(`${code}_INVALID`);
  return secret;
}

async function keychainWrite(state, value, secret, code) {
  if (typeof secret !== "string" || secret.length < 1) fail(`${code}_INVALID`);
  try { await state.keychainWrite({ ...value, secret }); }
  catch { fail(`${code}_WRITE_FAILED`); }
}

function parseClientCredential(raw) {
  let value;
  try { value = JSON.parse(raw); }
  catch {
    const clientId = raw.trim();
    if (clientId !== raw || clientId.length < 10 || clientId.length > 4096
      || /[\u0000\r\n\s]/u.test(clientId)) fail("CLIENT_CREDENTIAL_INVALID");
    return {
      clientId,
      clientSecret: null,
      bindingHash: digest("outsider/google-installed-client-binding/v1", {
        clientId,
        authorizationEndpoint: AUTH_ENDPOINT,
        tokenEndpoint: TOKEN_ENDPOINT,
      }),
    };
  }
  const installed = value?.installed;
  if (installed === null || typeof installed !== "object"
    || Array.isArray(installed) || typeof installed.client_id !== "string"
    || installed.client_id.length < 10 || installed.client_id.length > 4096
    || (installed.client_secret !== undefined
      && (typeof installed.client_secret !== "string"
        || installed.client_secret.length < 1
        || installed.client_secret.length > 4096))
    || (installed.auth_uri !== undefined
      && installed.auth_uri !== AUTH_ENDPOINT)
    || (installed.token_uri !== undefined
      && installed.token_uri !== TOKEN_ENDPOINT)) {
    fail("CLIENT_CREDENTIAL_INVALID");
  }
  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret ?? null,
    bindingHash: digest("outsider/google-installed-client-binding/v1", {
      clientId: installed.client_id,
      authorizationEndpoint: AUTH_ENDPOINT,
      tokenEndpoint: TOKEN_ENDPOINT,
    }),
  };
}

function fsyncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function evidenceHead(state) {
  if (!existsSync(state.evidencePath)) return { count: 0, hash: null };
  const text = readFileSync(state.evidencePath, "utf8");
  if (text.length < 2 || !text.endsWith("\n")) fail("EVIDENCE_PARTIAL");
  const lines = text.slice(0, -1).split("\n");
  let previous = null;
  for (const [index, line] of lines.entries()) {
    let event;
    try { event = JSON.parse(line); } catch { fail("EVIDENCE_JSON_INVALID"); }
    const body = { schema: event.schema, schemaVersion: event.schemaVersion,
      sequence: event.sequence, previousEvidenceHash: event.previousEvidenceHash,
      eventType: event.eventType, scope: event.scope,
      issuedAt: event.issuedAt, expiresAt: event.expiresAt,
      status: event.status, clientBindingHash: event.clientBindingHash,
      keychainBindingHash: event.keychainBindingHash,
      oauthGrantHash: event.oauthGrantHash };
    if (body.schema
        !== OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS.evidence
      || body.schemaVersion !== "1.0.0" || body.sequence !== index + 1
      || body.previousEvidenceHash !== previous || body.scope !== SEND_SCOPE
      || !HASH.test(body.clientBindingHash)
      || !HASH.test(body.keychainBindingHash) || !HASH.test(body.oauthGrantHash)
      || event.evidenceHash !== digest(body.schema, body)) {
      fail("EVIDENCE_CHAIN_INVALID");
    }
    instant(body.issuedAt, "EVIDENCE_ISSUED_AT_INVALID");
    instant(body.expiresAt, "EVIDENCE_EXPIRES_AT_INVALID");
    previous = event.evidenceHash;
  }
  return { count: lines.length, hash: previous };
}

function appendEvidence(state, eventType, token) {
  mkdirSync(state.evidenceDirectory, { recursive: true, mode: 0o700 });
  chmodSync(state.evidenceDirectory, 0o700);
  const head = evidenceHead(state);
  const body = {
    schema: OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS.evidence,
    schemaVersion: "1.0.0",
    sequence: head.count + 1,
    previousEvidenceHash: head.hash,
    eventType,
    scope: SEND_SCOPE,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt,
    status: "STORED_IN_MACOS_KEYCHAIN",
    clientBindingHash: token.clientBindingHash,
    keychainBindingHash: state.keychainBindingHash,
    oauthGrantHash: token.oauthGrantHash,
  };
  const event = { ...body, evidenceHash: digest(body.schema, body) };
  let descriptor;
  try {
    descriptor = openSync(state.evidencePath, "a", 0o600);
    chmodSync(state.evidencePath, 0o600);
    const bytes = Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  fsyncDirectory(state.evidenceDirectory);
  return Object.freeze(event);
}

function stateMatches(expected, actual) {
  if (typeof actual !== "string") return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

async function loopbackAuthorization(state, expectedState) {
  let settle;
  let reject;
  let complete = false;
  const codePromise = new Promise((resolve, rejectPromise) => {
    settle = resolve;
    reject = rejectPromise;
  });
  // The callback can arrive while an injected browser opener is still awaiting
  // its own work. Mark the rejection handled immediately; code() still observes
  // and translates the same rejection when the grant flow reaches it.
  void codePromise.catch(() => undefined);
  const server = createServer((request, response) => {
    if (complete) {
      response.writeHead(410, { "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store" });
      response.end("Authorization callback already consumed.\n");
      return;
    }
    let target;
    try { target = new URL(request.url, "http://127.0.0.1"); }
    catch { target = null; }
    const callbackState = target?.searchParams.get("state");
    const code = target?.searchParams.get("code");
    const error = target?.searchParams.get("error");
    if (request.method !== "GET" || target?.pathname !== CALLBACK_PATH
      || !stateMatches(expectedState, callbackState)) {
      complete = true;
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store" });
      response.end("Authorization callback rejected.\n");
      reject(new Error("STATE_OR_CALLBACK_INVALID"));
      return;
    }
    if (error !== null || typeof code !== "string" || code.length < 1
      || code.length > 8192 || /[\u0000\r\n]/u.test(code)) {
      complete = true;
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store" });
      response.end("Authorization was not completed.\n");
      reject(new Error("AUTHORIZATION_DENIED"));
      return;
    }
    complete = true;
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store" });
    response.end("Gmail send authorization received. You may close this tab.\n");
    settle(code);
  });
  server.on("error", reject);
  await new Promise((resolve, rejectListen) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", rejectListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string"
    || address.address !== "127.0.0.1") {
    server.close();
    fail("LOOPBACK_BINDING_INVALID");
  }
  const timer = setTimeout(() => {
    if (!complete) {
      complete = true;
      reject(new Error("CALLBACK_TIMEOUT"));
    }
  }, state.callbackTimeoutMs);
  return {
    redirectUri: `http://127.0.0.1:${address.port}${CALLBACK_PATH}`,
    async code() {
      try { return await codePromise; }
      catch { fail("AUTHORIZATION_CALLBACK_INVALID"); }
      finally {
        clearTimeout(timer);
        await new Promise((resolve) => server.close(resolve));
      }
    },
    async close() {
      clearTimeout(timer);
      if (server.listening) {
        await new Promise((resolve) => server.close(resolve));
      }
    },
  };
}

function authorizationUrl(client, redirectUri, stateValue, challenge) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SEND_SCOPE);
  url.searchParams.set("state", stateValue);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  return url.toString();
}

async function tokenRequest(state, fields) {
  const body = new URLSearchParams(fields).toString();
  let response;
  try {
    response = await state.tokenRequest(Object.freeze({
      method: "POST",
      url: TOKEN_ENDPOINT,
      headers: Object.freeze({
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      }),
      body: Buffer.from(body, "utf8"),
    }));
  } catch { fail("TOKEN_EXCHANGE_UNAVAILABLE"); }
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status) || response.status !== 200
    || !Buffer.isBuffer(response.body) || response.body.length < 1
    || response.body.length > MAX_TOKEN_RESPONSE_BYTES) {
    fail("TOKEN_EXCHANGE_REJECTED");
  }
  let value;
  try { value = JSON.parse(response.body.toString("utf8")); }
  catch { fail("TOKEN_RESPONSE_INVALID"); }
  if (value === null || typeof value !== "object"
    || typeof value.access_token !== "string" || value.access_token.length < 20
    || value.access_token.length > 16_384 || value.token_type !== "Bearer"
    || !Number.isSafeInteger(value.expires_in) || value.expires_in < 60
    || value.expires_in > 86_400) fail("TOKEN_RESPONSE_INVALID");
  if (value.scope !== undefined) {
    const scopes = value.scope.trim().split(/\s+/u).filter(Boolean);
    if (scopes.length !== 1 || scopes[0] !== SEND_SCOPE) {
      fail("TOKEN_SCOPE_BROADER_THAN_GMAIL_SEND");
    }
  }
  return value;
}

function grantMaterial(state, client, token, refreshToken, eventType) {
  const issuedAt = clockInstant(state, "TOKEN_ISSUED_AT");
  const expiresAt = new Date(Date.parse(issuedAt)
    + token.expires_in * 1000).toISOString();
  const oauthGrantHash = digest("outsider/google-gmail-send-oauth-grant/v1", {
    clientBindingHash: client.bindingHash,
    scope: SEND_SCOPE,
    issuedAt,
    expiresAt,
    occurrenceNonceHash: digest(
      "outsider/google-gmail-send-oauth-grant-occurrence/v1",
      randomExact(state, 32, "GRANT_NONCE").toString("base64")),
  });
  return { eventType, issuedAt, expiresAt, oauthGrantHash,
    clientBindingHash: client.bindingHash, accessToken: token.access_token,
    refreshToken };
}

async function storeGrant(state, material, storeRefresh) {
  if (storeRefresh) {
    const refreshRecord = {
      schema:
        OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS.refreshRecord,
      schemaVersion: "1.0.0",
      scope: SEND_SCOPE,
      clientBindingHash: material.clientBindingHash,
      oauthGrantHash: material.oauthGrantHash,
      storedAt: material.issuedAt,
      refreshToken: material.refreshToken,
    };
    await keychainWrite(state, state.refreshTokenLocator,
      canonicalizeStrict(refreshRecord), "REFRESH_TOKEN_KEYCHAIN");
  }
  const accessRecord = {
    schema:
      OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS.accessRecord,
    schemaVersion: "1.0.0",
    scope: SEND_SCOPE,
    clientBindingHash: material.clientBindingHash,
    oauthGrantHash: material.oauthGrantHash,
    issuedAt: material.issuedAt,
    expiresAt: material.expiresAt,
    tokenType: "Bearer",
    accessToken: material.accessToken,
  };
  await keychainWrite(state, state.accessTokenLocator,
    canonicalizeStrict(accessRecord), "ACCESS_TOKEN_KEYCHAIN");
  const evidence = appendEvidence(state, material.eventType, material);
  const projection = Object.freeze({
    schema: "outsider/google-installed-app-gmail-send-oauth-result/v1",
    schemaVersion: "1.0.0",
    eventType: material.eventType,
    scope: SEND_SCOPE,
    issuedAt: material.issuedAt,
    expiresAt: material.expiresAt,
    status: "STORED_IN_MACOS_KEYCHAIN",
    clientBindingHash: material.clientBindingHash,
    keychainBindingHash: state.keychainBindingHash,
    oauthGrantHash: material.oauthGrantHash,
    evidenceHash: evidence.evidenceHash,
    tokenProjected: false,
    refreshTokenProjected: false,
    clientIdProjected: false,
    authorizationUrlProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
    boundary: OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_BOUNDARY,
  });
  const result = Object.freeze({ publicProjection: projection });
  PRIVATE_RESULTS.set(result, { consumed: false,
    accessToken: material.accessToken, issuedAt: material.issuedAt,
    expiresAt: material.expiresAt,
    oauthGrantHash: material.oauthGrantHash,
    clientBindingHash: material.clientBindingHash });
  return result;
}

function parseRefreshRecord(raw, client) {
  let value;
  try { value = JSON.parse(raw); } catch { fail("REFRESH_RECORD_INVALID"); }
  if (value?.schema
      !== OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS.refreshRecord
    || value.schemaVersion !== "1.0.0" || value.scope !== SEND_SCOPE
    || value.clientBindingHash !== client.bindingHash
    || typeof value.refreshToken !== "string" || value.refreshToken.length < 20
    || value.refreshToken.length > 16_384) fail("REFRESH_RECORD_INVALID");
  return value;
}

/** Create a helper with injected Keychain, browser, exchange, clock and RNG. */
export function createGoogleInstalledAppGmailSendOAuthHelperV1(input = {},
  dependencies = {}) {
  exact(input, ["clientCredentialLocator", "refreshTokenLocator",
    "accessTokenLocator", "evidenceDirectory", "evidenceId",
    "callbackTimeoutMs"], "INPUT_INVALID");
  exact(dependencies, ["keychainRead", "keychainWrite", "openBrowser",
    "tokenRequest", "clock", "randomBytesImpl"], "DEPENDENCIES_INVALID");
  const config = {
    clientCredentialLocator: locator(input.clientCredentialLocator,
      "CLIENT_LOCATOR_INVALID"),
    refreshTokenLocator: locator(input.refreshTokenLocator,
      "REFRESH_LOCATOR_INVALID"),
    accessTokenLocator: locator(input.accessTokenLocator,
      "ACCESS_LOCATOR_INVALID"),
    evidenceDirectory: typeof input.evidenceDirectory === "string"
      && input.evidenceDirectory.length > 0
      ? path.resolve(input.evidenceDirectory) : fail("EVIDENCE_DIRECTORY_INVALID"),
    evidenceId: typeof input.evidenceId === "string"
      && EVIDENCE_ID.test(input.evidenceId)
      ? input.evidenceId : fail("EVIDENCE_ID_INVALID"),
    callbackTimeoutMs: Number.isSafeInteger(input.callbackTimeoutMs)
      && input.callbackTimeoutMs >= 1_000 && input.callbackTimeoutMs <= 600_000
      ? input.callbackTimeoutMs : fail("CALLBACK_TIMEOUT_INVALID"),
  };
  for (const field of ["keychainRead", "keychainWrite", "openBrowser",
    "tokenRequest", "clock", "randomBytesImpl"]) {
    if (typeof dependencies[field] !== "function") fail("DEPENDENCIES_INVALID");
  }
  const state = { ...config, ...dependencies,
    evidencePath: path.join(config.evidenceDirectory,
      `${config.evidenceId}.events.jsonl`),
    keychainBindingHash: keychainBinding(config) };
  const bindingBody = {
    schema: OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS.helper,
    schemaVersion: "1.0.0",
    scope: SEND_SCOPE,
    keychainBindingHash: state.keychainBindingHash,
    evidenceRootRefHash: digest(
      "outsider/google-oauth-evidence-root/v1", config.evidenceDirectory),
    evidenceId: config.evidenceId,
    callbackBindAddress: "127.0.0.1",
    pkceMethod: "S256",
    tokenProjected: false,
  };

  async function grant() {
    const client = parseClientCredential(await keychainRead(state,
      state.clientCredentialLocator, "CLIENT_CREDENTIAL"));
    const verifierBytes = randomExact(state, 64, "PKCE_VERIFIER");
    const stateBytes = randomExact(state, 32, "OAUTH_STATE");
    const verifier = verifierBytes.toString("base64url");
    const stateValue = stateBytes.toString("base64url");
    const challenge = createHash("sha256").update(verifier, "ascii")
      .digest("base64url");
    const loopback = await loopbackAuthorization(state, stateValue);
    try {
      const url = authorizationUrl(client, loopback.redirectUri, stateValue,
        challenge);
      try { await state.openBrowser(url); }
      catch { fail("BROWSER_OPEN_FAILED"); }
      const code = await loopback.code();
      const tokenFields = {
        client_id: client.clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: loopback.redirectUri,
      };
      if (client.clientSecret !== null) {
        tokenFields.client_secret = client.clientSecret;
      }
      const token = await tokenRequest(state, tokenFields);
      if (typeof token.refresh_token !== "string"
        || token.refresh_token.length < 20 || token.refresh_token.length > 16_384) {
        fail("REFRESH_TOKEN_MISSING");
      }
      return storeGrant(state, grantMaterial(state, client, token,
        token.refresh_token, "GRANT_STORED"), true);
    } finally {
      verifierBytes.fill(0);
      stateBytes.fill(0);
      await loopback.close();
    }
  }

  async function refresh() {
    const client = parseClientCredential(await keychainRead(state,
      state.clientCredentialLocator, "CLIENT_CREDENTIAL"));
    const stored = parseRefreshRecord(await keychainRead(state,
      state.refreshTokenLocator, "REFRESH_TOKEN_KEYCHAIN"), client);
    const tokenFields = {
      client_id: client.clientId,
      refresh_token: stored.refreshToken,
      grant_type: "refresh_token",
    };
    if (client.clientSecret !== null) {
      tokenFields.client_secret = client.clientSecret;
    }
    const token = await tokenRequest(state, tokenFields);
    return storeGrant(state, grantMaterial(state, client, token,
      stored.refreshToken, "ACCESS_REFRESHED"), false);
  }

  const helper = Object.freeze({ ...bindingBody,
    helperBindingHash: digest(bindingBody.schema, bindingBody),
    boundary: OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_BOUNDARY,
    grant,
    refresh,
  });
  HELPERS.set(helper, state);
  return helper;
}

export function inspectGoogleInstalledAppGmailSendOAuthHelperV1(helper) {
  if (!HELPERS.has(helper)) fail("HELPER_NOT_FACTORY_ISSUED");
  return helper;
}

/** One-shot private handoff for issuing the Gmail send capability in-process. */
export function claimGoogleInstalledAppGmailSendAccessTokenV1(result) {
  const state = PRIVATE_RESULTS.get(result);
  if (state === undefined || state.consumed) {
    fail("PRIVATE_ACCESS_RESULT_INVALID_OR_REPLAYED");
  }
  state.consumed = true;
  return Object.freeze({
    schema: OUTSIDER_GOOGLE_INSTALLED_APP_GMAIL_SEND_OAUTH_V1_SCHEMAS
      .privateAccess,
    schemaVersion: "1.0.0",
    scope: SEND_SCOPE,
    accessToken: state.accessToken,
    issuedAt: state.issuedAt,
    expiresAt: state.expiresAt,
    oauthGrantHash: state.oauthGrantHash,
    clientBindingHash: state.clientBindingHash,
    publicProjectionPermitted: false,
  });
}
