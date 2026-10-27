#!/usr/bin/env node

/*
 * Create a fresh one-use v6 residual grant for a verified post-contact v5
 * Attempt. The input bytes are hashed but never parsed or printed here.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createAdafruitAddressQuoteResidualGrantValueV6,
} from "./outsider-adafruit-address-quote-resume-live-runner-v6.mjs";

const PREFIX
  = "OUTSIDER_ADAFRUIT_ADDRESS_QUOTE_RESIDUAL_GRANT_REISSUE_V6_";
const PROJECTION_SCHEMA
  = "outsider/adafruit-full-address-shipping-quote-public-projection/v5";
const MANIFEST_SCHEMA
  = "outsider/private-adafruit-full-address-shipping-quote-manifest/v5";

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return hash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function privateBytes(file, code, maximum) {
  const absolute = path.resolve(file ?? "");
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 2
    || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
  return Object.freeze({ absolute, bytes: readFileSync(absolute) });
}

function canonical(file, code) {
  const record = privateBytes(file, code, 2 * 1024 * 1024);
  const source = record.bytes.toString("utf8");
  let value;
  try { value = JSON.parse(source); } catch { fail(`${code}_JSON_INVALID`); }
  const trailing = source.endsWith("\n") ? "\n" : "";
  if (`${canonicalizeStrict(value)}${trailing}` !== source) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return Object.freeze({ ...record, value, bytesHash: hash(record.bytes) });
}

function sealed(record, schema, field, code) {
  if (record.value?.schema !== schema) fail(`${code}_SCHEMA_INVALID`);
  const { [field]: claimed, ...body } = record.value;
  if (claimed !== digest(schema, body)) fail(`${code}_HASH_INVALID`);
  return claimed;
}

function ensureParent(file) {
  const directory = path.dirname(path.resolve(file));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("OUTPUT_DIRECTORY_INVALID");
  return directory;
}

function writeOnce(file, value) {
  const absolute = path.resolve(file ?? "");
  const directory = ensureParent(absolute);
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(absolute, 0o600);
  let directoryDescriptor;
  try { directoryDescriptor = openSync(directory, "r");
    fsyncSync(directoryDescriptor); }
  finally { if (directoryDescriptor !== undefined) closeSync(directoryDescriptor); }
  return Object.freeze({ absolute, bytes: bytes.length, bytesHash: hash(bytes) });
}

export function reissueAdafruitAddressQuoteResidualGrantV6(options = {}) {
  const priorDirectory = path.resolve(options.priorRunDirectory ?? "");
  const info = lstatSync(priorDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("PRIOR_RUN_INVALID");
  const projection = canonical(path.join(priorDirectory,
    "public-projection.v5.json"), "PRIOR_PROJECTION");
  const manifest = canonical(path.join(priorDirectory,
    "private-manifest.v5.json"), "PRIOR_MANIFEST");
  const projectionHash = sealed(projection, PROJECTION_SCHEMA,
    "projectionHash", "PRIOR_PROJECTION");
  const manifestHash = sealed(manifest, MANIFEST_SCHEMA,
    "manifestHash", "PRIOR_MANIFEST");
  const input = privateBytes(options.inputFile, "INPUT", 64 * 1024);
  const inputBytesHash = hash(input.bytes);
  if (manifest.value.projectionHash !== projectionHash
    || manifest.value.inputBytesHash !== inputBytesHash
    || projection.value.contactSubmitted !== true
    || projection.value.counters?.contactPostCount !== 1
    || projection.value.counters?.addressQuotePostCount !== 0
    || projection.value.paymentPerformed !== false
    || projection.value.orderSubmitted !== false
    || projection.value.marketingSubscriptionPerformed !== false
    || projection.value.exactSpecEvaluation?.accepted !== true
    || projection.value.nextGate !== "ADDRESS_FORM_NOT_AVAILABLE") {
    fail("PRIOR_NOT_RESUMABLE");
  }
  const value = createAdafruitAddressQuoteResidualGrantValueV6({
    priorProjectionHash: projectionHash,
    priorManifestHash: manifestHash,
    inputBytesHash,
    authorizedAt: options.authorizedAt,
    expiresAt: options.expiresAt,
  });
  const output = writeOnce(options.outputGrantFile, value);
  return Object.freeze({ output, projectionHash, manifestHash,
    inputBytesHash, privateValuesPrinted: false });
}

function parse(argv) {
  const allowed = new Set(["--prior-run", "--input", "--output-grant",
    "--authorized-at", "--expires-at"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_INVALID");
    }
    result[flag.slice(2).replaceAll("-", "_")] = value;
  }
  if ([...allowed].some((flag) =>
    result[flag.slice(2).replaceAll("-", "_")] === undefined)) {
    fail("ARGUMENT_MISSING");
  }
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parse(process.argv.slice(2));
    const result = reissueAdafruitAddressQuoteResidualGrantV6({
      priorRunDirectory: args.prior_run,
      inputFile: args.input,
      outputGrantFile: args.output_grant,
      authorizedAt: args.authorized_at,
      expiresAt: args.expires_at,
    });
    process.stdout.write(`${canonicalizeStrict({
      grantFile: result.output.absolute,
      grantBytes: result.output.bytes,
      grantBytesHash: result.output.bytesHash,
      projectionHash: result.projectionHash,
      manifestHash: result.manifestHash,
      inputBytesHash: result.inputBytesHash,
      fileMode: "0600",
      privateValuesPrinted: false,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
