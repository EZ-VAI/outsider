#!/usr/bin/env node

/* Issue one private, one-use, read-only v10 reconciliation grant. */

import { closeSync, constants, fsyncSync, lstatSync, openSync, writeSync,
  chmodSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createAdafruitShippingReconciliationGrantValueV10,
  inspectAdafruitShippingApplicationAmbiguityV10,
} from "./outsider-adafruit-shipping-reconciliation-live-runner-v10.mjs";

const PREFIX
  = "OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_GRANT_REISSUE_V10_";

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function writeOnce(file, value) {
  const absolute = path.resolve(file ?? "");
  const parent = path.dirname(absolute);
  let parentInfo;
  try { parentInfo = lstatSync(parent); } catch { fail("OUTPUT_PARENT_UNAVAILABLE"); }
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()
    || (parentInfo.mode & 0o777) !== 0o700) fail("OUTPUT_PARENT_NOT_PRIVATE");
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
  return Object.freeze({ absolute, bytes: bytes.length });
}

export function reissueAdafruitShippingReconciliationGrantV10(options = {}) {
  const context = inspectAdafruitShippingApplicationAmbiguityV10(options);
  const grant = createAdafruitShippingReconciliationGrantValueV10({
    v8RunTreeHash: context.v8.treeHash,
    v9RunTreeHash: context.treeHash,
    v9GrantBytesHash: context.grantRecord.bytesHash,
    v9GrantUseBytesHash: context.useRecord.bytesHash,
    v9AttemptHash: context.attemptHash,
    v9RequestBodyBytesHash: context.requestBody.bytesHash,
    v9ResponseBytesHash: context.response.bytesHash,
    v9ResponseHeadersRecordHash: context.responseHeadersHash,
    v9FailureManifestHash: context.failureHash,
    v9CookieBytesHash: context.currentCookie.bytesHash,
    selectedRateRefHash: context.grant.selectedRateRefHash,
    selectedShippingMinor: context.grant.selectedShippingMinor,
    authorizedAt: options.authorizedAt,
    expiresAt: options.expiresAt,
  });
  if (Date.parse(grant.authorizedAt) < Date.parse(context.failure.observedAt)
    || Date.parse(grant.expiresAt)
      > Date.parse(context.v8.routeEvidence.validUntil)
    || Date.parse(grant.expiresAt)
      > Date.parse(context.v8.projection.completionDeadline)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  return Object.freeze({ grant,
    output: writeOnce(options.outputGrantFile, grant),
    priorV9RunTreeHash: context.treeHash });
}

function parseCli(argv) {
  const allowed = new Set(["--prior-v8-run", "--prior-v9-run",
    "--prior-v9-grant", "--prior-v9-use", "--output", "--authorized-at",
    "--expires-at"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail("ARGUMENT_INVALID");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE");
    result[flag.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  for (const key of ["prior_v8_run", "prior_v9_run", "prior_v9_grant",
    "prior_v9_use", "output", "authorized_at", "expires_at"]) {
    if (result[key] === undefined) fail("REQUIRED_ARGUMENT_MISSING");
  }
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2));
    const result = reissueAdafruitShippingReconciliationGrantV10({
      priorV8RunDirectory: args.prior_v8_run,
      priorV9RunDirectory: args.prior_v9_run,
      priorV9GrantFile: args.prior_v9_grant,
      priorV9UseFile: args.prior_v9_use,
      outputGrantFile: args.output,
      authorizedAt: args.authorized_at,
      expiresAt: args.expires_at,
    });
    process.stdout.write(`${canonicalizeStrict({
      outputGrantFile: result.output.absolute,
      bytes: result.output.bytes,
      priorV9RunTreeHash: result.priorV9RunTreeHash,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
