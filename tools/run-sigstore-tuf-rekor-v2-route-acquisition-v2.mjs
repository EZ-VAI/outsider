#!/usr/bin/env node

/*
 * Read-only v2 source-replay repair. Uses a fresh TUF cache, retains the exact
 * bootstrap and role chain, publishes a new private descendant artifact, then
 * re-reads that artifact and performs a second offline replay. No Rekor POST.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, lstatSync, mkdirSync, realpathSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  acquireSigstoreTufRekorV2RouteV2,
  publishSigstoreTufRekorV2RouteArtifactsV2,
  verifyPublishedSigstoreTufRekorV2RouteArtifactsV2,
} from "../src/outsider-sigstore-tuf-rekor-v2-route-acquisition-v2.js";

const PREFIX = "OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_RUNNER_V2_";
const ALLOWED = new Set([
  "--cache-directory", "--artifact-root", "--output-directory", "--timeout-ms",
]);
const fail = (code) => { throw new Error(`${PREFIX}${code}`); };

function args(argv) {
  if (argv.length % 2 !== 0) fail("ARGUMENT_PAIR_REQUIRED");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!ALLOWED.has(argv[index]) || values.has(argv[index])) fail("ARGUMENT_INVALID");
    values.set(argv[index], argv[index + 1]);
  }
  for (const name of ["--cache-directory", "--artifact-root", "--output-directory"]) {
    if (!values.has(name)) fail(`${name.slice(2).toUpperCase()}_REQUIRED`);
  }
  const rawTimeout = values.get("--timeout-ms") ?? "30000";
  if (!/^[0-9]+$/u.test(rawTimeout)) fail("TIMEOUT_INVALID");
  return { cacheDirectory: values.get("--cache-directory"),
    artifactRoot: values.get("--artifact-root"),
    outputDirectory: values.get("--output-directory"),
    timeoutMs: Number(rawTimeout) };
}

function freshPrivateCache(input) {
  const requested = path.resolve(input);
  try { lstatSync(requested); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (realpathSync(path.dirname(requested)) !== path.dirname(requested)) {
      fail("CACHE_PARENT_NON_CANONICAL");
    }
    mkdirSync(requested, { mode: 0o700 });
  }
  chmodSync(requested, 0o700);
  const result = realpathSync(requested);
  if (readdirSync(result).length !== 0) fail("FRESH_EMPTY_CACHE_REQUIRED");
  return result;
}

export async function runSigstoreTufRekorV2RouteAcquisitionV2(input) {
  const cachePath = freshPrivateCache(input.cacheDirectory);
  const artifactRoot = realpathSync(path.resolve(input.artifactRoot));
  const occurrenceNonceHash = `sha256:${createHash("sha256")
    .update(randomBytes(32)).digest("hex")}`;
  const acquired = await acquireSigstoreTufRekorV2RouteV2({
    cachePath, timeoutMs: input.timeoutMs, occurrenceNonceHash,
  });
  const publication = publishSigstoreTufRekorV2RouteArtifactsV2(acquired, {
    trustedRoot: artifactRoot,
    outputDirectory: path.resolve(input.outputDirectory),
  });
  const replay = await verifyPublishedSigstoreTufRekorV2RouteArtifactsV2(
    publication.outputDirectory, publication.manifestFile.sha256);
  return Object.freeze({
    schema: "outsider/sigstore-tuf-rekor-v2-route-acquisition-run/v2",
    projection: acquired.projection,
    verifiedSelectionReport: acquired.verifiedSelectionReport,
    manifest: publication.manifest,
    manifestFile: publication.manifestFile,
    postPublicationOfflineReplay: replay,
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
    const result = await runSigstoreTufRekorV2RouteAcquisitionV2(
      args(process.argv.slice(2)));
    process.stdout.write(`${canonicalizeStrict(result)}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

