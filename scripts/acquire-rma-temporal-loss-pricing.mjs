#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE,
} from "../src/outsider-rma-temporal-loss-pricing-benchmark.js";

function usage() {
  return "Usage: node scripts/acquire-rma-temporal-loss-pricing.mjs --out-dir <empty-directory>";
}

function parse(argv) {
  if (argv.includes("--help")) return { help: true };
  if (argv.length !== 2 || argv[0] !== "--out-dir" || !argv[1]) {
    throw new Error("RMA_TEMPORAL_ACQUIRE_ARGUMENTS_INVALID");
  }
  const output = path.resolve(argv[1]);
  if (output === path.parse(output).root) throw new Error("RMA_TEMPORAL_ACQUIRE_PATH_TOO_BROAD");
  return { output };
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function fetchPinned(pin) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(pin.url, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) {
        throw new Error("BYTES_OR_HASH_MISMATCH");
      }
      return Object.freeze({ pin, bytes });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`RMA_TEMPORAL_ACQUIRE_FAILED:${pin.name}:${lastError instanceof Error
    ? lastError.message : String(lastError)}`);
}

async function mapBounded(values, concurrency, callback) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const source = RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE;
  const pins = [...source.closedYears, source.layout, source.licenseMetadata];
  const fetched = await mapBounded(pins, 3, fetchPinned);
  mkdirSync(options.output, { recursive: false, mode: 0o700 });
  for (const { pin, bytes } of fetched) {
    writeFileSync(path.join(options.output, pin.name), bytes, { flag: "wx", mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    output: options.output,
    acquiredAt: source.acquiredAt,
    objects: fetched.map(({ pin }) => ({
      name: pin.name,
      bytes: pin.bytes,
      sha256: pin.sha256,
      url: pin.url,
    })),
    boundary: {
      sourceDomainOnly: true,
      trainingPermission: false,
      pricePermission: false,
      automaticTraining: false,
      targetQuotedPrice: null,
      targetPriceState: "NULL_NOT_ZERO",
      authority: false,
    },
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
