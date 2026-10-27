#!/usr/bin/env node

/*
 * Supplier-scoped authorization wrapper for the Adafruit contact capture.
 *
 * v2 refuses to start unless an immutable 0600 grant binds the exact private
 * input bytes to Adafruit and the shipping-quote-only purpose. The delegated
 * v1 machine runner remains narrower than the grant: it sends only checkout
 * contact step 1 and cannot submit the address, payment, or order.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, openSync,
  readFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { runAdafruitCheckoutContactCaptureLiveV1 }
  from "./outsider-adafruit-checkout-contact-capture-live-runner-v1.mjs";

const PREFIX = "OUTSIDER_ADAFRUIT_CHECKOUT_CONTACT_CAPTURE_LIVE_RUNNER_V2_";
const GRANT_SCHEMA = "outsider/private-supplier-scoped-shipping-quote-use-grant/v2";
const SUPPLIER = "https://www.adafruit.com";
const PERMITTED = Object.freeze([
  "EMAIL_CHECKOUT_CONTACT",
  "FULL_ADDRESS_SHIPPING_QUOTE",
  "PHONE_SHIPPING_QUOTE",
]);
const FORBIDDEN = Object.freeze([
  "ADDRESS_USE_OUTSIDE_SHIPPING_QUOTE",
  "CROSS_PURPOSE_REUSE",
  "MARKETING_SUBSCRIPTION",
  "ORDER_SUBMISSION",
  "PAYMENT",
  "PII_PUBLIC_PROJECTION",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function privateCanonical(file, code) {
  if (typeof file !== "string" || file === "") fail(`${code}_REQUIRED`);
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 3 || info.size > 64 * 1024) {
    fail(`${code}_NOT_PRIVATE`);
  }
  const bytes = readFileSync(absolute);
  if (bytes.at(-1) !== 0x0a) fail(`${code}_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return { absolute, bytes, bytesHash: bytesHash(bytes), value };
}

function validateGrant(record, inputRecord, observedAt) {
  const value = record.value;
  const fields = ["authorizedAt", "expiresAt", "forbiddenActions",
    "inputBytesHash", "permittedDisclosures", "purpose", "schema",
    "schemaVersion", "supplierOrigin"];
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))
    || value.schema !== GRANT_SCHEMA || value.schemaVersion !== "2.0.0"
    || value.supplierOrigin !== SUPPLIER
    || value.purpose !== "SHIPPING_DELIVERABILITY_AND_TOTAL_QUOTE_ONLY"
    || canonicalizeStrict(value.permittedDisclosures)
      !== canonicalizeStrict(PERMITTED)
    || canonicalizeStrict(value.forbiddenActions)
      !== canonicalizeStrict(FORBIDDEN)
    || value.inputBytesHash !== inputRecord.bytesHash) fail("GRANT_INVALID");
  const authorizedAt = instant(value.authorizedAt, "GRANT_AUTHORIZED_AT");
  const expiresAt = instant(value.expiresAt, "GRANT_EXPIRES_AT");
  if (Date.parse(authorizedAt) > Date.parse(observedAt)
    || Date.parse(observedAt) >= Date.parse(expiresAt)) fail("GRANT_NOT_ACTIVE");
  return Object.freeze({
    grantBytesHash: record.bytesHash,
    supplierOrigin: SUPPLIER,
    purpose: value.purpose,
    permittedDisclosures: PERMITTED,
    forbiddenActions: FORBIDDEN,
    authorizedAt,
    expiresAt,
  });
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(file, 0o600);
  let directory;
  try { directory = openSync(path.dirname(file), "r"); fsyncSync(directory); }
  finally { if (directory !== undefined) closeSync(directory); }
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes) });
}

export async function runAdafruitCheckoutContactCaptureLiveV2(options = {}) {
  const observedAt = instant(options.observedAt ?? new Date().toISOString(),
    "OBSERVED_AT");
  const inputRecord = privateCanonical(options.inputFile, "INPUT_FILE");
  const grantRecord = privateCanonical(options.grantFile, "GRANT_FILE");
  const grant = validateGrant(grantRecord, inputRecord, observedAt);
  const v1 = await runAdafruitCheckoutContactCaptureLiveV1({
    inputFile: inputRecord.absolute,
    privateRoot: options.privateRoot,
    observedAt,
    nonce: options.nonce,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
  const { schema: predecessorSchema, schemaVersion: predecessorVersion,
    projectionHash: predecessorProjectionHash, ...projectionBody } = v1.projection;
  const body = {
    ...projectionBody,
    schema: "outsider/adafruit-checkout-contact-capture-public-projection/v2",
    schemaVersion: "2.0.0",
    schemaLineage: {
      revision: 1,
      predecessorSchema,
      predecessorVersion,
      supersedesProjectionHash: predecessorProjectionHash,
      inPlaceMutationAllowed: false,
    },
    supplierUseGrantRefHash: grant.grantBytesHash,
    supplierUseScope: {
      supplierOrigin: grant.supplierOrigin,
      purpose: grant.purpose,
      permittedDisclosures: grant.permittedDisclosures,
      forbiddenActions: grant.forbiddenActions,
      expiresAt: grant.expiresAt,
    },
  };
  const projection = Object.freeze({ ...body,
    projectionHash: digest(body.schema, body) });
  const publicArtifact = writeOnce(path.join(v1.runDirectory,
    "public-projection.v2.json"), projection);
  const manifestBody = {
    schema: "outsider/private-adafruit-checkout-contact-capture-manifest/v2",
    schemaVersion: "2.0.0",
    schemaLineage: {
      revision: 1,
      predecessorManifestHash: v1.privateManifest.manifestHash,
      supersedesSchema: v1.privateManifest.schema,
      inPlaceMutationAllowed: false,
    },
    observedAt,
    supplierUseGrantBytesHash: grant.grantBytesHash,
    inputBytesHash: inputRecord.bytesHash,
    projectionHash: projection.projectionHash,
    exactSourceArtifactsRemainPrivate0600: true,
    contactSubmitted: projection.contactSubmitted,
    fullAddressSubmitted: false,
    marketingSubscriptionPerformed: false,
    paymentPerformed: false,
    orderSubmitted: false,
  };
  const privateManifest = Object.freeze({ ...manifestBody,
    manifestHash: digest(manifestBody.schema, manifestBody) });
  const privateManifestArtifact = writeOnce(path.join(v1.runDirectory,
    "private-manifest.v2.json"), privateManifest);
  return Object.freeze({ ...v1, projection, publicArtifact,
    privateManifest, privateManifestArtifact, predecessor: v1 });
}

function parseCli(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const known = new Set(["--live-no-payment", "--input", "--grant",
    "--private-root"]);
  const output = { help: false, confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!known.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-no-payment") { output.confirmed = true; continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_VALUE_REQUIRED");
    }
    if (flag === "--input") output.inputFile = value;
    if (flag === "--grant") output.grantFile = value;
    if (flag === "--private-root") output.privateRoot = value;
    index += 1;
  }
  if (!output.confirmed) fail("LIVE_NO_PAYMENT_CONFIRMATION_REQUIRED");
  if (output.inputFile === undefined || output.grantFile === undefined) {
    fail("INPUT_AND_GRANT_REQUIRED");
  }
  return output;
}

async function main(argv) {
  const options = parseCli(argv);
  if (options.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/outsider-adafruit-checkout-contact-capture-live-runner-v2.mjs \\",
      "    --live-no-payment --input MODE_0600_CANONICAL_JSON \\",
      "    --grant MODE_0600_SUPPLIER_SCOPED_GRANT \\",
      "    [--private-root MODE_0700_DIRECTORY]",
      "",
    ].join("\n"));
    return;
  }
  const result = await runAdafruitCheckoutContactCaptureLiveV2(options);
  process.stdout.write(`${canonicalizeStrict({
    runDirectory: result.runDirectory,
    publicProjection: result.projection,
    publicProjectionFile: result.publicArtifact.file,
    privateManifestFile: result.privateManifestArtifact.file,
  })}\n`);
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
