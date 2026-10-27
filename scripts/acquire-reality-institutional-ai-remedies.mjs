#!/usr/bin/env node

/*
 * Acquire a bounded set of primary-source U.S. agency pages and orders about
 * real automated/AI harms and remedies.  The artifacts remain evidence, not
 * legal advice or a licence to infer incident frequency, causal liability, or
 * insurance loss.  This command is atomic and refuses to overwrite output.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT = "artifacts/reality-institutional-ai-remedies-20260821/source";

const OBJECTS = Object.freeze([
  ["meta-case.html",
    "https://www.justice.gov/crt/case/united-states-v-meta-platforms-inc-fka-facebook-inc-sdny", 2 * 1024 * 1024,
    93150, "sha256:c99f5e29b5a073c1b8932a8413b2a7e691aa9cb49b476f1118b44d762f0d9ba3"],
  ["meta-complaint.pdf",
    "https://www.justice.gov/crt/case-document/file/1514111/dl", 2 * 1024 * 1024,
    929201, "sha256:2139a8a394656da3e08b0e3204eb0998b4a93f643f346f2923904e95f1ebfb16"],
  ["meta-settlement-final-judgment.pdf",
    "https://www.justice.gov/crt/case-document/file/1516666/dl", 5 * 1024 * 1024,
    3968040, "sha256:2819774c04b3d2c7b3828e07076eeb9406d375d853109cac8d78b20d9ca2f7ec"],
  ["meta-vrs-review-2023-06.pdf",
    "https://www.justice.gov/crt/media/1306541/dl", 2 * 1024 * 1024,
    918688, "sha256:8884b53a6b64fb334dd690ccfbafde5195f47190d455dc35065bc5a6f98b5341"],
  ["meta-vrs-review-2023-10.pdf",
    "https://www.justice.gov/crt/media/1328211/dl", 2 * 1024 * 1024,
    998205, "sha256:353dcf08f0c8f51035f1d138c6f0853e3800c383f204e64e9702a1e77d37d3b2"],
  ["meta-vrs-review-2024-03.pdf",
    "https://www.justice.gov/crt/media/1345261/dl", 2 * 1024 * 1024,
    1149021, "sha256:36847e938e1d139014a163013730d87f4c38b74ee4eeb48e9d0a4b4b1cf5800d"],
  ["meta-vrs-review-2024-06.pdf",
    "https://www.justice.gov/crt/media/1362086/dl", 2 * 1024 * 1024,
    1195799, "sha256:d72759a5a375e361a7179c9c08e538f5022dbb9e3c58e67460bfd137b2210ac5"],
  ["meta-vrs-review-2024-10-updated-2024-12.pdf",
    "https://www.justice.gov/crt/media/1385866/dl", 15 * 1024 * 1024,
    13973861, "sha256:6c6aad4fcb45a43e68adf461657f27c22bb7c740b728bc3c3d976133ef6bc645"],
  ["itutorgroup-eeoc-release.html",
    "https://www.eeoc.gov/newsroom/itutorgroup-pay-365000-settle-eeoc-discriminatory-hiring-suit", 2 * 1024 * 1024,
    68431, "sha256:67303ec7180a73872c3b9a6dd0f081ee59bdb34655ff548f23080ee19de98730"],
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `REALITY_REMEDY_ACQUIRE_${code}`
    : `REALITY_REMEDY_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseArgs(argv) {
  if (argv.length === 0) return { output: DEFAULT_OUTPUT };
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) fail("ARGUMENT_INVALID");
  return { output: argv[1] };
}

async function boundedFetch(url, maximumBytes) {
  const response = await fetch(url, { redirect: "follow", headers: {
    accept: "text/html,application/pdf;q=0.9,*/*;q=0.1",
    "user-agent": "Outsider institutional-remedy evidence acquisition https://github.com/EZ-VAI/outsider",
  } });
  if (!response.ok) fail(`FETCH_${response.status}`, url);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/.test(declared)
    || Number(declared) > maximumBytes)) fail("DECLARED_SIZE_INVALID", url);
  const reader = response.body?.getReader();
  if (!reader) fail("FETCH_BODY_MISSING", url);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      fail("FETCH_SIZE_INVALID", url);
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) fail("FETCH_SIZE_INVALID", url);
  return { bytes: Buffer.concat(chunks, total), finalUrl: response.url,
    contentType: response.headers.get("content-type") ?? "" };
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
  for (const [name, url, maximumBytes, expectedBytes, expectedSha256] of OBJECTS) {
    const result = await boundedFetch(url, maximumBytes);
    if (name.endsWith(".pdf") && !result.bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      fail("PDF_MAGIC_INVALID", name);
    }
    if (name.endsWith(".html") && !/text\/html/i.test(result.contentType)) {
      fail("HTML_CONTENT_TYPE_INVALID", name);
    }
    if (result.bytes.length !== expectedBytes || sha256(result.bytes) !== expectedSha256) {
      fail("PIN_MISMATCH", name);
    }
    writeFileSync(path.join(temporary, name), result.bytes, { flag: "wx", mode: 0o600 });
    objects.push({ path: name, url, finalUrl: result.finalUrl,
      sizeBytes: result.bytes.length, sha256: sha256(result.bytes) });
  }
  const manifest = Buffer.from(`${JSON.stringify({
    schema: "outsider/institutional-ai-remedy-acquisition/v1",
    acquiredAt: "SELF_ASSERTED_LOCAL_TIME",
    objects,
  })}\n`);
  writeFileSync(path.join(temporary, "acquisition.json"), manifest,
    { flag: "wx", mode: 0o600 });
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
    objects: objects.length, bytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
    sourceObjects: objects })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
