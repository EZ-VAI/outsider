#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  createCloudflareOneUseTenderResponseLinkAccountNativeClientV1,
} from "../src/outsider-cloudflare-one-use-tender-response-link-account-native-client-v1.js";
import {
  createGmailAccountNativeMailboxTransportV1,
  issueGmailSendOAuthCapabilityV1,
} from "../src/outsider-gmail-account-native-mailbox-transport-v1.js";
import {
  runRealTemporarySupplyNetworkGmailCompositionV1,
} from "../src/outsider-real-temporary-supply-network-gmail-composition-v1.js";

const MAX_HTTP_BYTES = 2 * 1024 * 1024;

function usage() {
  return [
    "Usage:",
    "  node tools/run-real-temporary-supply-network-gmail-composition-v1.mjs --input INPUT.json",
    "  node tools/run-real-temporary-supply-network-gmail-composition-v1.mjs --input INPUT.json --live --state-directory PRIVATE_DIR --authority-source AUTHORITY.bin",
    "",
    "Default is DRY_RUN. --live is the only switch that permits external I/O.",
  ].join("\n");
}

function parseArgs(argv) {
  const result = { input: null, live: false, stateDirectory: null,
    authoritySource: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") return { help: true };
    if (value === "--live") { result.live = true; continue; }
    const field = value === "--input" ? "input"
      : value === "--state-directory" ? "stateDirectory"
        : value === "--authority-source" ? "authoritySource" : null;
    if (field === null || index + 1 >= argv.length) throw new Error(
      `ARGUMENT_INVALID:${value}`);
    result[field] = argv[++index];
  }
  if (result.input === null) throw new Error("INPUT_REQUIRED");
  if (result.live && (result.stateDirectory === null
    || result.authoritySource === null)) throw new Error(
    "LIVE_REQUIRES_STATE_DIRECTORY_AND_AUTHORITY_SOURCE");
  return result;
}

function env(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length < 1) {
    throw new Error(`ENV_REQUIRED:${name}`);
  }
  return value;
}

function sha(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function journalId(label) {
  return `journal_${createHash("sha256").update(label, "utf8")
    .digest("hex").slice(0, 32)}`;
}

function requirePrivateFile(file, label) {
  const resolved = path.resolve(file);
  const stat = statSync(resolved);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
    throw new Error(`${label}_MUST_BE_REGULAR_0600_FILE`);
  }
  return resolved;
}

async function boundedFetch(request, allowed) {
  const url = new URL(request.url);
  if (url.protocol !== "https:" || !allowed(url)) {
    throw new Error("OUTBOUND_ORIGIN_NOT_ALLOWED");
  }
  const response = await fetch(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "error",
  });
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_HTTP_BYTES) {
    throw new Error("HTTP_RESPONSE_TOO_LARGE");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 1 || body.length > MAX_HTTP_BYTES) {
    throw new Error("HTTP_RESPONSE_SIZE_INVALID");
  }
  return { status: response.status, body };
}

function dependencies(input, planHash, args) {
  const stateRoot = path.resolve(args.stateDirectory);
  const clock = () => new Date().toISOString();
  const serviceOrigin = env("OUTSIDER_RESPONSE_LINK_SERVICE_ORIGIN");
  const parsedOrigin = new URL(serviceOrigin);
  const sendOAuthCapability = issueGmailSendOAuthCapabilityV1({
    accessToken: env("OUTSIDER_GMAIL_ACCESS_TOKEN"),
    accountRefHash: env("OUTSIDER_GMAIL_ACCOUNT_REF_HASH"),
    oauthGrantHash: env("OUTSIDER_GMAIL_OAUTH_GRANT_HASH"),
    senderAddress: env("OUTSIDER_GMAIL_SENDER_ADDRESS"),
    issuedAt: env("OUTSIDER_GMAIL_OAUTH_ISSUED_AT"),
    expiresAt: env("OUTSIDER_GMAIL_OAUTH_EXPIRES_AT"),
  });
  const authorityBytes = readFileSync(requirePrivateFile(args.authoritySource,
    "AUTHORITY_SOURCE"));
  if (sha(authorityBytes) !== input.contactAuthority.sourceReplayHash) {
    throw new Error("AUTHORITY_SOURCE_HASH_MISMATCH");
  }
  const responseLinkClients = {};
  const gmailTransports = {};
  for (const role of ["primary", "recovery"]) {
    responseLinkClients[role]
      = createCloudflareOneUseTenderResponseLinkAccountNativeClientV1({
        serviceOrigin,
        adminBearerToken: env("OUTSIDER_RESPONSE_LINK_ADMIN_BEARER"),
        tokenMacKey: env("OUTSIDER_RESPONSE_LINK_TOKEN_MAC_KEY"),
        async randomBytesImpl(size) { return randomBytes(size); },
        requestImpl: (request) => boundedFetch(request,
          (url) => url.origin === parsedOrigin.origin),
        clock,
        directory: path.join(stateRoot, "response-links", role),
        journalId: journalId(`${planHash}:response-link:${role}`),
      });
    gmailTransports[role] = createGmailAccountNativeMailboxTransportV1({
      sendOAuthCapability,
      readOAuthCapability: null,
      requestImpl: (request) => boundedFetch(request,
        (url) => url.origin === "https://gmail.googleapis.com"
          && url.pathname === "/gmail/v1/users/me/messages/send"),
      clock,
      directory: path.join(stateRoot, "gmail", role),
      journalId: journalId(`${planHash}:gmail:${role}`),
    });
  }
  return {
    responseLinkClients,
    gmailTransports,
    async revalidateContactAuthority() {
      const evaluatedAt = clock();
      const current = Date.parse(evaluatedAt)
        >= Date.parse(input.contactAuthority.validFrom)
        && Date.parse(evaluatedAt) < Date.parse(input.contactAuthority.validUntil);
      return { decision: current ? "AUTHORIZED" : "REVOKED",
        evaluatedAt, validUntil: current
          ? input.contactAuthority.validUntil : null,
        sourceBytes: Buffer.from(authorityBytes) };
    },
    clock,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(`${usage()}\n`); return; }
  const inputPath = args.live ? requirePrivateFile(args.input, "LIVE_INPUT")
    : path.resolve(args.input);
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const dry = await runRealTemporarySupplyNetworkGmailCompositionV1(input, {},
    { mode: "DRY_RUN" });
  const result = args.live
    ? await runRealTemporarySupplyNetworkGmailCompositionV1(input,
      dependencies(input, dry.planHash, args), { mode: "LIVE" })
    : dry;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message
    : "UNTRUSTED_FAILURE"}\n`);
  process.exitCode = 1;
});

