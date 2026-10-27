#!/usr/bin/env node

/*
 * Target RedSky v2 live read-only runner.
 *
 * Performs exactly one public PDP GET and one public postal fulfillment GET.
 * It does not create a cart, authenticate, supply a street address, reserve
 * inventory, pay, or submit an order. Exact provider bytes remain in the
 * buyer-native runtime's private 0600 source store. The materialized formation
 * projection deliberately excludes postal code, coordinates, and contacts.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import { createTargetRedskyCandidateCommandBytesV1 } from "../src/outsider-target-redsky-candidate-route-v1.js";
import {
  issueTargetRedskyCandidateBuyerNativeCapabilityV2,
  materializeTargetRedskyFormationCandidateProjectionV2,
} from "../src/outsider-target-redsky-candidate-route-v2.js";

const PREFIX = "OUTSIDER_TARGET_REDSKY_READ_ONLY_LIVE_V2_";
const PRIVATE_ROOT = path.join(process.cwd(), ".outsider", "private");
const PRIVATE_OUTCOME_INPUT = path.join(PRIVATE_ROOT,
  "first-physical-destination-formation-request-20260904.v2.json");
const PRIVATE_PRIOR_ROUTE_BINDING = path.join(PRIVATE_ROOT,
  "target-buyer-native-route-20260904-154607Z", "private-manifest.json");
const NON_PRIVATE_ROUTE_DEFAULTS = Object.freeze({
  fulfillmentStoreId: "2822",
  maximumAmountMinor: "2000",
  pricingStoreId: "2822",
  quantity: 1,
  requestedDeliveryDate: "2026-09-10",
  tcin: "91252434",
});

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function addMilliseconds(instant, milliseconds) {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    fail("PRIVATE_DIRECTORY_INVALID");
  }
}

function readPrivateJson(privateRoot, file, code) {
  const root = realpathSync(privateRoot);
  const absolute = realpathSync(path.resolve(file));
  if (!absolute.startsWith(`${root}${path.sep}`)) fail(`${code}_OUTSIDE_PRIVATE_ROOT`);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    fail(`${code}_NOT_0600_REGULAR_FILE`);
  }
  try { return JSON.parse(readFileSync(absolute, "utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
}

function loadPrivateRouteBinding(privateRoot, outcomeInputFile, priorRouteBindingFile) {
  const outcome = readPrivateJson(privateRoot, outcomeInputFile, "OUTCOME_INPUT");
  const prior = readPrivateJson(privateRoot, priorRouteBindingFile, "PRIOR_ROUTE_BINDING");
  if (outcome.schema
      !== "outsider/private-first-physical-outcome-destination-formation-request/v2"
    || outcome.schemaVersion !== "2.0.0") fail("OUTCOME_INPUT_SCHEMA_INVALID");
  const postalCode = outcome.destination?.postalCode;
  const state = outcome.destination?.region;
  if (typeof postalCode !== "string" || !/^\d{5}(?:-\d{4})?$/u.test(postalCode)
    || typeof state !== "string" || !/^[A-Z]{2}$/u.test(state)) {
    fail("OUTCOME_DESTINATION_BINDING_INVALID");
  }
  const fulfillmentSource = prior.sources?.find((source) =>
    source?.method === "GET" && typeof source.url === "string"
      && new URL(source.url).pathname.endsWith("product_fulfillment_v1"));
  if (!fulfillmentSource) fail("PRIOR_FULFILLMENT_BINDING_MISSING");
  const sourceUrl = new URL(fulfillmentSource.url);
  const latitude = Number(sourceUrl.searchParams.get("latitude"));
  const longitude = Number(sourceUrl.searchParams.get("longitude"));
  if (sourceUrl.protocol !== "https:" || sourceUrl.hostname !== "redsky.target.com"
    || sourceUrl.searchParams.get("zip") !== postalCode
    || sourceUrl.searchParams.get("state") !== state
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    fail("PRIOR_FULFILLMENT_BINDING_INVALID");
  }
  return Object.freeze({
    ...NON_PRIVATE_ROUTE_DEFAULTS,
    fulfillmentStoreId: sourceUrl.searchParams.get("store_id")
      ?? NON_PRIVATE_ROUTE_DEFAULTS.fulfillmentStoreId,
    latitude,
    longitude,
    postalCode,
    pricingStoreId: sourceUrl.searchParams.get("pricing_store_id")
      ?? NON_PRIVATE_ROUTE_DEFAULTS.pricingStoreId,
    state,
  });
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce0600(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  return Object.freeze({ bytes: bytes.byteLength, hash: bytesHash(bytes) });
}

export async function runTargetRedskyReadOnlyLiveV2(options = {}) {
  const observedAt = options.observedAt ?? new Date().toISOString();
  if (new Date(Date.parse(observedAt)).toISOString() !== observedAt) fail("OBSERVED_AT_INVALID");
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? PRIVATE_ROOT);
  ensurePrivateDirectory(privateRoot);
  const loadedBinding = loadPrivateRouteBinding(
    privateRoot,
    options.outcomeInputFile ?? PRIVATE_OUTCOME_INPUT,
    options.priorRouteBindingFile ?? PRIVATE_PRIOR_ROUTE_BINDING,
  );
  const selectedTcin = options.tcin ?? loadedBinding.tcin;
  if (typeof selectedTcin !== "string" || !/^[1-9]\d{7}$/u.test(selectedTcin)) {
    fail("TCIN_OVERRIDE_INVALID");
  }
  const binding = Object.freeze({ ...loadedBinding, tcin: selectedTcin });
  const runDirectory = path.join(privateRoot,
    `target-redsky-read-only-live-v2-${observedAt.slice(0, 10).replaceAll("-", "")}-${nonce}`);
  const runtimeDirectory = path.join(runDirectory, "runtime");
  ensurePrivateDirectory(runDirectory);
  ensurePrivateDirectory(runtimeDirectory);

  const expiresAt = addMilliseconds(observedAt, 30 * 60 * 1_000);
  const requestExpiresAt = addMilliseconds(observedAt, 15 * 60 * 1_000);
  const ref = (label) => digest("outsider/target-redsky-read-only-live/v2", { label, nonce });
  const capability = issueTargetRedskyCandidateBuyerNativeCapabilityV2({
    accountRefHash: ref("public-accountless-redsky-route"),
    capabilityRefHash: ref("capability"),
    expiresAt,
    issuedAt: observedAt,
    nodeRefHash: ref("target-redsky-node"),
    orderRefHash: ref("read-only-order-scope"),
    privateStateDirectory: runtimeDirectory,
    ...binding,
  }, {
    clock: () => observedAt,
    fetchImpl,
    async revalidateImpl(entry) {
      return {
        accountRefHash: entry.accountRefHash,
        active: true,
        capabilityRefHash: entry.capabilityRefHash,
        expiresAt,
        observedAt,
      };
    },
    sourceOccurrenceSink: null,
  });
  const runtime = createBuyerNativeTransactionRouteRuntimeV1({
    formationExpiresAt: expiresAt,
    journalDirectory: runtimeDirectory,
    journalId: `transaction_${nonce}`,
    outcomeIntentRefHash: ref("fixed-cable-outcome"),
    routeRole: "RECOVERY",
    transactionRefHash: ref("transaction"),
  }, { capability, clock: () => observedAt });
  const command = createTargetRedskyCandidateCommandBytesV1(binding);
  const quote = await runtime.quote({
    expectedPreviousOccurrenceHash: null,
    expiresAt: requestExpiresAt,
    operationNonce: `target-redsky-pdp-${nonce}`,
    requestBytes: command,
    triggerOccurrenceHash: null,
  });
  const status = await runtime.status({
    expectedPreviousOccurrenceHash: quote.publicProjection.sourceOccurrenceHash,
    expiresAt: requestExpiresAt,
    operationNonce: `target-redsky-fulfillment-${nonce}`,
    requestBytes: command,
    triggerOccurrenceHash: null,
  });
  const quoteClaim = claimBuyerNativeTransactionSourceOccurrenceV1(quote);
  const quoteSourceOccurrenceHash = quote.publicProjection.sourceOccurrenceHash;
  const statusClaim = claimBuyerNativeTransactionSourceOccurrenceV1(status);
  const projection = materializeTargetRedskyFormationCandidateProjectionV2({
    binding,
    fulfillmentSourceBytes: statusClaim.sourceBytes,
    fulfillmentSourceOccurrenceHash: status.publicProjection.sourceOccurrenceHash,
    observedAt,
    pdpSourceBytes: quoteClaim.sourceBytes,
    pdpSourceOccurrenceHash: quoteSourceOccurrenceHash,
  });
  const projectionFile = path.join(runDirectory, "formation-candidate.public-projection.v2.json");
  const projectionFileReceipt = writeOnce0600(projectionFile, projection);
  return Object.freeze({
    projection,
    projectionFile,
    projectionFileReceipt,
    runDirectory,
  });
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runTargetRedskyReadOnlyLiveV2();
  process.stdout.write(`${canonicalizeStrict({
    artifactRef: path.basename(result.runDirectory),
    formationDecision: result.projection.formationDecision,
    fulfillment: result.projection.fulfillment,
    observedAt: result.projection.observedAt,
    priceBoundary: result.projection.priceBoundary,
    product: result.projection.product,
    projectionFileName: path.basename(result.projectionFile),
    projectionFileReceipt: result.projectionFileReceipt,
    projectionHash: result.projection.projectionHash,
    sourceOccurrences: result.projection.sourceOccurrences,
  })}\n`);
}
