#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createGoogleInstalledAppGmailSendOAuthHelperV1,
} from "../src/outsider-google-installed-app-gmail-send-oauth-v1.js";

const DEFAULTS = Object.freeze({
  clientService: "outsider.google.oauth.installed-client",
  clientAccount: "gmail-send",
  refreshService: "outsider.google.oauth.refresh-token",
  refreshAccount: "gmail-send",
  accessService: "outsider.google.oauth.access-token",
  accessAccount: "gmail-send",
});

function fail(code) {
  const error = new Error(`OUTSIDER_GOOGLE_OAUTH_CLI_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function usage() {
  return [
    "Usage:",
    "  node tools/run-google-installed-app-gmail-send-oauth-v1.mjs grant \\",
    "    --evidence-directory /private/path --evidence-id oauth_<32-hex> [--client-id ID]",
    "  node tools/run-google-installed-app-gmail-send-oauth-v1.mjs refresh \\",
    "    --evidence-directory /private/path --evidence-id oauth_<32-hex>",
    "",
    "--client-id is non-secret; when supplied it is first stored in macOS Keychain.",
    "All token material and any desktop client secret remain in macOS Keychain.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const action = argv[0];
  if (!["grant", "refresh"].includes(action)) fail("ACTION_INVALID");
  const allowed = new Map([
    ["--client-id", "clientId"],
    ["--client-keychain-service", "clientService"],
    ["--client-keychain-account", "clientAccount"],
    ["--refresh-keychain-service", "refreshService"],
    ["--refresh-keychain-account", "refreshAccount"],
    ["--access-keychain-service", "accessService"],
    ["--access-keychain-account", "accessAccount"],
    ["--evidence-directory", "evidenceDirectory"],
    ["--evidence-id", "evidenceId"],
    ["--callback-timeout-ms", "callbackTimeoutMs"],
  ]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const field = allowed.get(argv[index]);
    if (field === undefined || index + 1 >= argv.length
      || argv[index + 1].startsWith("--") || values[field] !== undefined) {
      fail("ARGUMENTS_INVALID");
    }
    values[field] = argv[index + 1];
  }
  for (const [key, value] of Object.entries(DEFAULTS)) values[key] ??= value;
  if (typeof values.evidenceDirectory !== "string"
    || typeof values.evidenceId !== "string") fail("EVIDENCE_ARGUMENTS_REQUIRED");
  values.callbackTimeoutMs = values.callbackTimeoutMs === undefined
    ? 300_000 : Number(values.callbackTimeoutMs);
  if (values.clientId !== undefined
    && (values.clientId.length < 10 || /[\s\u0000]/u.test(values.clientId))) {
    fail("CLIENT_ID_INVALID");
  }
  return { help: false, ...values };
}

function securityRead({ service, account }) {
  const result = spawnSync("/usr/bin/security",
    ["find-generic-password", "-s", service, "-a", account, "-w"], {
      encoding: "utf8", maxBuffer: 256 * 1024,
    });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    fail("KEYCHAIN_READ_FAILED");
  }
  return result.stdout.replace(/\r?\n$/u, "");
}

function securityWrite({ service, account, secret }) {
  const result = spawnSync("/usr/bin/security",
    ["add-generic-password", "-U", "-s", service, "-a", account, "-w"], {
      input: `${secret}\n`, encoding: "utf8", maxBuffer: 256 * 1024,
    });
  if (result.status !== 0) fail("KEYCHAIN_WRITE_FAILED");
}

async function openBrowser(url) {
  await new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/open", [url], {
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve()
      : reject(new Error("open failed")));
  });
}

async function tokenRequest(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal: controller.signal,
    });
    return { status: response.status,
      body: Buffer.from(await response.arrayBuffer()) };
  } finally { clearTimeout(timer); }
}

async function run() {
  const args = parse(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const clientLocator = { service: args.clientService,
    account: args.clientAccount };
  if (args.clientId !== undefined) {
    securityWrite({ ...clientLocator, secret: args.clientId });
  }
  const helper = createGoogleInstalledAppGmailSendOAuthHelperV1({
    clientCredentialLocator: clientLocator,
    refreshTokenLocator: { service: args.refreshService,
      account: args.refreshAccount },
    accessTokenLocator: { service: args.accessService,
      account: args.accessAccount },
    evidenceDirectory: args.evidenceDirectory,
    evidenceId: args.evidenceId,
    callbackTimeoutMs: args.callbackTimeoutMs,
  }, {
    keychainRead: securityRead,
    keychainWrite: securityWrite,
    openBrowser,
    tokenRequest,
    clock: () => new Date().toISOString(),
    randomBytesImpl: (length) => randomBytes(length),
  });
  const result = args.action === "grant"
    ? await helper.grant() : await helper.refresh();
  process.stdout.write(`${canonicalizeStrict(result.publicProjection)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${canonicalizeStrict({
    schema: "outsider/google-installed-app-gmail-send-oauth-error/v1",
    ok: false,
    error: typeof error?.outsiderCode === "string"
      ? error.outsiderCode : "FAILED_CLOSED",
    tokenProjected: false,
    refreshTokenProjected: false,
    clientIdProjected: false,
    authorizationUrlProjected: false,
  })}\n`);
  process.exitCode = 1;
});
