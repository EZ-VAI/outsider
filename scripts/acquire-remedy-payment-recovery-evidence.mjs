#!/usr/bin/env node

/*
 * Acquire four bounded official source objects for the real payment, refund,
 * program-closure, and product-recall-remedy lane. Exact pins make upstream
 * revisions fail closed until a new snapshot is reviewed and admitted.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REMEDY_PAYMENT_RECOVERY_SOURCE_PINS } from
  "../src/outsider-remedy-payment-recovery-evidence.js";

const DEFAULT_OUTPUT = "artifacts/remedy-payment-recovery-20260821/source";

function fail(code, detail = null) {
  throw new Error(detail == null ? `REMEDY_PAYMENT_RECOVERY_ACQUIRE_${code}`
    : `REMEDY_PAYMENT_RECOVERY_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseArgs(argv) {
  if (argv.length === 0) return { output: DEFAULT_OUTPUT };
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) fail("ARGUMENT_INVALID");
  return { output: argv[1] };
}

async function boundedFetch(pin) {
  const maximumBytes = pin.path.endsWith(".json") ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
  const response = await fetch(pin.url, {
    redirect: "follow",
    headers: {
      accept: pin.path.endsWith(".pdf") ? "application/pdf"
        : pin.path.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/json",
      "user-agent": "Mozilla/5.0 Outsider real-evidence intake https://github.com/EZ-VAI/outsider",
    },
  });
  if (!response.ok) fail(`FETCH_${response.status}`, pin.path);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/.test(declared)
    || Number(declared) > maximumBytes)) fail("DECLARED_SIZE_INVALID", pin.path);
  const reader = response.body?.getReader();
  if (!reader) fail("FETCH_BODY_MISSING", pin.path);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      fail("FETCH_SIZE_INVALID", pin.path);
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks, total);
  if (bytes.length !== pin.sizeBytes || sha256(bytes) !== pin.sha256) {
    fail("PIN_MISMATCH", pin.path);
  }
  if (pin.path.endsWith(".pdf") && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    fail("PDF_MAGIC_INVALID", pin.path);
  }
  if (pin.path.endsWith(".xlsx") && !bytes.subarray(0, 2).equals(Buffer.from("PK"))) {
    fail("XLSX_MAGIC_INVALID", pin.path);
  }
  if (pin.path.endsWith(".json")) {
    let parsed;
    try { parsed = JSON.parse(bytes.toString("utf8")); }
    catch { fail("JSON_INVALID", pin.path); }
    if (!Array.isArray(parsed)) fail("JSON_SHAPE_INVALID", pin.path);
  }
  return { bytes, finalUrl: response.url };
}

const { output } = parseArgs(process.argv.slice(2));
const target = path.resolve(output);
if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const temporary = path.join(path.dirname(target),
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });

try {
  const objects = [];
  for (const pin of REMEDY_PAYMENT_RECOVERY_SOURCE_PINS) {
    const result = await boundedFetch(pin);
    if (result.finalUrl !== pin.url) fail("FINAL_URL_CHANGED", pin.path);
    writeFileSync(path.join(temporary, pin.path), result.bytes, { flag: "wx", mode: 0o600 });
    objects.push({ path: pin.path, url: pin.url, finalUrl: result.finalUrl,
      sizeBytes: result.bytes.length, sha256: sha256(result.bytes) });
  }
  const acquisition = {
    schema: "outsider/remedy-payment-recovery-acquisition/v1",
    acquiredAt: "SELF_ASSERTED_LOCAL_TIME",
    declaredSnapshot: {
      cfpbFiscalYear: 2025, ftcCalendarYear: 2024,
      cpscMprAsOfDate: "2026-07-13",
      cpscRecallDateSlice: { start: "2022-08-01", end: "2026-07-13" },
    },
    objects,
  };
  writeFileSync(path.join(temporary, "acquisition.json"),
    Buffer.from(`${JSON.stringify(acquisition)}\n`), { flag: "wx", mode: 0o600 });
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
    sourceObjects: objects.length,
    sourceBytes: objects.reduce((total, object) => total + object.sizeBytes, 0),
    objects })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
