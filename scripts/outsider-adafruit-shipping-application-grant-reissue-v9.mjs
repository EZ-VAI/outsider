#!/usr/bin/env node

/* Issue one private, one-use grant for one rate frozen by a v8 receipt. */

import { constants, chmodSync, closeSync, fsyncSync, openSync, writeSync }
  from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createAdafruitShippingApplicationGrantValueV9,
  inspectAdafruitStep3ReceiptContextV9,
} from "./outsider-adafruit-shipping-application-live-runner-v9.mjs";

const PREFIX = "OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_GRANT_REISSUE_V9_";
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function writeOnce(file, value) {
  const absolute = path.resolve(file ?? "");
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

export function reissueAdafruitShippingApplicationGrantV9(options = {}) {
  if (typeof options.selectedRateRefHash !== "string"
    || !HASH.test(options.selectedRateRefHash)) fail("SELECTED_RATE_REF_INVALID");
  const context = inspectAdafruitStep3ReceiptContextV9(options);
  const selected = context.form.rates.filter((rate) =>
    rate.rateRefHash === options.selectedRateRefHash);
  if (selected.length !== 1) fail("SELECTED_RATE_NOT_IN_V8_RECEIPT");
  const grant = createAdafruitShippingApplicationGrantValueV9({
    v8RunTreeHash: context.treeHash,
    v8ProjectionHash: context.projectionHash,
    v8ManifestHash: context.manifestHash,
    v8RouteEvidenceHash: context.routeEvidence.evidenceHash,
    v8SourceCaptureHash: context.captureHash,
    v8Step3SourceBytesHash: context.step3.bytesHash,
    v8CookieBytesHash: context.cookie.bytesHash,
    selectedRateRefHash: selected[0].rateRefHash,
    selectedShippingMinor: selected[0].amountMinor,
    authorizedAt: options.authorizedAt,
    expiresAt: options.expiresAt,
  });
  return Object.freeze({ grant,
    output: writeOnce(options.outputGrantFile, grant),
    priorV8RunTreeHash: context.treeHash });
}

function parseCli(argv) {
  const allowed = new Set(["--prior-v8-run", "--selected-rate-ref-hash",
    "--output", "--authorized-at", "--expires-at"]);
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail("ARGUMENT_INVALID");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE");
    result[flag.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  for (const key of ["prior_v8_run", "selected_rate_ref_hash", "output",
    "authorized_at", "expires_at"]) {
    if (result[key] === undefined) fail("REQUIRED_ARGUMENT_MISSING");
  }
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2));
    const result = reissueAdafruitShippingApplicationGrantV9({
      priorV8RunDirectory: args.prior_v8_run,
      selectedRateRefHash: args.selected_rate_ref_hash,
      outputGrantFile: args.output,
      authorizedAt: args.authorized_at,
      expiresAt: args.expires_at,
    });
    process.stdout.write(`${canonicalizeStrict({
      outputGrantFile: result.output.absolute,
      bytes: result.output.bytes,
      selectedRateRefHash: result.grant.selectedRateRefHash,
      priorV8RunTreeHash: result.priorV8RunTreeHash,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
