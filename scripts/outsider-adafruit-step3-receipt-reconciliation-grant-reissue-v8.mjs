#!/usr/bin/env node

/* Issue a fresh one-use v8 grant bound to the consumed v7 read attempt. */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createAdafruitStep3ReceiptReconciliationGrantValueV8,
  inspectAdafruitStep3ReceiptRecoveryAttemptV8,
} from "./outsider-adafruit-step3-receipt-reconcile-live-runner-v8.mjs";

const PREFIX
  = "OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_REISSUE_V8_";

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function writeOnce(file, value) {
  const absolute = path.resolve(file ?? "");
  const directory = path.dirname(absolute);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const directoryInfo = lstatSync(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()
    || (directoryInfo.mode & 0o777) !== 0o700) fail("OUTPUT_DIRECTORY_INVALID");
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
  return Object.freeze({ absolute, bytes: bytes.length,
    bytesHash: hash(bytes) });
}

export function reissueAdafruitStep3ReceiptReconciliationGrantV8(
  options = {}) {
  const context = inspectAdafruitStep3ReceiptRecoveryAttemptV8(options);
  const value = createAdafruitStep3ReceiptReconciliationGrantValueV8({
    priorProjectionHash: context.base.prior.projection.projectionHash,
    priorManifestHash: context.base.prior.manifest.manifestHash,
    inputBytesHash: context.base.inputRecord.bytesHash,
    priorV6PartialTreeHash: context.base.partial.partialTreeHash,
    priorV7GrantBytesHash: context.grantRecord.bytesHash,
    priorV7UseBytesHash: context.useRecord.bytesHash,
    partialV7TreeHash: context.partialV7TreeHash,
    partialV7CookieBytesHash: context.cookie.bytesHash,
    authorizedAt: options.authorizedAt,
    expiresAt: options.expiresAt,
  });
  if (Date.parse(value.authorizedAt) < Date.parse(context.use.observedAt)
    || Date.parse(value.expiresAt)
      > Date.parse(context.base.prior.projection.completionDeadline)) {
    fail("GRANT_INTERVAL_OUTSIDE_RECONCILIATION_WINDOW");
  }
  const output = writeOnce(options.outputGrantFile, value);
  return Object.freeze({ output,
    priorProjectionHash: value.priorProjectionHash,
    priorV6PartialTreeHash: value.priorV6PartialTreeHash,
    priorV7GrantBytesHash: value.priorV7GrantBytesHash,
    priorV7UseBytesHash: value.priorV7UseBytesHash,
    partialV7TreeHash: value.partialV7TreeHash,
    partialV7CookieBytesHash: value.partialV7CookieBytesHash,
    privateValuesPrinted: false });
}

function parse(argv) {
  const flags = new Set(["--prior-v5-run", "--partial-v6-run", "--input",
    "--prior-residual-grant", "--prior-residual-use", "--prior-v7-grant",
    "--prior-v7-use", "--partial-v7-run", "--output-grant",
    "--authorized-at", "--expires-at"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flags.has(flag) || value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_INVALID");
    }
    result[flag.slice(2).replaceAll("-", "_")] = value;
  }
  if ([...flags].some((flag) =>
    result[flag.slice(2).replaceAll("-", "_")] === undefined)) {
    fail("ARGUMENT_MISSING");
  }
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parse(process.argv.slice(2));
    const result = reissueAdafruitStep3ReceiptReconciliationGrantV8({
      priorV5RunDirectory: args.prior_v5_run,
      partialV6RunDirectory: args.partial_v6_run,
      inputFile: args.input,
      priorResidualGrantFile: args.prior_residual_grant,
      priorResidualUseFile: args.prior_residual_use,
      priorV7GrantFile: args.prior_v7_grant,
      priorV7UseFile: args.prior_v7_use,
      partialV7RunDirectory: args.partial_v7_run,
      outputGrantFile: args.output_grant,
      authorizedAt: args.authorized_at,
      expiresAt: args.expires_at,
    });
    process.stdout.write(`${canonicalizeStrict({
      grantFile: result.output.absolute,
      grantBytes: result.output.bytes,
      grantBytesHash: result.output.bytesHash,
      partialV7TreeHash: result.partialV7TreeHash,
      partialV7CookieBytesHash: result.partialV7CookieBytesHash,
      fileMode: "0600",
      privateValuesPrinted: false,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
