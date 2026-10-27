import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimGoogleInstalledAppGmailSendAccessTokenV1,
  createGoogleInstalledAppGmailSendOAuthHelperV1,
} from "../src/outsider-google-installed-app-gmail-send-oauth-v1.js";

const CLIENT_ID
  = "1234567890-example.apps.googleusercontent.com";
const ACCESS = "private-google-access-token-0123456789";
const REFRESH = "private-google-refresh-token-0123456789";
const SCOPE = "https://www.googleapis.com/auth/gmail.send";

function root(t) {
  const value = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-google-oauth-v1-")));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function key(locator) {
  return `${locator.service}\0${locator.account}`;
}

function fixture(t, overrides = {}) {
  const directory = root(t);
  const locators = {
    client: { service: "test.google.client", account: "gmail-send" },
    refresh: { service: "test.google.refresh", account: "gmail-send" },
    access: { service: "test.google.access", account: "gmail-send" },
  };
  const keychain = new Map([[key(locators.client), CLIENT_ID]]);
  const writes = [];
  let randomCall = 0;
  const dependencies = {
    async keychainRead(locator) {
      if (!keychain.has(key(locator))) throw new Error("missing");
      return keychain.get(key(locator));
    },
    async keychainWrite(input) {
      writes.push(input);
      keychain.set(key(input), input.secret);
    },
    async openBrowser() { throw new Error("replace in test"); },
    async tokenRequest() { throw new Error("replace in test"); },
    clock: () => "2099-01-01T00:10:00.000Z",
    randomBytesImpl(length) {
      randomCall += 1;
      return Buffer.alloc(length, 0x20 + randomCall);
    },
    ...overrides,
  };
  const helper = createGoogleInstalledAppGmailSendOAuthHelperV1({
    clientCredentialLocator: locators.client,
    refreshTokenLocator: locators.refresh,
    accessTokenLocator: locators.access,
    evidenceDirectory: directory,
    evidenceId: "oauth_0123456789abcdef0123456789abcdef",
    callbackTimeoutMs: 5_000,
  }, dependencies);
  return { helper, directory, keychain, writes, locators, dependencies };
}

test("grant uses PKCE S256, exact state and client-id-only Keychain credential without projecting secrets",
  async (t) => {
    let authorization;
    const tokenRequests = [];
    const context = fixture(t, {
      async openBrowser(rawUrl) {
        authorization = new URL(rawUrl);
        const callback = new URL(authorization.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", "one-use-authorization-code");
        callback.searchParams.set("state", authorization.searchParams.get("state"));
        const response = await fetch(callback);
        assert.equal(response.status, 200);
      },
      async tokenRequest(request) {
        tokenRequests.push(request);
        return { status: 200, body: Buffer.from(JSON.stringify({
          access_token: ACCESS,
          refresh_token: REFRESH,
          expires_in: 3600,
          token_type: "Bearer",
          scope: SCOPE,
        }), "utf8") };
      },
    });
    const result = await context.helper.grant();
    assert.equal(authorization.origin, "https://accounts.google.com");
    assert.equal(authorization.searchParams.get("scope"), SCOPE);
    assert.equal(authorization.searchParams.get("code_challenge_method"),
      "S256");
    assert.equal(authorization.searchParams.get("include_granted_scopes"),
      "false");
    assert.equal(authorization.searchParams.get("access_type"), "offline");
    assert.match(authorization.searchParams.get("redirect_uri"),
      /^http:\/\/127\.0\.0\.1:\d+\/oauth2\/callback$/u);
    const form = new URLSearchParams(tokenRequests[0].body.toString("utf8"));
    const expectedChallenge = createHash("sha256")
      .update(form.get("code_verifier"), "ascii").digest("base64url");
    assert.equal(authorization.searchParams.get("code_challenge"),
      expectedChallenge);
    assert.equal(form.get("client_id"), CLIENT_ID);
    assert.equal(form.has("client_secret"), false);
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(context.writes.length, 2);
    assert.equal(JSON.parse(context.keychain.get(key(context.locators.refresh)))
      .refreshToken, REFRESH);
    assert.equal(JSON.parse(context.keychain.get(key(context.locators.access)))
      .accessToken, ACCESS);
    const evidencePath = path.join(context.directory,
      "oauth_0123456789abcdef0123456789abcdef.events.jsonl");
    assert.equal(statSync(evidencePath).mode & 0o777, 0o600);
    const publicText = JSON.stringify(result);
    const evidenceText = readFileSync(evidencePath, "utf8");
    for (const privateValue of [ACCESS, REFRESH, CLIENT_ID,
      authorization.toString()]) {
      assert.equal(publicText.includes(privateValue), false, privateValue);
      assert.equal(evidenceText.includes(privateValue), false, privateValue);
    }
    assert.equal(result.publicProjection.scope, SCOPE);
    const privateAccess = claimGoogleInstalledAppGmailSendAccessTokenV1(result);
    assert.equal(privateAccess.accessToken, ACCESS);
    assert.throws(() => claimGoogleInstalledAppGmailSendAccessTokenV1(result),
      /INVALID_OR_REPLAYED/u);
  });

test("state mismatch stops before token exchange or Keychain token writes",
  async (t) => {
    let exchanges = 0;
    const context = fixture(t, {
      async openBrowser(rawUrl) {
        const authorization = new URL(rawUrl);
        const callback = new URL(authorization.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", "attacker-code");
        callback.searchParams.set("state", "wrong-state");
        const response = await fetch(callback);
        assert.equal(response.status, 400);
      },
      async tokenRequest() { exchanges += 1; throw new Error("not called"); },
    });
    await assert.rejects(context.helper.grant(),
      /AUTHORIZATION_CALLBACK_INVALID/u);
    assert.equal(exchanges, 0);
    assert.equal(context.writes.length, 0);
  });

test("refresh reads the bound refresh record, requests only gmail.send and updates access Keychain",
  async (t) => {
    // Obtain the exact binding through one successful grant, then refresh.
    let auth;
    const grantContext = fixture(t, {
      async openBrowser(rawUrl) {
        auth = new URL(rawUrl);
        const callback = new URL(auth.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", "grant-code-for-refresh-test");
        callback.searchParams.set("state", auth.searchParams.get("state"));
        await fetch(callback);
      },
      async tokenRequest() {
        return { status: 200, body: Buffer.from(JSON.stringify({
          access_token: ACCESS, refresh_token: REFRESH,
          expires_in: 3600, token_type: "Bearer", scope: SCOPE,
        })) };
      },
    });
    await grantContext.helper.grant();
    let refreshForm;
    const refreshedAccess = "private-refreshed-access-token-0123456789";
    const helper = createGoogleInstalledAppGmailSendOAuthHelperV1({
      clientCredentialLocator: grantContext.locators.client,
      refreshTokenLocator: grantContext.locators.refresh,
      accessTokenLocator: grantContext.locators.access,
      evidenceDirectory: grantContext.directory,
      evidenceId: "oauth_0123456789abcdef0123456789abcdef",
      callbackTimeoutMs: 5_000,
    }, {
      async keychainRead(locator) {
        return grantContext.keychain.get(key(locator));
      },
      async keychainWrite(input) {
        grantContext.writes.push(input);
        grantContext.keychain.set(key(input), input.secret);
      },
      async openBrowser() { throw new Error("not called"); },
      async tokenRequest(request) {
        refreshForm = new URLSearchParams(request.body.toString("utf8"));
        return { status: 200, body: Buffer.from(JSON.stringify({
          access_token: refreshedAccess,
          expires_in: 1800,
          token_type: "Bearer",
          scope: SCOPE,
        })) };
      },
      clock: () => "2099-01-01T00:20:00.000Z",
      randomBytesImpl: (length) => Buffer.alloc(length, 0x55),
    });
    const result = await helper.refresh();
    assert.equal(refreshForm.get("grant_type"), "refresh_token");
    assert.equal(refreshForm.get("refresh_token"), REFRESH);
    assert.equal(refreshForm.has("client_secret"), false);
    assert.equal(JSON.parse(grantContext.keychain.get(
      key(grantContext.locators.access))).accessToken, refreshedAccess);
    assert.equal(JSON.stringify(result).includes(refreshedAccess), false);
    assert.equal(result.publicProjection.eventType, "ACCESS_REFRESHED");
  });
