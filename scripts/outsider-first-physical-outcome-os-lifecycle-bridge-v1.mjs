#!/usr/bin/env node
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { compileFirstPhysicalOutcomeOsLifecycleBridgeV1 } from "../src/outsider-first-physical-outcome-os-lifecycle-bridge-v1.js";

function fail(message) { throw new Error(`OUTSIDER_BRIDGE_CLI_${message}`); }
function json(file) { return JSON.parse(readFileSync(file, "utf8")); }

export function compileFirstPhysicalOutcomeOsLifecycleFilesV1(options) {
  const required = ["unified", "foundation", "workOrder", "productState", "observation",
    "recordedAt", "openedAt", "attemptRecordedAt", "output"];
  if (!options || required.some(key => typeof options[key] !== "string"
    || options[key].length === 0)) fail("EXPLICIT_ARGUMENTS_REQUIRED");
  const result = compileFirstPhysicalOutcomeOsLifecycleBridgeV1({
    unifiedResult: json(options.unified),
    foundationCompilation: json(options.foundation),
    workOrderProjection: json(options.workOrder),
    productState: json(options.productState),
    sellerObservation: json(options.observation),
    recordedAt: options.recordedAt, openedAt: options.openedAt,
    attemptRecordedAt: options.attemptRecordedAt,
  });
  writeFileSync(options.output, `${canonicalizeStrict(result)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(options.output, 0o600);
  return result;
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
    if (value.startsWith("--")) rows.push([value.slice(2), all[index + 1]]);
    return rows;
  }, []));
  const result = compileFirstPhysicalOutcomeOsLifecycleFilesV1(args);
  process.stdout.write(`${canonicalizeStrict({ decision: result.decision,
    gaps: result.gaps, bridgeHash: result.bridgeHash,
    finalHeadHash: result.finalHeadHash })}\n`);
}
