#!/usr/bin/env node

/*
 * Acquire the bounded CDI/NCIGF rate-filing and guaranty-fund source set.
 * Exact bytes are the admission boundary. A changed official publication is
 * a new snapshot requiring review, never an in-place upgrade.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS } from
  "../src/outsider-cdi-ncigf-real-rate-guaranty-evidence.js";

const DEFAULT_OUTPUT = "artifacts/cdi-ncigf-real-rate-guaranty-20260821/source";
const MAX_BYTES = 4_000_000;

function fail(code, detail = null) {
  throw new Error(detail === null ? `CDI_NCIGF_ACQUIRE_${code}`
    : `CDI_NCIGF_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function help() {
  process.stdout.write(`Usage:
  node scripts/acquire-cdi-ncigf-real-rate-guaranty-evidence.mjs [--output DIR]
  node scripts/acquire-cdi-ncigf-real-rate-guaranty-evidence.mjs --from-dir DIR [--output DIR]

Downloads or exact-copies 13 pinned official objects. The output is no-clobber.
`);
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length % 2 !== 0) fail("ARGUMENT_INVALID");
  const values = { help: false, output: DEFAULT_OUTPUT, fromDirectory: null };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!["--output", "--from-dir"].includes(option) || !value || seen.has(option)) {
      fail("ARGUMENT_INVALID");
    }
    seen.add(option);
    if (option === "--output") values.output = value;
    else values.fromDirectory = value;
  }
  return values;
}

function stableLocalRead(directory, pin) {
  const root = path.resolve(directory);
  const target = path.resolve(root, pin.path);
  if (root === path.parse(root).root || path.dirname(target) !== root) fail("SOURCE_PATH_INVALID");
  const before = lstatSync(target);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== pin.sizeBytes
    || before.size > MAX_BYTES) fail("SOURCE_PROFILE_INVALID", pin.path);
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) fail("SOURCE_RACE", pin.path);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || bytes.length !== pin.sizeBytes || sha256(bytes) !== pin.sha256) {
      fail("PIN_MISMATCH", pin.path);
    }
    return { bytes, finalUrl: pin.url };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

async function boundedFetch(pin) {
  let response;
  try {
    response = await fetch(pin.url, { redirect: "follow", signal: AbortSignal.timeout(60_000),
      headers: { accept: "*/*", "user-agent": "Outsider exact-source intake" } });
  } catch (error) { fail("FETCH_FAILED", `${pin.path}:${error instanceof Error ? error.message : error}`); }
  if (!response.ok) fail(`FETCH_${response.status}`, pin.path);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BYTES)) {
    fail("DECLARED_SIZE_INVALID", pin.path);
  }
  const reader = response.body?.getReader();
  if (!reader) fail("FETCH_BODY_MISSING", pin.path);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      fail("FETCH_SIZE_INVALID", pin.path);
    }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks, total);
  if (bytes.length !== pin.sizeBytes || sha256(bytes) !== pin.sha256) {
    fail("PIN_MISMATCH", pin.path);
  }
  const final = new URL(response.url);
  const expected = new URL(pin.url);
  if (final.protocol !== "https:" || final.hostname !== expected.hostname) {
    fail("FINAL_ORIGIN_INVALID", pin.path);
  }
  return { bytes, finalUrl: response.url };
}

function checkMagic(pin, bytes) {
  if (pin.path.endsWith(".pdf") && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    fail("PDF_MAGIC_INVALID", pin.path);
  }
  if (pin.path.endsWith(".xlsx") && !bytes.subarray(0, 2).equals(Buffer.from("PK"))) {
    fail("XLSX_MAGIC_INVALID", pin.path);
  }
  const cfb = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (pin.path.endsWith(".xls") && !bytes.subarray(0, 8).equals(cfb)) {
    fail("XLS_MAGIC_INVALID", pin.path);
  }
  if (pin.path.endsWith(".html")) {
    const head = bytes.subarray(0, Math.min(bytes.length, 2_048)).toString("utf8");
    if (!/<(?:!doctype\s+html|html)\b/iu.test(head)) fail("HTML_MAGIC_INVALID", pin.path);
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  help();
} else {
  const target = path.resolve(options.output);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const objects = [];
    for (const pin of CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS) {
      const result = options.fromDirectory === null
        ? await boundedFetch(pin) : stableLocalRead(options.fromDirectory, pin);
      checkMagic(pin, result.bytes);
      writeFileSync(path.join(temporary, pin.path), result.bytes, { flag: "wx", mode: 0o600 });
      objects.push({ path: pin.path, kind: pin.kind, url: pin.url, finalUrl: result.finalUrl,
        sizeBytes: result.bytes.length, sha256: sha256(result.bytes) });
    }
    const acquisition = {
      schema: "outsider/cdi-ncigf-real-rate-guaranty-acquisition/v1",
      acquisitionMode: options.fromDirectory === null
        ? "NETWORK_EXACT_PIN_FETCH" : "LOCAL_EXACT_PIN_COPY",
      acquisitionTimeAuthority: "SELF_ASSERTED_LOCAL_PROCESS_NOT_SOURCE_TRUTH",
      declaredSnapshotDate: "2026-08-21", sourceObjects: objects.length,
      sourceBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0), objects,
      admissionBoundary: { exactPinMatchRequired: true, sourceSchemaReplayRequired: true,
        publicOriginDoesNotDemoteReality: true, acquisitionDoesNotUpgradePublisherAuthority: true,
        rightsOrCommercialUseConcluded: false },
    };
    writeFileSync(path.join(temporary, "acquisition.json"),
      Buffer.from(`${JSON.stringify(acquisition, null, 2)}\n`), { flag: "wx", mode: 0o600 });
    renameSync(temporary, target);
    process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
      sourceObjects: objects.length, sourceBytes: acquisition.sourceBytes,
      acquisitionMode: acquisition.acquisitionMode })}\n`);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}
