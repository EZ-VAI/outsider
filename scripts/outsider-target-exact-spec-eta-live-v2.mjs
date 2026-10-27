#!/usr/bin/env node

/*
 * Versioned Target exact-spec evidence descendant.
 *
 * Reads a frozen v1 projection and its Target product-page source, then makes
 * one Target-owned public reviews GET.  A 5V/3A statement is admitted only
 * when it occurs in Target's structured ClientResponses collection.  This is
 * seller-route evidence, not authority, a reservation, an all-in quote, or an
 * outcome commitment.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, realpathSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";

const PREFIX = "OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const KEY = /^[a-f0-9]{40}$/u;
const PRIVATE_ROOT = path.join(process.cwd(), ".outsider", "private");

export const OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY = Object.freeze({
  provider: "TARGET_PUBLIC_WEB_REDSKY_AND_REVIEWS",
  transport: "MACHINE_HTTPS_GET",
  currentTargetReviewsGetCount: 1,
  inheritedTargetProductPageGetCount: 1,
  inheritedTargetRedskyGetCount: 2,
  nameAccepted: false, emailAccepted: false, phoneAccepted: false,
  streetAddressAccepted: false, cartMutationAllowed: false,
  capacityReservationAllowed: false, checkoutAllowed: false,
  paymentAllowed: false, orderAllowed: false,
  rawTargetBytesProjected: false, postalCodeProjected: false,
  coordinatesProjected: false, atpIsCapacityReservation: false,
  deliveryEtaIsBindingCommitment: false, partialTotalIsAllInTotal: false,
  sellerClientResponseIsIndependentOutcomeTruth: false,
  authorityMinted: false, outcomeCommitted: false,
});

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function sha(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("PRIVATE_DIRECTORY_INVALID");
}

function writeOnce0600(file, bytes) {
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  return Object.freeze({ byteLength: bytes.length, bytesHash: sha(bytes) });
}

function writeJson0600(file, value) {
  return writeOnce0600(file,
    Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function privateFile(privateRoot, file, maximumBytes = 4 * 1024 * 1024) {
  const root = realpathSync(path.resolve(privateRoot));
  const absolute = realpathSync(path.resolve(file));
  if (!absolute.startsWith(`${root}${path.sep}`)) fail("SOURCE_OUTSIDE_PRIVATE_ROOT");
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
    || info.size < 3 || info.size > maximumBytes) fail("SOURCE_FILE_INVALID");
  return Object.freeze({ absolute, bytes: readFileSync(absolute) });
}

function readV1Projection(privateRoot, file) {
  const source = privateFile(privateRoot, file, 1024 * 1024);
  let value;
  try { value = JSON.parse(source.bytes.toString("utf8")); }
  catch { fail("PREDECESSOR_JSON_INVALID"); }
  if (value.schema !== "outsider/target-exact-spec-eta-route-evidence/v1"
    || !HASH.test(value.projectionHash ?? "")) fail("PREDECESSOR_SCHEMA_INVALID");
  const body = { ...value };
  delete body.projectionHash;
  if (digest(value.schema, body) !== value.projectionHash) {
    fail("PREDECESSOR_HASH_INVALID");
  }
  return Object.freeze({ ...source, value });
}

export function extractTargetPublicApiKey(pageBytes) {
  const text = pageBytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(pageBytes)) fail("PAGE_UTF8_INVALID");
  const marker = '\\"apiKey\\":\\"';
  const nova = '\\"},\\"nova\\":{\\"baseUrl\\":\\"https://r2d2.target.com/';
  const novaIndex = text.indexOf(nova);
  const keyIndex = text.lastIndexOf(marker, novaIndex);
  if (novaIndex < 0 || keyIndex < 0) fail("PUBLIC_API_CONFIG_MISSING");
  const start = keyIndex + marker.length;
  const end = text.indexOf('\\"', start);
  const key = text.slice(start, end);
  if (!KEY.test(key)) fail("PUBLIC_API_KEY_INVALID");
  return key;
}

async function getReviews(tcin, key, fetchImpl) {
  const url = new URL("https://r2d2.target.com/ratings_reviews_api/v1/reviews-overview");
  const query = {
    key, includes: "reviews,reviewsWithMedia,mediaThumbnails,entities,metadata,statistics",
    page: "0", reviewedId: tcin, reviewType: "PRODUCT", size: "50",
    sortBy: "most_recent", hasOnlyPhotos: "false", hasOnlyVideos: "false",
    verifiedOnly: "false",
  };
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const response = await fetchImpl(url, {
    method: "GET", redirect: "manual", credentials: "omit",
    headers: { accept: "application/json", origin: "https://www.target.com",
      referer: `https://www.target.com/p/-/A-${tcin}` },
  });
  if (response.status !== 200) fail("REVIEWS_STATUS_INVALID");
  if (!/^application\/json(?:\s*;|\s*$)/iu.test(
    response.headers.get("content-type") ?? "")) fail("REVIEWS_CONTENT_TYPE_INVALID");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 2 * 1024 * 1024) {
    fail("REVIEWS_BYTES_INVALID");
  }
  return bytes;
}

export function evaluateSellerVoltageEvidence(bytes) {
  let document;
  try { document = JSON.parse(bytes.toString("utf8")); }
  catch { fail("REVIEWS_JSON_INVALID"); }
  const results = document?.reviews?.results;
  if (!Array.isArray(results)) fail("REVIEWS_SHAPE_INVALID");
  let clientResponseCount = 0;
  let exactResponseCount = 0;
  for (const review of results) {
    const responses = review?.ClientResponses;
    if (!Array.isArray(responses)) continue;
    for (const response of responses) {
      clientResponseCount += 1;
      if (typeof response?.text === "string"
        && /5\s*V\s*[/x×]\s*3(?:\.0)?\s*A/iu.test(response.text)
        && /(?:rated|rating|up\s+to|15\s*W)/iu.test(response.text)) {
        exactResponseCount += 1;
      }
    }
  }
  return Object.freeze({ sellerClientResponseCollectionObserved: true,
    clientResponseCount, exactFiveVoltThreeAmpResponseCount: exactResponseCount,
    exactFiveVoltThreeAmpSellerResponseObserved: exactResponseCount > 0,
    nominalVoltageV: exactResponseCount > 0 ? 5 : null,
    maximumCurrentA: exactResponseCount > 0 ? 3 : null,
    ratedPowerW: exactResponseCount > 0 ? 15 : null });
}

export async function runTargetExactSpecEtaLiveV2(options = {}) {
  const observedAt = options.observedAt ?? new Date().toISOString();
  if (new Date(Date.parse(observedAt)).toISOString() !== observedAt) fail("OBSERVED_AT_INVALID");
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? PRIVATE_ROOT);
  ensurePrivateDirectory(privateRoot);
  const predecessor = readV1Projection(privateRoot, options.predecessorProjectionFile);
  const pagePath = path.join(path.dirname(predecessor.absolute),
    "target-product-page.source-v1.bin");
  const page = privateFile(privateRoot, pagePath);
  if (sha(page.bytes) !== predecessor.value.sourceOccurrences.productPage.bytesHash) {
    fail("PRODUCT_PAGE_HASH_INVALID");
  }
  const tcin = options.tcin ?? "53244895";
  if (tcin !== "53244895") fail("TCIN_INVALID");
  const key = extractTargetPublicApiKey(page.bytes);
  const reviewBytes = await getReviews(tcin, key, options.fetchImpl ?? globalThis.fetch);
  const runDirectory = path.join(privateRoot,
    `target-exact-spec-eta-live-v2-${observedAt.slice(0, 10).replaceAll("-", "")}-${nonce}`);
  ensurePrivateDirectory(runDirectory);
  const receipt = writeOnce0600(path.join(runDirectory,
    "target-reviews.source-v1.json"), reviewBytes);
  const occurrenceHash = digest("outsider/target-reviews-source-occurrence/v1", {
    observedAt, tcin, sourceBytesHash: receipt.bytesHash,
    occurrenceNonceHash: digest("outsider/target-reviews-occurrence-nonce/v1", { nonce }),
  });
  const voltage = evaluateSellerVoltageEvidence(reviewBytes);
  const inherited = predecessor.value;
  const checks = { ...inherited.specification.checks,
    fiveVoltPower: voltage.exactFiveVoltThreeAmpSellerResponseObserved };
  const exact = Object.values(checks).every(Boolean);
  const withinDeadline = inherited.routeAssessment.structuredEtaWithinDeadline === true;
  const body = {
    schema: "outsider/target-exact-spec-eta-route-evidence/v2",
    schemaVersion: "2.0.0",
    recordClass: "TARGET_SELLER_SOURCE_COMPOSED_READ_ONLY_RECOVERY_ROUTE_EVIDENCE",
    observedAt,
    supersedes: { schema: inherited.schema,
      projectionHash: inherited.projectionHash, observedAt: inherited.observedAt },
    frozenPredicate: inherited.frozenPredicate,
    specification: { checks, exactSpecificationSatisfied: exact,
      itemPriceMinor: inherited.specification.itemPriceMinor,
      lengthMm: inherited.specification.lengthMm,
      normalizedElectricalRating: { nominalVoltageV: voltage.nominalVoltageV,
        maximumCurrentA: voltage.maximumCurrentA, ratedPowerW: voltage.ratedPowerW },
      sellerResponseEvidence: voltage,
      sourceOccurrenceHashes: [...inherited.specification.sourceOccurrenceHashes,
        occurrenceHash] },
    postalFulfillment: inherited.postalFulfillment,
    price: inherited.price,
    capacity: inherited.capacity,
    routeAssessment: {
      state: exact && withinDeadline
        ? "SPEC_AND_STRUCTURED_ETA_OBSERVED_CAPACITY_AND_ALL_IN_UNPROVEN"
        : "SOURCE_REQUIREMENTS_INCOMPLETE",
      exactSpecificationSatisfied: exact,
      structuredEtaWithinDeadline: withinDeadline,
      allInTotalEstablished: false, capacityReserved: false, commitEligible: false,
    },
    sourceOccurrences: { ...inherited.sourceOccurrences,
      targetReviews: { occurrenceHash, bytesHash: receipt.bytesHash,
        byteLength: receipt.byteLength } },
    externalEffects: { targetReviewsPublicGets: 1,
      inheritedTargetProductPagePublicGets:
        inherited.externalEffects.targetProductPagePublicGets,
      inheritedRedskyPublicGets: inherited.externalEffects.inheritedRedskyPublicGets,
      contactSubmissions: 0, streetAddressSubmissions: 0, cartMutations: 0,
      capacityReservations: 0, checkoutSubmissions: 0, paymentAttempts: 0,
      orderSubmissions: 0 },
    privacyBoundary: { nameProjected: false, emailProjected: false,
      phoneProjected: false, streetAddressProjected: false,
      postalCodeProjected: false, coordinatesProjected: false,
      rawTargetBytesProjected: false },
    authority: "NONE", actionReady: false, executable: false,
    boundary: OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY,
  };
  const projection = Object.freeze({ ...body,
    projectionHash: digest(body.schema, body) });
  const projectionFile = path.join(runDirectory,
    "route-evidence.public-projection.v2.json");
  const projectionReceipt = writeJson0600(projectionFile, projection);
  const manifestReceipt = writeJson0600(path.join(runDirectory,
    "private-manifest.v2.json"), {
    schema: "outsider/private-target-exact-spec-eta-run-manifest/v2",
    observedAt, runRefHash: digest("outsider/target-exact-spec-eta-run/v2",
      { nonce, observedAt }), predecessorProjectionPath: predecessor.absolute,
    predecessorProjectionFileHash: sha(predecessor.bytes),
    targetPublicApiKeyProjected: false,
    targetReviewsSource: receipt, targetReviewsOccurrenceHash: occurrenceHash,
    publicProjectionHash: projection.projectionHash,
    externalEffects: projection.externalEffects,
  });
  return Object.freeze({ runDirectory, projection, projectionFile,
    projectionReceipt, manifestReceipt });
}

async function main(argv) {
  const index = argv.indexOf("--predecessor-projection");
  if (!argv.includes("--live-read-only") || index < 0
    || argv[index + 1] === undefined) fail("CLI_ARGUMENTS_INVALID");
  const result = await runTargetExactSpecEtaLiveV2({
    predecessorProjectionFile: argv[index + 1],
  });
  process.stdout.write(`${canonicalizeStrict({
    artifactRef: path.basename(result.runDirectory),
    observedAt: result.projection.observedAt,
    projectionHash: result.projection.projectionHash,
    specification: result.projection.specification,
    postalFulfillment: result.projection.postalFulfillment,
    price: result.projection.price,
    capacity: result.projection.capacity,
    routeAssessment: result.projection.routeAssessment,
    externalEffects: result.projection.externalEffects,
  })}\n`);
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
