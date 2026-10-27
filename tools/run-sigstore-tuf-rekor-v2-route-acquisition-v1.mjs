#!/usr/bin/env node

/*
 * Read-only production route acquisition. This tool refreshes the Sigstore
 * public-good TUF repository and writes exact authenticated targets to a new
 * private artifact directory. It never calls a Rekor endpoint and never pays.
 */

import {
  chmodSync, lstatSync, mkdirSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  acquireSigstoreTufRekorV2RouteV1,
  publishSigstoreTufRekorV2RouteArtifactsV1,
} from "../src/outsider-sigstore-tuf-rekor-v2-route-acquisition-v1.js";

const PREFIX = "OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_RUNNER_V1_";
const ALLOWED = new Set([
  "--cache-directory", "--artifact-root", "--output-directory", "--timeout-ms",
]);

function fail(code) { throw new Error(`${PREFIX}${code}`); }

function parse(argv) {
  if (argv.length % 2 !== 0) fail("ARGUMENT_PAIR_REQUIRED");
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!ALLOWED.has(flag) || result.has(flag)) fail("ARGUMENT_INVALID");
    result.set(flag, argv[index + 1]);
  }
  for (const required of ["--cache-directory", "--artifact-root", "--output-directory"]) {
    if (!result.has(required)) fail(`${required.slice(2).toUpperCase()}_REQUIRED`);
  }
  const rawTimeout = result.get("--timeout-ms") ?? "30000";
  if (!/^[0-9]+$/u.test(rawTimeout)) fail("TIMEOUT_INVALID");
  return {
    cacheDirectory: result.get("--cache-directory"),
    artifactRoot: result.get("--artifact-root"),
    outputDirectory: result.get("--output-directory"),
    timeoutMs: Number(rawTimeout),
  };
}

function privateCacheDirectory(input) {
  const requested = path.resolve(input);
  try {
    lstatSync(requested);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const parent = path.dirname(requested);
    if (realpathSync(parent) !== parent) fail("CACHE_PARENT_NON_CANONICAL");
    mkdirSync(requested, { mode: 0o700 });
  }
  chmodSync(requested, 0o700);
  return realpathSync(requested);
}

export async function runSigstoreTufRekorV2RouteAcquisitionV1(input) {
  const cachePath = privateCacheDirectory(input.cacheDirectory);
  const artifactRoot = realpathSync(path.resolve(input.artifactRoot));
  const outputDirectory = path.resolve(input.outputDirectory);
  const acquisition = await acquireSigstoreTufRekorV2RouteV1({
    cachePath, timeoutMs: input.timeoutMs,
  });
  const publication = publishSigstoreTufRekorV2RouteArtifactsV1(acquisition, {
    trustedRoot: artifactRoot, outputDirectory,
  });
  return Object.freeze({
    schema: "outsider/sigstore-tuf-rekor-v2-route-acquisition-run/v1",
    projection: acquisition.projection,
    verifiedSelectionReport: acquisition.verifiedSelectionReport,
    artifactManifest: publication.manifest,
    artifactManifestFile: publication.manifestFile,
    outputDirectory: publication.outputDirectory,
    remoteReadOnly: true,
    rekorPostPerformed: false,
    paymentPerformed: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}

async function main() {
  try {
    const result = await runSigstoreTufRekorV2RouteAcquisitionV1(
      parse(process.argv.slice(2)));
    process.stdout.write(`${canonicalizeStrict(result)}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

