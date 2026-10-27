#!/usr/bin/env node

/*
 * Globalping HTTP witness runner v2.
 *
 * Prepare mode is pure validation and performs no filesystem or network I/O
 * beyond reading the caller's 0600 canonical input. Live mode is intentionally
 * awkward to trigger: it requires both --live and an exact confirmation of the
 * salted private binding commitment. It never reads an API token, permits one
 * unauthenticated/one-probe create POST, performs zero POST retries, and then
 * uses only exact-id GET reconciliation. Every result remains HOLD.
 */

import {
  lstatSync, readFileSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createGlobalpingHttpWitnessPlanV2,
  executeGlobalpingHttpWitnessObservationV2,
  OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_LINEAGE,
  OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_SOURCE_PINS,
} from "../src/outsider-globalping-http-witness-node-v2.js";

const PREFIX = "OUTSIDER_GLOBALPING_HTTP_WITNESS_RUNNER_V2_";
const CONFIRMATION = "ONE_UNAUTHENTICATED_PROBE_ONE_POST_ZERO_RETRY_HOLD";
const MAX_INPUT_BYTES = 1024 * 1024;

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) fail(`${flag.slice(2)
    .toUpperCase().replaceAll("-", "_")}_REQUIRED`);
  return argv[index + 1];
}

function readPrivateCanonicalJson(filename) {
  const absolute = path.resolve(filename);
  let stat;
  try { stat = lstatSync(absolute); } catch { fail("INPUT_UNREADABLE"); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2
    || stat.size > MAX_INPUT_BYTES || (stat.mode & 0o077) !== 0
    || realpathSync(absolute) !== absolute) fail("PRIVATE_0600_INPUT_REQUIRED");
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("INPUT_JSON_INVALID"); }
  const canonical = Buffer.from(canonicalizeStrict(value), "utf8");
  if (!(bytes.equals(canonical)
    || bytes.equals(Buffer.concat([canonical, Buffer.from("\n")])))) {
    fail("INPUT_NON_CANONICAL");
  }
  return value;
}

function prepare(document) {
  if (document === null || typeof document !== "object"
    || Array.isArray(document) || document.planInput === null
    || typeof document.planInput !== "object") fail("DOCUMENT_INVALID");
  return createGlobalpingHttpWitnessPlanV2(document.planInput);
}

function safePreparationProjection(plan) {
  return Object.freeze({
    schema: "outsider/globalping-http-witness-live-preparation/v2",
    ok: true,
    source: "GLOBALPING_PUBLIC_API",
    lineage: OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_LINEAGE,
    sourcePins: OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_SOURCE_PINS,
    targetSelectionVerificationPerformedByThisModule: false,
    privateTargetAndRequirementsBindingCommitment:
      plan.privateBindingCommitment,
    exactTargetDisclosed: false,
    measuredTargetMethodClass: "READ_ONLY_HEAD_OR_GET",
    probeLimit: 1,
    globalpingAuthenticationUsed: false,
    paidCreditsPermitted: false,
    createPostMaximumAttempts: 1,
    createPostAutomaticRetryCount: 0,
    statusReconciliationMethod: "EXACT_RETURNED_ID_GET_ONLY",
    liveExecutionPerformed: false,
    liveConfirmationPhrase: CONFIRMATION,
    independentOutcomeTruthEstablished: false,
    commitPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}

export async function runGlobalpingHttpWitnessV2(document, options = {}) {
  const plan = prepare(document);
  if (options.live !== true) return safePreparationProjection(plan);
  if (options.confirmation !== CONFIRMATION
    || options.confirmedPrivateBindingCommitment
      !== plan.privateBindingCommitment) fail("EXACT_LIVE_CONFIRMATION_REQUIRED");
  if (document.executionBinding === null
    || typeof document.executionBinding !== "object"
    || Array.isArray(document.executionBinding)) {
    fail("EXECUTION_BINDING_REQUIRED");
  }
  return executeGlobalpingHttpWitnessObservationV2({
    plan,
    privateEpisodeDirectory:
      document.executionBinding.privateEpisodeDirectory,
    ledgerId: document.executionBinding.ledgerId,
    transactionBindingHash: document.executionBinding.transactionBindingHash,
    adapterInstanceRefHash: document.executionBinding.adapterInstanceRefHash,
    permissionGrantHash: document.executionBinding.permissionGrantHash,
    oneUseNonceHash: document.executionBinding.oneUseNonceHash,
    idempotencyKeyHash: document.executionBinding.idempotencyKeyHash,
  }, options.dependencies ?? {});
}

async function main(argv) {
  if (argv.includes("--help")) {
    process.stdout.write([
      "Usage:",
      "  node tools/run-globalping-http-witness-v2.mjs --prepare --input <0600-canonical-json>",
      "  node tools/run-globalping-http-witness-v2.mjs --live --input <0600-canonical-json> \\",
      "    --confirm-private-binding <sha256:...> \\",
      `    --confirm-one-shot ${CONFIRMATION}`,
      "",
      "Prepare performs no live call. Live is unauthenticated, one probe, one POST,",
      "zero POST retries, exact-id GET reconciliation, no payment, always HOLD.",
      "",
    ].join("\n"));
    return;
  }
  const prepareOnly = argv.includes("--prepare");
  const live = argv.includes("--live");
  if (prepareOnly === live) fail("EXACTLY_ONE_MODE_REQUIRED");
  const document = readPrivateCanonicalJson(flagValue(argv, "--input"));
  const result = await runGlobalpingHttpWitnessV2(document, live ? {
    live: true,
    confirmation: flagValue(argv, "--confirm-one-shot"),
    confirmedPrivateBindingCommitment:
      flagValue(argv, "--confirm-private-binding"),
  } : { live: false });
  process.stdout.write(`${canonicalizeStrict(result)}\n`);
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${String(error?.message ?? `${PREFIX}FAILURE`)}\n`);
    process.exitCode = 1;
  });
}
