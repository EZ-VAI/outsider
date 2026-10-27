#!/usr/bin/env node

/*
 * Real $0 CONTROLLED_CHANNEL_READINESS smoke for the Cloudflare one-use
 * tender response link. This contacts only the configured Outsider service;
 * it never contacts a seller, submits an OFFER, or performs payment.
 */

import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createCloudflareOneUseTenderResponseLinkAccountNativeClientV1,
} from "../src/outsider-cloudflare-one-use-tender-response-link-account-native-client-v1.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const JOURNAL_ID = /^journal_[a-f0-9]{32}$/u;
const MAX_PUBLIC_RESPONSE_BYTES = 2 * 1024 * 1024;
const TITLE = "CONTROLLED_CHANNEL_READINESS — $0 response-link smoke";
const ADMIN_ENV
  = "OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ADMIN_BEARER_TOKEN";
const MAC_ENV = "OUTSIDER_CLOUDFLARE_RESPONSE_LINK_TOKEN_MAC_KEY";

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fail(code) {
  const error = new Error(`OUTSIDER_RESPONSE_LINK_PRODUCTION_SMOKE_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function usage() {
  return [
    "Usage:",
    "  node tools/run-cloudflare-one-use-tender-response-link-production-smoke-v1.mjs \\",
    "    --service-origin https://<worker-host> \\",
    "    --journal-directory /private/path \\",
    "    --journal-id journal_<32-lowercase-hex>",
    "",
    "Non-secret values may alternatively use:",
    "  OUTSIDER_RESPONSE_LINK_SERVICE_ORIGIN",
    "  OUTSIDER_RESPONSE_LINK_JOURNAL_DIRECTORY",
    "  OUTSIDER_RESPONSE_LINK_JOURNAL_ID",
    "",
    "Secrets are accepted only from:",
    `  ${ADMIN_ENV}`,
    `  ${MAC_ENV}`,
  ].join("\n");
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { help: true };
    const names = new Map([
      ["--service-origin", "serviceOrigin"],
      ["--journal-directory", "journalDirectory"],
      ["--journal-id", "journalId"],
    ]);
    const name = names.get(argument);
    if (name === undefined || index + 1 >= argv.length
      || argv[index + 1].startsWith("--") || values[name] !== undefined) {
      fail("ARGUMENTS_INVALID");
    }
    values[name] = argv[index + 1];
    index += 1;
  }
  return {
    help: false,
    serviceOrigin: values.serviceOrigin
      ?? process.env.OUTSIDER_RESPONSE_LINK_SERVICE_ORIGIN,
    journalDirectory: values.journalDirectory
      ?? process.env.OUTSIDER_RESPONSE_LINK_JOURNAL_DIRECTORY,
    journalId: values.journalId
      ?? process.env.OUTSIDER_RESPONSE_LINK_JOURNAL_ID,
  };
}

function validateConfig(parsed) {
  let origin;
  try { origin = new URL(parsed.serviceOrigin); }
  catch { fail("SERVICE_ORIGIN_INVALID"); }
  if (origin.protocol !== "https:" || origin.username !== ""
    || origin.password !== "" || origin.pathname !== "/"
    || origin.search !== "" || origin.hash !== "") {
    fail("SERVICE_ORIGIN_INVALID");
  }
  if (typeof parsed.journalDirectory !== "string"
    || parsed.journalDirectory.length < 1
    || typeof parsed.journalId !== "string"
    || !JOURNAL_ID.test(parsed.journalId)) fail("JOURNAL_CONFIG_INVALID");
  const adminBearerToken = process.env[ADMIN_ENV];
  const tokenMacKey = process.env[MAC_ENV];
  if (typeof adminBearerToken !== "string"
    || Buffer.byteLength(adminBearerToken, "utf8") < 32
    || Buffer.byteLength(adminBearerToken, "utf8") > 512
    || typeof tokenMacKey !== "string"
    || Buffer.byteLength(tokenMacKey, "utf8") < 32
    || Buffer.byteLength(tokenMacKey, "utf8") > 512) {
    fail("SECRET_ENV_MISSING_OR_INVALID");
  }
  return {
    serviceOrigin: origin.origin,
    journalDirectory: path.resolve(parsed.journalDirectory),
    journalId: parsed.journalId,
    adminBearerToken,
    tokenMacKey,
  };
}

async function exactFetch(request, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal: controller.signal,
    });
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length < 1 || body.length > MAX_PUBLIC_RESPONSE_BYTES) {
      fail("HTTP_RESPONSE_SIZE_INVALID");
    }
    return { status: response.status, body };
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail("HTTPS_REQUEST_UNAVAILABLE");
  } finally { clearTimeout(timer); }
}

function fsyncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function readEvidenceHead(evidencePath) {
  let text;
  try { text = readFileSync(evidencePath, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return { count: 0, headHash: null };
    throw error;
  }
  if (!text.endsWith("\n")) fail("PUBLIC_EVIDENCE_PARTIAL");
  const lines = text.slice(0, -1).split("\n");
  let previous = null;
  for (const [index, line] of lines.entries()) {
    let event;
    try { event = JSON.parse(line); } catch { fail("PUBLIC_EVIDENCE_INVALID"); }
    const body = { schema: event.schema, schemaVersion: event.schemaVersion,
      ordinal: event.ordinal, phase: event.phase, observedAt: event.observedAt,
      status: event.status, responseByteLength: event.responseByteLength,
      responseHash: event.responseHash,
      responseBodyBase64: event.responseBodyBase64,
      previousEvidenceHash: event.previousEvidenceHash };
    if (body.schema
        !== "outsider/controlled-channel-public-get-evidence/v1"
      || body.schemaVersion !== "1.0.0" || body.ordinal !== index + 1
      || body.previousEvidenceHash !== previous
      || !HASH.test(body.responseHash)
      || Buffer.from(body.responseBodyBase64, "base64").length
        !== body.responseByteLength
      || bytesHash(Buffer.from(body.responseBodyBase64, "base64"))
        !== body.responseHash
      || event.evidenceHash !== digest(body.schema, body)) {
      fail("PUBLIC_EVIDENCE_INVALID");
    }
    previous = event.evidenceHash;
  }
  return { count: lines.length, headHash: previous };
}

function appendPublicGetEvidence(config, phase, response) {
  mkdirSync(config.journalDirectory, { recursive: true, mode: 0o700 });
  chmodSync(config.journalDirectory, 0o700);
  const evidencePath = path.join(config.journalDirectory,
    `${config.journalId}.public-get-evidence.jsonl`);
  const head = readEvidenceHead(evidencePath);
  const body = {
    schema: "outsider/controlled-channel-public-get-evidence/v1",
    schemaVersion: "1.0.0",
    ordinal: head.count + 1,
    phase,
    observedAt: new Date().toISOString(),
    status: response.status,
    responseByteLength: response.body.length,
    responseHash: bytesHash(response.body),
    responseBodyBase64: response.body.toString("base64"),
    previousEvidenceHash: head.headHash,
  };
  const event = { ...body, evidenceHash: digest(body.schema, body) };
  let descriptor;
  try {
    descriptor = openSync(evidencePath, "a", 0o600);
    chmodSync(evidencePath, 0o600);
    const bytes = Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  fsyncDirectory(config.journalDirectory);
  return { phase, status: response.status,
    responseByteLength: response.body.length,
    responseHash: body.responseHash, evidenceHash: event.evidenceHash };
}

function controlledDefinition(nowMs) {
  const issuedAt = new Date(nowMs - 60_000).toISOString();
  const expiresAt = new Date(nowMs + 10 * 60_000).toISOString();
  const dueBy = new Date(nowMs + 20 * 60_000).toISOString();
  const responsibilityTermsText
    = "CONTROLLED_CHANNEL_READINESS only. No supplier commitment, capacity, payment, or outcome is requested.";
  return {
    tenderHash: `sha256:${randomBytes(32).toString("hex")}`,
    requirementKind: "RESOURCE",
    requirementId: `resource_${randomBytes(16).toString("hex")}`,
    issuedAt,
    expiresAt,
    summary: {
      title: TITLE,
      outcome: "Verify the registration-free one-use response channel opens and closes correctly.",
      quantity: "1 controlled $0 channel check",
      dueBy,
      supplierInstructions:
        "Controlled readiness only. Do not submit an offer or contact any party.",
    },
    acceptedCurrencyCodes: ["USD"],
    responsibilityTermsText,
    responsibilityTermsHash: bytesHash(Buffer.from(
      responsibilityTermsText, "utf8")),
  };
}

async function publicGet(privateSellerRoute) {
  return exactFetch({ method: "GET",
    url: privateSellerRoute.sellerResponseUrl,
    headers: Object.freeze({ accept: "text/html, text/plain;q=0.9" }),
    body: null });
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const config = validateConfig(parsed);
  const definition = controlledDefinition(Date.now());
  const client = createCloudflareOneUseTenderResponseLinkAccountNativeClientV1({
    serviceOrigin: config.serviceOrigin,
    adminBearerToken: config.adminBearerToken,
    tokenMacKey: config.tokenMacKey,
    randomBytesImpl: async (count) => randomBytes(count),
    requestImpl: exactFetch,
    clock: () => new Date().toISOString(),
    directory: config.journalDirectory,
    journalId: config.journalId,
  });

  const initialized = await client.initializeExact({ definition });
  if (initialized.publicProjection.state !== "LINK_INITIALIZED_HOLD") {
    fail("INITIALIZE_NOT_CONFIRMED");
  }
  const privateSellerRoute = client.privateSellerRouteExact({
    expectedTenderHash: definition.tenderHash,
  });

  const opened = await publicGet(privateSellerRoute);
  if (opened.status !== 200
    || !opened.body.toString("utf8").includes(TITLE)) {
    fail("PUBLIC_LINK_NOT_READY");
  }
  const openedEvidence = appendPublicGetEvidence(config,
    "BEFORE_REVOKE", opened);

  const source = await client.pollSourceExact({
    expectedTenderHash: definition.tenderHash,
  });
  if (source.publicProjection.state !== "AWAITING_RESPONSE_HOLD"
    || source.publicProjection.declaredChoice !== undefined) {
    fail("SOURCE_NOT_EMPTY_AWAITING_RESPONSE");
  }

  const revoked = await client.revokeExact({
    expectedTenderHash: definition.tenderHash,
    reasonCode: "REQUESTER_REVOKED",
  });
  if (revoked.publicProjection.state !== "LINK_REVOKED_HOLD") {
    fail("REVOKE_NOT_CONFIRMED");
  }

  const closed = await publicGet(privateSellerRoute);
  if (closed.status !== 410
    || !/Link revoked/iu.test(closed.body.toString("utf8"))) {
    fail("PUBLIC_LINK_NOT_CLOSED");
  }
  const closedEvidence = appendPublicGetEvidence(config,
    "AFTER_REVOKE", closed);
  const evidenceHead = readEvidenceHead(path.join(config.journalDirectory,
    `${config.journalId}.public-get-evidence.jsonl`));

  const summary = {
    schema: "outsider/controlled-channel-readiness-smoke-summary/v1",
    schemaVersion: "1.0.0",
    mode: "CONTROLLED_CHANNEL_READINESS",
    cost: { currencyCode: "USD", totalMinorUnits: 0 },
    tenderHash: definition.tenderHash,
    initializeState: initialized.publicProjection.state,
    sourceState: source.publicProjection.state,
    revokeState: revoked.publicProjection.state,
    publicGetCount: 2,
    publicGets: [openedEvidence, closedEvidence],
    privateEvidenceOccurrenceCount: evidenceHead.count,
    privateEvidenceHeadHash: evidenceHead.headHash,
    sellerContactCount: 0,
    offerSubmitted: false,
    paymentPerformed: false,
    outcomeEstablished: false,
    rawResponseTokenProjected: false,
    sellerUrlProjected: false,
    secretProjected: false,
    decisionState: "HOLD",
  };
  process.stdout.write(`${canonicalizeStrict({ ...summary,
    summaryHash: digest(summary.schema, summary) })}\n`);
}

run().catch((error) => {
  const code = typeof error?.outsiderCode === "string"
    ? error.outsiderCode : "FAILED_CLOSED";
  process.stderr.write(`${canonicalizeStrict({
    schema: "outsider/controlled-channel-readiness-smoke-error/v1",
    ok: false,
    error: code,
    rawResponseTokenProjected: false,
    sellerUrlProjected: false,
    secretProjected: false,
  })}\n`);
  process.exitCode = 1;
});
