#!/usr/bin/env node

/*
 * Reissue an expired shipping-quote-only private input/grant pair without
 * printing or retyping destination/contact data. Frozen predecessors remain
 * untouched. A separate owner-only lineage record links predecessor and
 * descendant byte hashes.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";

const PREFIX = "OUTSIDER_PRIVATE_SHIPPING_QUOTE_GRANT_REISSUE_V3_";
const INPUT_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-request/v1";
const GRANT_SCHEMA
  = "outsider/private-supplier-scoped-shipping-quote-use-grant/v2";
const LINEAGE_SCHEMA
  = "outsider/private-supplier-scoped-shipping-quote-reissue-lineage/v3";

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function privateCanonical(file, code) {
  const absolute = path.resolve(file ?? "");
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 3
    || info.size > 64 * 1024) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return { absolute, bytes, bytesHash: hash(bytes), value };
}

function ensurePrivateParent(file) {
  const directory = path.dirname(path.resolve(file));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("OUTPUT_DIRECTORY_NOT_PRIVATE");
  return directory;
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, value) {
  const absolute = path.resolve(file ?? "");
  const directory = ensurePrivateParent(absolute);
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(absolute, 0o600);
  let directoryDescriptor;
  try { directoryDescriptor = openSync(directory, "r");
    fsyncSync(directoryDescriptor); }
  finally { if (directoryDescriptor !== undefined) closeSync(directoryDescriptor); }
  return { absolute, bytes, bytesHash: hash(bytes) };
}

function argumentsFrom(argv) {
  const names = new Set(["--input-predecessor", "--grant-predecessor",
    "--output-input", "--output-grant", "--output-lineage",
    "--authorized-at", "--expires-at"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!names.has(name) || value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_INVALID");
    }
    result[name.slice(2)] = value;
  }
  if ([...names].some((name) => result[name.slice(2)] === undefined)) {
    fail("ARGUMENT_MISSING");
  }
  return result;
}

function main(argv) {
  const args = argumentsFrom(argv);
  const previousInput = privateCanonical(args["input-predecessor"],
    "INPUT_PREDECESSOR");
  const previousGrant = privateCanonical(args["grant-predecessor"],
    "GRANT_PREDECESSOR");
  if (previousInput.value.schema !== INPUT_SCHEMA
    || previousInput.value.schemaVersion !== "1.0.0"
    || previousInput.value.paymentAuthorized !== false
    || previousInput.value.orderAuthorized !== false
    || previousGrant.value.schema !== GRANT_SCHEMA
    || previousGrant.value.schemaVersion !== "2.0.0"
    || previousGrant.value.inputBytesHash !== previousInput.bytesHash
    || previousGrant.value.purpose
      !== "SHIPPING_DELIVERABILITY_AND_TOTAL_QUOTE_ONLY") {
    fail("PREDECESSOR_BINDING_INVALID");
  }
  const authorizedAt = instant(args["authorized-at"], "AUTHORIZED_AT_INVALID");
  const expiresAt = instant(args["expires-at"], "EXPIRES_AT_INVALID");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)
    || Date.parse(expiresAt)
      >= Date.parse(previousInput.value.completionDeadline)) {
    fail("DESCENDANT_INTERVAL_INVALID");
  }
  const nextInputValue = { ...previousInput.value, formationExpiresAt: expiresAt };
  const nextInput = writeOnce(args["output-input"], nextInputValue);
  const nextGrantValue = {
    ...previousGrant.value,
    authorizedAt,
    expiresAt,
    inputBytesHash: nextInput.bytesHash,
  };
  const nextGrant = writeOnce(args["output-grant"], nextGrantValue);
  const lineage = writeOnce(args["output-lineage"], {
    schema: LINEAGE_SCHEMA,
    schemaVersion: "3.0.0",
    reissuedAt: authorizedAt,
    expiresAt,
    reason: "EXPIRED_PREDECESSOR_REISSUED_AFTER_FRESH_USER_AUTHORIZATION",
    supplierOrigin: previousGrant.value.supplierOrigin,
    purpose: previousGrant.value.purpose,
    predecessor: {
      inputBytesHash: previousInput.bytesHash,
      grantBytesHash: previousGrant.bytesHash,
    },
    descendant: {
      inputBytesHash: nextInput.bytesHash,
      grantBytesHash: nextGrant.bytesHash,
    },
    frozenPredecessorsOverwritten: false,
    rawPrivateInputProjected: false,
  });
  process.stdout.write(`${canonicalizeStrict({
    schema: LINEAGE_SCHEMA,
    inputFile: nextInput.absolute,
    grantFile: nextGrant.absolute,
    lineageFile: lineage.absolute,
    inputBytes: nextInput.bytes.length,
    grantBytes: nextGrant.bytes.length,
    lineageBytes: lineage.bytes.length,
    expiresAt,
    fileMode: "0600",
    directoryMode: "0700",
    frozenPredecessorsOverwritten: false,
    privateValuesPrinted: false,
  })}\n`);
}

try { main(process.argv.slice(2)); }
catch (error) {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exitCode = 1;
}
