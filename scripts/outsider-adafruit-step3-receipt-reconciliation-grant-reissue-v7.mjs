#!/usr/bin/env node

/*
 * Issue one fresh, content-bound read-only v7 reconciliation grant.
 * The private route input is hashed but never parsed or printed.  The grant
 * is bound to the exact frozen v5 lineage, consumed v6 residual grant/use,
 * and the four-artifact partial v6 tree.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createAdafruitStep3ReceiptReconciliationGrantValueV7,
  inspectAdafruitStep3ReceiptRecoveryContextV7,
} from "./outsider-adafruit-step3-receipt-reconcile-live-runner-v7.mjs";

const PREFIX
  = "OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_REISSUE_V7_";

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function ensureParent(file) {
  if (typeof file !== "string" || file === "") fail("OUTPUT_REQUIRED");
  const absolute = path.resolve(file);
  const directory = path.dirname(absolute);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("OUTPUT_DIRECTORY_INVALID");
  return Object.freeze({ absolute, directory });
}

function writeOnce(file, value) {
  const target = ensureParent(file);
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(target.absolute, constants.O_WRONLY
      | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(target.absolute, 0o600);
  let directoryDescriptor;
  try {
    directoryDescriptor = openSync(target.directory, "r");
    fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
  }
  return Object.freeze({ absolute: target.absolute, bytes: bytes.length,
    bytesHash: hash(bytes) });
}

export function reissueAdafruitStep3ReceiptReconciliationGrantV7(
  options = {}) {
  const context = inspectAdafruitStep3ReceiptRecoveryContextV7(options);
  const authorizedAt = options.authorizedAt;
  const expiresAt = options.expiresAt;
  const value = createAdafruitStep3ReceiptReconciliationGrantValueV7({
    priorProjectionHash: context.prior.projection.projectionHash,
    priorManifestHash: context.prior.manifest.manifestHash,
    inputBytesHash: context.inputRecord.bytesHash,
    partialContinuationTreeHash: context.partial.partialTreeHash,
    partialContinuationJournalHeadHash: context.partial.journal.headHash,
    partialContinuationCookieBytesHash: context.partial.cookie.bytesHash,
    priorResidualGrantBytesHash: context.residual.grantRecord.bytesHash,
    priorResidualGrantUseBytesHash: context.residual.useRecord.bytesHash,
    authorizedAt,
    expiresAt,
  });
  if (Date.parse(authorizedAt)
      < Date.parse(context.partial.chain.ambiguous.recordedAt)
    || Date.parse(expiresAt)
      > Date.parse(context.prior.projection.completionDeadline)) {
    fail("GRANT_INTERVAL_OUTSIDE_RECONCILIATION_WINDOW");
  }
  const output = writeOnce(options.outputGrantFile, value);
  return Object.freeze({
    output,
    priorProjectionHash: value.priorProjectionHash,
    priorManifestHash: value.priorManifestHash,
    inputBytesHash: value.inputBytesHash,
    partialContinuationTreeHash: value.partialContinuationTreeHash,
    partialContinuationJournalHeadHash:
      value.partialContinuationJournalHeadHash,
    partialContinuationCookieBytesHash:
      value.partialContinuationCookieBytesHash,
    priorResidualGrantBytesHash: value.priorResidualGrantBytesHash,
    priorResidualGrantUseBytesHash: value.priorResidualGrantUseBytesHash,
    privateValuesPrinted: false,
  });
}

function parse(argv) {
  const flags = new Set(["--prior-v5-run", "--partial-v6-run", "--input",
    "--prior-residual-grant", "--prior-residual-use", "--output-grant",
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
    const result = reissueAdafruitStep3ReceiptReconciliationGrantV7({
      priorV5RunDirectory: args.prior_v5_run,
      partialV6RunDirectory: args.partial_v6_run,
      inputFile: args.input,
      priorResidualGrantFile: args.prior_residual_grant,
      priorResidualUseFile: args.prior_residual_use,
      outputGrantFile: args.output_grant,
      authorizedAt: args.authorized_at,
      expiresAt: args.expires_at,
    });
    process.stdout.write(`${canonicalizeStrict({
      grantFile: result.output.absolute,
      grantBytes: result.output.bytes,
      grantBytesHash: result.output.bytesHash,
      partialContinuationTreeHash: result.partialContinuationTreeHash,
      partialContinuationJournalHeadHash:
        result.partialContinuationJournalHeadHash,
      partialContinuationCookieBytesHash:
        result.partialContinuationCookieBytesHash,
      fileMode: "0600",
      privateValuesPrinted: false,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
