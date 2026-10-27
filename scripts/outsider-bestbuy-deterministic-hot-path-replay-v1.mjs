#!/usr/bin/env node

/*
 * Execute the existing Best Buy source-pinned candidate through the
 * deterministic buyer-native plan runtime. This is a production-path replay
 * proof, not a live Best Buy adapter: it performs no HTTP, browser, checkout,
 * payment, reservation, or order operation.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { claimBuyerNativeTransactionSourceOccurrenceV1 }
  from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createBestBuyBuyerNativeCandidateCommandBytesV1,
  issueBestBuyBuyerNativeCandidateCapabilityV1,
  normalizeBestBuyCartSourceV1,
  normalizeBestBuyGuestCheckoutSourceV1,
  normalizeBestBuyProductSourceV1,
} from "../src/outsider-bestbuy-buyer-native-candidate-route-v1.js";
import {
  createDeterministicBuyerNativeStagePlanV1,
  executeDeterministicBuyerNativeStagePlanV1,
} from "../src/outsider-deterministic-buyer-native-plan-runtime-v1.js";

const PREFIX = "OUTSIDER_BESTBUY_DETERMINISTIC_HOT_PATH_REPLAY_V1_";
const SOURCE_DIRECTORY = path.join(process.cwd(), ".outsider", "private",
  "bestbuy-buyer-native-route-20260904-wXBrsw");
const PRIVATE_ROOT = path.join(process.cwd(), ".outsider", "private");
const PINNED_SOURCE = Object.freeze({
  capturedAt: "2026-09-04T16:09:59.684Z",
  observationHash:
    "sha256:b3f40ea4bd29be1fda9ed564791756a996c8bad5b8c34cde7bd76fd2f6870d4b",
  observationFileHash:
    "sha256:42e916f4fbc8adb2d18ffe586ca9672e108029fdabecb6cfba2b7ad65c2e27e9",
  sourceProjectionHash:
    "sha256:e512fe6524ae242d65dbfdba04acbe8a256f1c142fd01720b356d94417103666",
  sourceProjectionFileHash:
    "sha256:9fcf2cbea280f7fd723bf1f63c6e464fd896c0433e16a9e4a061a29819168498",
  files: Object.freeze({
    "product.source.html": Object.freeze({ bytes: 200171,
      hash: "sha256:cdec98899a7eddbc333b4391498bd8470f6daeccf597e382ece13dace2ce5529" }),
    "cart.source.html": Object.freeze({ bytes: 200135,
      hash: "sha256:9733f734f213b6569e5abda97d3a4bd181df681f10b73318141bdd55662f81ba" }),
    "guest-checkout.source.html": Object.freeze({ bytes: 73336,
      hash: "sha256:507f12553be14314c8c58d09dd847ac24f2a933fd1bf82471bdac5f79922697b" }),
  }),
});

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  assertPrivateDirectory(directory);
}

function assertPrivateDirectory(directory) {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("PRIVATE_DIRECTORY_INVALID");
}

function readPrivateFile(directory, name) {
  const file = path.join(directory, name);
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("SOURCE_FILE_NOT_PRIVATE");
  return readFileSync(file);
}

function requirePinnedFile(name, bytes) {
  const pin = PINNED_SOURCE.files[name];
  if (pin === undefined || bytes.length !== pin.bytes
    || bytesHash(bytes) !== pin.hash) fail("FROZEN_SOURCE_PIN_MISMATCH");
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  return Object.freeze({ bytes: bytes.length, hash: bytesHash(bytes) });
}

function addMilliseconds(instant, milliseconds) {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

export async function runBestBuyDeterministicHotPathReplayV1(options = {}) {
  const sourceDirectory = path.resolve(options.sourceDirectory
    ?? SOURCE_DIRECTORY);
  const privateRoot = path.resolve(options.privateRoot ?? PRIVATE_ROOT);
  const replayedAt = options.replayedAt ?? options.observedAt
    ?? new Date().toISOString();
  if (new Date(Date.parse(replayedAt)).toISOString() !== replayedAt) {
    fail("REPLAYED_AT_INVALID");
  }
  assertPrivateDirectory(sourceDirectory);
  ensurePrivateDirectory(privateRoot);
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const projectionFileName = options.projectionFileName
    ?? "public-projection.json";
  if (!/^[a-z0-9][a-z0-9.-]{0,127}\.json$/u.test(projectionFileName)) {
    fail("PROJECTION_FILE_NAME_INVALID");
  }
  const runDirectory = path.join(privateRoot,
    `bestbuy-deterministic-hot-path-replay-${replayedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  ensurePrivateDirectory(runDirectory);
  const journalDirectory = path.join(runDirectory, "runtime");
  ensurePrivateDirectory(journalDirectory);

  const productSource = readPrivateFile(sourceDirectory,
    "product.source.html");
  const cartSource = readPrivateFile(sourceDirectory, "cart.source.html");
  const guestSource = readPrivateFile(sourceDirectory,
    "guest-checkout.source.html");
  const reviewedEvidence = readPrivateFile(sourceDirectory,
    "private-observation.v2.json");
  const sourceProjectionBytes = readPrivateFile(sourceDirectory,
    "public-summary.v2.json");
  requirePinnedFile("product.source.html", productSource);
  requirePinnedFile("cart.source.html", cartSource);
  requirePinnedFile("guest-checkout.source.html", guestSource);
  if (bytesHash(reviewedEvidence) !== PINNED_SOURCE.observationFileHash
    || bytesHash(sourceProjectionBytes)
      !== PINNED_SOURCE.sourceProjectionFileHash) {
    fail("FROZEN_MANIFEST_PIN_MISMATCH");
  }
  const sourceObservation = JSON.parse(reviewedEvidence.toString("utf8"));
  const sourceProjection = JSON.parse(sourceProjectionBytes.toString("utf8"));
  const candidate = sourceObservation.candidates?.[0];
  const destination = sourceObservation.destination;
  const projectedEvidence = new Map(sourceProjection.provenance?.evidence
    ?.map((entry) => [entry.name, entry]) ?? []);
  if (sourceObservation.schema
      !== "outsider/bestbuy-buyer-native-route-private-observation/v2"
    || sourceObservation.observedAt !== PINNED_SOURCE.capturedAt
    || sourceObservation.observationHash !== PINNED_SOURCE.observationHash
    || sourceProjection.schema
      !== "outsider/bestbuy-buyer-native-route-public-projection/v2"
    || sourceProjection.projectionHash !== PINNED_SOURCE.sourceProjectionHash
    || Object.entries(PINNED_SOURCE.files).some(([name, pin]) => {
      const entry = projectedEvidence.get(name);
      return entry?.bytes !== pin.bytes || entry?.sha256 !== pin.hash
        || entry?.mode !== "0600";
    })
    || candidate?.sku !== "12150546"
    || destination?.postalCode !== "02446"
    || destination.requestedDeliveryDate !== "2026-09-10"
    || destination.maximumAmountMinor !== 2000) {
    fail("SOURCE_OBSERVATION_BINDING_INVALID");
  }

  const binding = {
    sku: candidate.sku,
    bsin: "JJ858RS2Z5",
    postalCode: destination.postalCode,
    requestedCableQuantity: 1,
    cartLineQuantity: candidate.cartLineQuantity,
    requestedDeliveryDate: destination.requestedDeliveryDate,
    maximumAmountMinor: String(destination.maximumAmountMinor),
    reviewedProductSpec: {
      packCableQuantity: candidate.packCableQuantity,
      cableLengthFeet: candidate.cableLengthFeet,
      connectorA: candidate.connectorA,
      connectorB: candidate.connectorB,
      connectorGender: "MALE_TO_MALE",
      powerClaim: "3A/5V up to 15W",
      dataTransferClaim: "up to 480Mbps",
      evidenceRefHash: bytesHash(reviewedEvidence),
    },
    sourcePins: {
      productSourceBytesHash: bytesHash(productSource),
      cartSourceBytesHash: bytesHash(cartSource),
      guestCheckoutSourceBytesHash: bytesHash(guestSource),
    },
  };
  const capturedAt = PINNED_SOURCE.capturedAt;
  const expiresAt = addMilliseconds(capturedAt, 30 * 60 * 1_000);
  const ref = (label) => digest(
    "outsider/bestbuy-deterministic-hot-path-replay/v2", { nonce, label });
  const sources = Object.freeze({ PRODUCT: productSource, CART: cartSource,
    GUEST_CHECKOUT: guestSource });
  let sourceReadCount = 0;
  const capability = issueBestBuyBuyerNativeCandidateCapabilityV1({
    capabilityRefHash: ref("capability"),
    accountRefHash: ref("source-account"),
    nodeRefHash: ref("source-node"),
    issuedAt: capturedAt,
    expiresAt,
    binding,
  }, {
    async readSourceImpl({ stage }) {
      sourceReadCount += 1;
      return Buffer.from(sources[stage]);
    },
    async revalidateImpl(input) {
      return { active: true,
        capabilityRefHash: input.capabilityRefHash,
        accountRefHash: input.accountRefHash,
        observedAt: input.observedAt,
        expiresAt };
    },
    sourceOccurrenceSink: null,
  });
  const command = (stage) =>
    createBestBuyBuyerNativeCandidateCommandBytesV1({ binding, stage });
  const transactionRefHash = ref("transaction");
  const plan = createDeterministicBuyerNativeStagePlanV1({
    planRefHash: ref("plan"),
    transactionRefHash,
    outcomeIntentRefHash: ref("frozen-outcome"),
    capability,
    capabilityBindingHash: capability.capabilityBindingHash,
    routeRole: "RECOVERY",
    formationExpiresAt: expiresAt,
    stages: [
      { stageId: "01-product", operation: "QUOTE",
        operationNonce: `bestbuy-product-${nonce}`,
        requestBytes: command("PRODUCT"), expiresAt,
        triggerOccurrenceHash: null },
      { stageId: "02-cart", operation: "STATUS",
        operationNonce: `bestbuy-cart-${nonce}`,
        requestBytes: command("CART"), expiresAt,
        triggerOccurrenceHash: null },
      { stageId: "03-guest-checkout", operation: "STATUS",
        operationNonce: `bestbuy-guest-${nonce}`,
        requestBytes: command("GUEST_CHECKOUT"), expiresAt,
        triggerOccurrenceHash: null },
    ],
  });
  const execution = await executeDeterministicBuyerNativeStagePlanV1({
    plan,
    expectedPlanHash: plan.planHash,
    journalDirectory,
    journalId: `transaction_${transactionRefHash.slice(7, 39)}`,
  }, { capability, clock: () => capturedAt,
    monotonicClock: () => performance.now() });

  const [productResult, cartResult, guestResult]
    = execution.stageResults.map(({ operationResult }) => operationResult);
  const productClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
    productResult);
  const cartClaim = claimBuyerNativeTransactionSourceOccurrenceV1(cartResult);
  const guestClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
    guestResult);
  const product = normalizeBestBuyProductSourceV1(productClaim.sourceBytes, {
    sku: binding.sku, bsin: binding.bsin,
    requestedCableQuantity: binding.requestedCableQuantity,
    reviewedProductSpec: binding.reviewedProductSpec,
  });
  const cart = normalizeBestBuyCartSourceV1(cartClaim.sourceBytes, {
    sku: binding.sku, bsin: binding.bsin,
    postalCode: binding.postalCode,
    cartLineQuantity: binding.cartLineQuantity,
    requestedDeliveryDate: binding.requestedDeliveryDate,
    maximumAmountMinor: binding.maximumAmountMinor,
  });
  const guest = normalizeBestBuyGuestCheckoutSourceV1(guestClaim.sourceBytes, {
    cartLineQuantity: binding.cartLineQuantity,
  });
  const body = {
    schema: "outsider/bestbuy-deterministic-hot-path-replay/v2",
    schemaVersion: "2.0.0",
    capturedAt,
    replayedAt,
    executionClass: "HISTORICAL_SOURCE_PINNED_REPLAY_NOT_LIVE",
    sourceObservationHash: PINNED_SOURCE.observationHash,
    sourceProjectionHash: PINNED_SOURCE.sourceProjectionHash,
    historicalSourceOnly: true,
    sourceValidAtReplay: Date.parse(replayedAt) < Date.parse(expiresAt),
    provider: "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE",
    planHash: plan.planHash,
    capabilityBindingHash: capability.capabilityBindingHash,
    executionState: execution.publicProjection.executionState,
    counters: execution.publicProjection.counters,
    sourceReadCount,
    liveHttpRequestCount: 0,
    stages: execution.publicProjection.stages.map((stage, index) => ({
      sequence: stage.sequence,
      stageId: stage.stageId,
      operation: stage.operation,
      sourceOccurrenceHash: stage.result.sourceOccurrenceHash,
      sourceBytesHash: stage.result.sourceBytesHash,
      sourceBytesLength: [productClaim, cartClaim, guestClaim][index]
        .sourceBytes.length,
      journalReplayed: stage.result.replayed,
    })),
    candidate: {
      sku: binding.sku,
      exactAcceptanceSatisfied: product.exactAcceptanceSatisfied,
      surplusCableQuantity: product.surplusCableQuantity,
      surplusAuthorizationRequired: product.surplusAuthorizationRequired,
      anonymousCartAccepted: cart.anonymousCartAccepted,
      displayedAllInTotalMinor: cart.displayedAllInTotalMinor,
      sourceEtaDate: cart.sourceEtaDate,
      sourceDateMeetsRequestedDeadline:
        cart.sourceDateMeetsRequestedDeadline,
      guestCheckoutOffered: guest.guestCheckoutOffered,
      accountRequiredForCheckout: guest.accountRequiredForCheckout,
    },
    decisionState: "HOLD",
    blockers: ["SOURCE_REPLAY_IS_NOT_LIVE_TRANSACTION",
      "HISTORICAL_QUOTE_NOT_RENEWED_BY_REPLAY",
      "SURPLUS_PRODUCT_QUANTITY_REQUIRES_USER_AUTHORIZATION",
      "CART_IS_NOT_CAPACITY_RESERVATION",
      "FULL_ADDRESS_DELIVERABILITY_NOT_PROVEN",
      "PAYMENT_AND_ORDER_AUTHORITY_NOT_PRESENT"],
    sourceReplayOnly: true,
    capacityReserved: false,
    paymentPerformed: false,
    orderSubmitted: false,
    independentOutcomeEstablished: false,
    outcomePromiseIssued: false,
  };
  const projection = Object.freeze({ ...body,
    projectionHash: digest(body.schema, body) });
  const artifact = writeOnce(path.join(runDirectory, projectionFileName),
    projection);
  return Object.freeze({ runDirectory, projection, artifact });
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runBestBuyDeterministicHotPathReplayV1();
  process.stdout.write(`${JSON.stringify({
    runDirectory: result.runDirectory,
    projection: result.projection,
    artifact: result.artifact,
  }, null, 2)}\n`);
}
