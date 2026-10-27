#!/usr/bin/env node

import {
  chmodSync, existsSync, mkdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildRmaTemporalLossPricingBenchmark,
  verifyRmaTemporalLossPricingCanonicalWithSource,
} from "../src/outsider-rma-temporal-loss-pricing-benchmark.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/rma-temporal-loss-pricing-benchmark.mjs build --source-dir <dir> --out <artifact.json>",
    "  node scripts/rma-temporal-loss-pricing-benchmark.mjs verify --source-dir <dir> --artifact <artifact.json> [--receipt <receipt.json>]",
    "",
    "The command is offline. It emits a source-domain shadow benchmark, never an Outsider quote.",
  ].join("\n");
}

function parse(argv) {
  if (!argv.length || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!new Set(["build", "verify"]).has(action)) throw new Error("RMA_TEMPORAL_CLI_ACTION_INVALID");
  const allowed = new Set(["--source-dir", "--out", "--artifact", "--receipt"]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`RMA_TEMPORAL_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    if (Object.hasOwn(values, key)) {
      throw new Error(`RMA_TEMPORAL_CLI_ARGUMENT_DUPLICATE:${key}`);
    }
    values[key] = value;
  }
  if (!values["--source-dir"]) throw new Error("RMA_TEMPORAL_CLI_SOURCE_DIR_REQUIRED");
  if (action === "build" && !values["--out"]) throw new Error("RMA_TEMPORAL_CLI_OUT_REQUIRED");
  if (action === "verify" && !values["--artifact"]) {
    throw new Error("RMA_TEMPORAL_CLI_ARTIFACT_REQUIRED");
  }
  if (action === "build" && (values["--artifact"] || values["--receipt"])
    || action === "verify" && values["--out"]) {
    throw new Error("RMA_TEMPORAL_CLI_ARGUMENT_NOT_ALLOWED");
  }
  return values;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const sourceDirectory = resolved(options["--source-dir"], "RMA_TEMPORAL_CLI_SOURCE_DIR");
  if (options.action === "build") {
    const output = resolved(options["--out"], "RMA_TEMPORAL_CLI_OUT");
    if (existsSync(output)) throw new Error("RMA_TEMPORAL_CLI_OUT_ALREADY_EXISTS");
    const artifact = buildRmaTemporalLossPricingBenchmark(sourceDirectory);
    mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    chmodSync(path.dirname(output), 0o700);
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output,
      artifactHash: artifact.artifactHash,
      annualRows: artifact.annual.length,
      temporal: artifact.temporal,
      admission: artifact.admission,
    }, null, 2)}\n`);
  } else {
    const artifactPath = resolved(options["--artifact"], "RMA_TEMPORAL_CLI_ARTIFACT");
    const result = verifyRmaTemporalLossPricingCanonicalWithSource(
      artifactPath, sourceDirectory);
    if (options["--receipt"]) {
      const receipt = resolved(options["--receipt"], "RMA_TEMPORAL_CLI_RECEIPT");
      if (existsSync(receipt)) throw new Error("RMA_TEMPORAL_CLI_RECEIPT_ALREADY_EXISTS");
      mkdirSync(path.dirname(receipt), { recursive: true, mode: 0o700 });
      chmodSync(path.dirname(receipt), 0o700);
      writeFileSync(receipt, `${JSON.stringify(result, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
