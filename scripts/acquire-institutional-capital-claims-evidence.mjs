#!/usr/bin/env node

/*
 * Acquire a frozen, bounded set of primary official sources describing real
 * institution failures, receivership dividend events, insurer reserve/capital
 * disclosures, collateral custody rules, and actuarial review standards.
 *
 * The source set is evidence about those source domains.  It is not evidence
 * that Outsider is an issuer, holds capital, controls custody, adjudicates a
 * claim, or may move funds.  Every object is byte-pinned and this command is
 * atomic and no-clobber.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT = "artifacts/institutional-capital-claims-20260821/source";
const FROZEN_AT = "2026-08-21T10:30:00.000Z";

const OBJECTS = Object.freeze([
  Object.freeze({
    path: "fdic-failures.json",
    url: "https://api.fdic.gov/banks/failures?limit=10000&sort_by=FAILDATE&sort_order=ASC&fields=NAME,CERT,FIN,CITYST,FAILDATE,FAILYR,SAVR,RESTYPE,RESTYPE1,QBFDEP,QBFASSET,COST,PSTALP,BIDNAME,BIDCITY,BIDSTATE",
    maximumBytes: 3_000_000,
    sizeBytes: 1_349_551,
    sha256: "sha256:4f1efa1011326cf6d5dacc2b407d4a20a42c603ec79cb02a62ba26d1ff73fb3f",
  }),
  Object.freeze({
    path: "fdic-failures-swagger.yaml",
    url: "https://api.fdic.gov/banks/docs/swagger.yaml",
    maximumBytes: 200_000,
    sizeBytes: 34_749,
    sha256: "sha256:854500ae68d77185a12fc9260e0bbc0194e3848df0e54086f828656ea508852b",
  }),
  Object.freeze({
    path: "fdic-failure-properties.yaml",
    url: "https://api.fdic.gov/banks/docs/failure_properties.yaml",
    maximumBytes: 200_000,
    sizeBytes: 14_728,
    sha256: "sha256:7e3137fb6fc93dd49371b4d032f48fad403efd3d9a7f5cc8ca5480c00807364c",
  }),
  Object.freeze({
    path: "fdic-dividends.html",
    url: "https://closedbanks.fdic.gov/dividends/",
    maximumBytes: 200_000,
    sizeBytes: 12_976,
    sha256: "sha256:e63c280e548aba441a332221bfcb4ccf4e57db5afd1941a54912430ba43173d4",
  }),
  Object.freeze({
    path: "fdic-dividends.json",
    url: "https://closedbanks.fdic.gov/dividends/search/All",
    maximumBytes: 2_000_000,
    sizeBytes: 930_766,
    sha256: "sha256:21f79ac746296613a8c0df48993c7be2f692feb117c21ba44b464f9cb9ce6206",
  }),
  Object.freeze({
    path: "fdic-dividends-repeat.json",
    url: "https://closedbanks.fdic.gov/dividends/search/All",
    maximumBytes: 2_000_000,
    sizeBytes: 930_766,
    sha256: "sha256:00198c08f3c3b0a59151683ffb7786a50d2bc4de1d651dbc7cdfd8c0125d2c45",
  }),
  Object.freeze({
    path: "fdic-dividends-app.js",
    url: "https://dpsx.fdic.gov/scripts/divfunds/divscripts.min.js",
    maximumBytes: 100_000,
    sizeBytes: 4_724,
    sha256: "sha256:1ffb80fec775d4a2b50c4f4a3841d788931673de198d2fff453db4e0b15dc76f",
  }),
  Object.freeze({
    path: "treasury-tcmm.html",
    url: "https://fiscal.treasury.gov/payments-to-government/treasury-collateral-management-monitoring-tcmm",
    maximumBytes: 500_000,
    sizeBytes: 118_700,
    sha256: "sha256:2095ed9a9ad42c360328d2b844363651040d3a77b2812ed32cd041dcae29e4ba",
  }),
  Object.freeze({
    path: "rli-edgar-index.json",
    url: "https://www.sec.gov/Archives/edgar/data/84246/000110465926018013/index.json",
    maximumBytes: 100_000,
    sizeBytes: 11_754,
    sha256: "sha256:97c2b2a6731abd7fb5b416a94d8a9e204cba13560511fe824564054a36d8148b",
  }),
  Object.freeze({
    path: "rli-2025-10k.html",
    url: "https://www.sec.gov/Archives/edgar/data/84246/000110465926018013/rli-20251231x10k.htm",
    maximumBytes: 12_000_000,
    sizeBytes: 8_558_265,
    sha256: "sha256:a01661c1abfb9880fe8a6452a5e17d1cf407ba2bff5ed44cdf4c5aee4ee1e853",
  }),
  Object.freeze({
    path: "asop-23-data-quality.html",
    url: "https://www.actuarialstandardsboard.org/asops/data-quality/",
    maximumBytes: 300_000,
    sizeBytes: 115_940,
    sha256: "sha256:fa25a7aab95bcd5eec55db5c57197db5788cbd6f35edb8ada3be0f4059d0fb32",
  }),
  Object.freeze({
    path: "asop-36-reserve-opinion.html",
    url: "https://www.actuarialstandardsboard.org/asops/asop-no-36-statements-of-actuarial-opinion-regarding-property-casualty-loss-loss-adjustment-expense-or-other-reserves/",
    maximumBytes: 300_000,
    sizeBytes: 141_053,
    sha256: "sha256:a5f2fa8807fa1083d484336683b42f1eaa3cf123f035504d52a319595a81bddd",
  }),
  Object.freeze({
    path: "asop-53-future-costs.html",
    url: "https://www.actuarialstandardsboard.org/asops/estimating-future-costs-prospective-propertycasualty-risk-transfer-risk-retention/",
    maximumBytes: 300_000,
    sizeBytes: 108_333,
    sha256: "sha256:b97c0cd7ec5fccb4c3dda86908a65ec21d8839c4e01d7c1af3414c9eab594a5f",
  }),
  Object.freeze({
    path: "asop-55-capital-adequacy.html",
    url: "https://www.actuarialstandardsboard.org/asops/capital-adequacy-assessment/",
    maximumBytes: 300_000,
    sizeBytes: 133_774,
    sha256: "sha256:8c5df1297e90b32974ba5aac6c501b03d88263d605279fb92ca83a2d220cf89c",
  }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `INSTITUTIONAL_CAPITAL_ACQUIRE_${code}`
    : `INSTITUTIONAL_CAPITAL_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseArgs(argv) {
  if (argv.length === 0) return { output: DEFAULT_OUTPUT };
  const parsed = { output: DEFAULT_OUTPUT, fromDirectory: null };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--output", "--from-dir"]).has(key) || !value) {
      fail("ARGUMENT_INVALID");
    }
    if (key === "--output") parsed.output = value;
    else parsed.fromDirectory = value;
  }
  return parsed;
}

async function boundedFetch(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  let response;
  try {
    response = await fetch(source.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/html,application/yaml,text/yaml,text/javascript,*/*;q=0.1",
        "user-agent": "Outsider source-replay evidence research contact@example.com",
      },
    });
    if (!response.ok) fail(`FETCH_${response.status}`, source.path);
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^[0-9]+$/.test(declared)
      || Number(declared) > source.maximumBytes)) {
      fail("DECLARED_SIZE_INVALID", source.path);
    }
    if (!response.body) fail("FETCH_BODY_MISSING", source.path);
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > source.maximumBytes) fail("FETCH_SIZE_INVALID", source.path);
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks, total);
    if (bytes.length !== source.sizeBytes || sha256(bytes) !== source.sha256) {
      fail("PIN_MISMATCH", source.path);
    }
    return { source, bytes, finalUrl: response.url,
      contentType: response.headers.get("content-type") ?? "" };
  } finally {
    clearTimeout(timeout);
  }
}

async function acquireBoundedConcurrency(limit = 3) {
  const results = new Array(OBJECTS.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= OBJECTS.length) return;
      results[index] = await boundedFetch(OBJECTS[index]);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function importPinnedDirectory(directory) {
  const root = path.resolve(directory);
  if (root === path.parse(root).root) fail("IMPORT_DIRECTORY_TOO_BROAD");
  return OBJECTS.map((source) => {
    const bytes = readFileSync(path.join(root, source.path));
    if (bytes.length !== source.sizeBytes || sha256(bytes) !== source.sha256) {
      fail("PIN_MISMATCH", source.path);
    }
    return { source, bytes, finalUrl: source.url,
      contentType: "LOCAL_PINNED_SOURCE_IMPORT" };
  });
}

function validateMagic(name, bytes) {
  const text = bytes.toString("utf8");
  if (name.endsWith(".json")) {
    try { JSON.parse(text); } catch { fail("JSON_INVALID", name); }
  }
  if (name.endsWith(".html") && !/<(?:!doctype\s+html|html)\b/i.test(text)) {
    fail("HTML_MAGIC_INVALID", name);
  }
  if (name.endsWith(".yaml") && !/(?:swagger:|FAILYR:|QBFDEP:)/.test(text)) {
    fail("YAML_MARKER_INVALID", name);
  }
  if (name.endsWith(".js") && !/dividends\/search\/All/.test(text)) {
    fail("JAVASCRIPT_ENDPOINT_MARKER_INVALID", name);
  }
}

const { output, fromDirectory } = parseArgs(process.argv.slice(2));
const target = path.resolve(output);
if (target === path.parse(target).root || existsSync(target)) {
  fail("OUTPUT_EXISTS_OR_TOO_BROAD");
}
mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const temporary = path.join(path.dirname(target),
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });

try {
  const acquired = fromDirectory === null
    ? await acquireBoundedConcurrency()
    : importPinnedDirectory(fromDirectory);
  const objects = [];
  for (const result of acquired) {
    validateMagic(result.source.path, result.bytes);
    writeFileSync(path.join(temporary, result.source.path), result.bytes,
      { flag: "wx", mode: 0o600 });
    objects.push({
      path: result.source.path,
      url: result.source.url,
      finalUrl: result.finalUrl,
      sizeBytes: result.bytes.length,
      sha256: sha256(result.bytes),
      contentType: result.contentType,
    });
  }
  const manifest = Buffer.from(`${JSON.stringify({
    schema: "outsider/institutional-capital-claims-acquisition/v1",
    frozenAt: FROZEN_AT,
    acquiredAt: "SELF_ASSERTED_LOCAL_TIME",
    transportAttested: false,
    acquisitionMode: fromDirectory === null
      ? "LIVE_FETCH_EXACT_BYTE_PIN"
      : "LOCAL_IMPORT_OF_PREVIOUSLY_FETCHED_EXACT_BYTE_PIN",
    objects,
  })}\n`);
  writeFileSync(path.join(temporary, "acquisition.json"), manifest,
    { flag: "wx", mode: 0o600 });
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputDirectory: target,
    objects: objects.length,
    sourceBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
    sources: objects.map(({ path: objectPath, sizeBytes, sha256: hash }) => ({
      path: objectPath, sizeBytes, sha256: hash,
    })),
  }, null, 2)}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
