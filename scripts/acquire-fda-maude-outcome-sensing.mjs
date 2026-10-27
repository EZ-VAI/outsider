#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FDA_MAUDE_FROZEN_SOURCE_20260821 } from "../src/outsider-fda-maude-outcome-sensing.js";

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length !== 2 || argv[0] !== "--out-dir" || !argv[1] || argv[1].startsWith("--")) {
    throw new Error("FDA_MAUDE_ACQUIRE_USAGE:--out-dir <empty-or-exact-source-dir>");
  }
  const out = path.resolve(argv[1]);
  if (out === path.parse(out).root) throw new Error("FDA_MAUDE_ACQUIRE_OUT_TOO_BROAD");
  return { out };
}

async function download(file) {
  const response = await fetch(file.url, { redirect: "follow", headers: {
    "user-agent": "Mozilla/5.0 (compatible; OutsiderSourceFreeze/1.0)",
    referer: FDA_MAUDE_FROZEN_SOURCE_20260821.dataIndexUrl,
  } });
  if (!response.ok) throw new Error(`FDA_MAUDE_ACQUIRE_HTTP_${response.status}:${file.name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
    throw new Error(`FDA_MAUDE_ACQUIRE_PIN_MISMATCH:${file.name}`);
  }
  return bytes;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("node scripts/acquire-fda-maude-outcome-sensing.mjs --out-dir <dir>\n");
    process.exit(0);
  }
  mkdirSync(options.out, { recursive: true, mode: 0o700 });
  const receipts = [];
  for (const file of FDA_MAUDE_FROZEN_SOURCE_20260821.files) {
    const target = path.join(options.out, file.name);
    if (existsSync(target)) {
      const bytes = readFileSync(target);
      if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
        throw new Error(`FDA_MAUDE_ACQUIRE_EXISTING_MISMATCH:${file.name}`);
      }
      receipts.push({ name: file.name, status: "EXACT_EXISTING", bytes: bytes.length, sha256: file.sha256 });
      continue;
    }
    const bytes = await download(file);
    writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
    receipts.push({ name: file.name, status: "DOWNLOADED_AND_PINNED", bytes: bytes.length, sha256: file.sha256 });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, sourceId: FDA_MAUDE_FROZEN_SOURCE_20260821.sourceId,
    outDirectory: options.out, receipts }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
