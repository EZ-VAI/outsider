#!/usr/bin/env node

/*
 * Target exact-spec + postal ETA evidence composition v1.
 *
 * One Target-owned product-page GET is composed with an immutable prior
 * Target RedSky v2 PDP/fulfillment projection.  This descendant evaluates the
 * currently requested predicate (USB-A male -> USB-C male, data, 5V power,
 * length >= 0.9m, quantity one, item price below USD 20).  It performs no
 * cart, address, account, checkout, payment, order, or reservation operation.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, realpathSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";

const PREFIX = "OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TCIN = /^[1-9]\d{7}$/u;
const PRIVATE_ROOT = path.join(process.cwd(), ".outsider", "private");

export const OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V1_BOUNDARY = Object.freeze({
  provider: "TARGET_PUBLIC_WEB_AND_REDSKY",
  transport: "MACHINE_HTTPS_GET",
  currentTargetProductPageGetCount: 1,
  inheritedTargetRedskyGetCount: 2,
  postalFulfillmentObserved: true,
  nameAccepted: false,
  emailAccepted: false,
  phoneAccepted: false,
  streetAddressAccepted: false,
  cartMutationAllowed: false,
  capacityReservationAllowed: false,
  checkoutAllowed: false,
  paymentAllowed: false,
  orderAllowed: false,
  rawTargetBytesProjected: false,
  postalCodeProjected: false,
  coordinatesProjected: false,
  atpIsCapacityReservation: false,
  deliveryEtaIsBindingCommitment: false,
  partialTotalIsAllInTotal: false,
  authorityMinted: false,
  independentOutcomeTruthEstablished: false,
  outcomeCommitted: false,
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

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce0600(file, bytes) {
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
  return Object.freeze({ byteLength: bytes.length, bytesHash: sha(bytes) });
}

function writeJson0600(file, value) {
  return writeOnce0600(file,
    Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function privateProjection(privateRoot, file) {
  const root = realpathSync(path.resolve(privateRoot));
  const absolute = realpathSync(path.resolve(file));
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    fail("PREDECESSOR_OUTSIDE_PRIVATE_ROOT");
  }
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0 || info.size < 3
    || info.size > 1024 * 1024) fail("PREDECESSOR_FILE_INVALID");
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PREDECESSOR_JSON_INVALID"); }
  if (value.schema !== "outsider/target-redsky-formation-candidate/v2"
    || typeof value.projectionHash !== "string"
    || !HASH.test(value.projectionHash)) fail("PREDECESSOR_SCHEMA_INVALID");
  const body = { ...value };
  delete body.projectionHash;
  if (sha(Buffer.from(canonicalizeStrict(body), "utf8"))
      !== value.projectionHash) fail("PREDECESSOR_HASH_INVALID");
  return Object.freeze({ absolute, bytes, value });
}

function targetProductUrl(tcin) {
  if (typeof tcin !== "string" || !TCIN.test(tcin)) fail("TCIN_INVALID");
  return `https://www.target.com/p/-/A-${tcin}`;
}

async function getTargetPage(tcin, fetchImpl) {
  const initial = targetProductUrl(tcin);
  let current = initial;
  for (let redirects = 0; redirects <= 1; redirects += 1) {
    const response = await fetchImpl(current, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
          + "AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (redirects === 1 || location === null) fail("REDIRECT_INVALID");
      const next = new URL(location, current);
      if (next.protocol !== "https:" || next.hostname !== "www.target.com"
        || !next.pathname.endsWith(`A-${tcin}`)) fail("REDIRECT_TARGET_INVALID");
      current = next.href;
      continue;
    }
    if (response.status !== 200) fail("PRODUCT_PAGE_STATUS_INVALID");
    const type = response.headers.get("content-type") ?? "";
    if (!/^text\/html(?:\s*;|\s*$)/iu.test(type)) {
      fail("PRODUCT_PAGE_CONTENT_TYPE_INVALID");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1_000 || bytes.length > 4 * 1024 * 1024) {
      fail("PRODUCT_PAGE_BYTES_INVALID");
    }
    return Object.freeze({ bytes, finalUrl: current,
      redirectCount: redirects });
  }
  fail("PRODUCT_PAGE_REDIRECT_LIMIT");
}

function sourceText(bytes) {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) fail("PAGE_UTF8_INVALID");
  return text.replaceAll("\\u0026", "&").replaceAll("\\u0027", "'")
    .replaceAll("&amp;", "&").replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ");
}

function evaluateSpec(pageBytes, predecessor) {
  const text = sourceText(pageBytes);
  const item = predecessor.product;
  const connectorA = /USB[\s‑–—-]*A/iu.test(text)
    && item.sourceConnector === "USB_A_MALE";
  const connectorC = /USB[\s‑–—-]*C/iu.test(text)
    && item.destinationConnector === "USB_C_MALE";
  const maleToMale = /Male[\s‑–—-]*To[\s‑–—-]*Male/iu.test(text);
  const data = /(?:sync|data\s+transfer)/iu.test(text)
    && item.dataTransferClaimed === true;
  const power = /(?:charg(?:e|ing)|15\s*W)/iu.test(text)
    && item.chargingClaimed === true;
  const fiveVolt = /5\s*V\s*[/x×]\s*3(?:\.0)?\s*A/iu.test(text)
    || /15\s*W\s*\(\s*5\s*V\s*[/x×]\s*3(?:\.0)?\s*A\s*\)/iu.test(text);
  const minimumLength = item.lengthMeters >= 0.9;
  const itemPrice = Number.isSafeInteger(item.unitPriceMinor)
    && item.unitPriceMinor < 2_000;
  const quantity = item.quantity === 1;
  const checks = { connectorAUsbAMale: connectorA,
    connectorBUsbCMale: connectorC && maleToMale,
    dataTransfer: data, fiveVoltPower: power && fiveVolt,
    minimumLengthAtLeast900Mm: minimumLength,
    itemPriceBelowUsd20: itemPrice, quantityOne: quantity };
  return Object.freeze({ checks,
    exactSpecificationSatisfied: Object.values(checks).every(Boolean) });
}

export async function runTargetExactSpecEtaLiveV1(options = {}) {
  const observedAt = options.observedAt ?? new Date().toISOString();
  if (new Date(Date.parse(observedAt)).toISOString() !== observedAt) {
    fail("OBSERVED_AT_INVALID");
  }
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? PRIVATE_ROOT);
  ensurePrivateDirectory(privateRoot);
  const predecessor = privateProjection(privateRoot,
    options.predecessorProjectionFile);
  const tcin = predecessor.value.product?.tcin;
  const page = await getTargetPage(tcin, options.fetchImpl ?? globalThis.fetch);
  const runDirectory = path.join(privateRoot,
    `target-exact-spec-eta-live-v1-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  ensurePrivateDirectory(runDirectory);
  const pageFile = path.join(runDirectory, "target-product-page.source-v1.bin");
  const pageReceipt = writeOnce0600(pageFile, page.bytes);
  const pageOccurrenceHash = digest(
    "outsider/target-product-page-source-occurrence/v1", {
      observedAt, tcin, sourceBytesHash: pageReceipt.bytesHash,
      occurrenceNonceHash: digest("outsider/target-page-occurrence-nonce/v1",
        { nonce }),
    });
  const specification = evaluateSpec(page.bytes, predecessor.value);
  const fulfillment = predecessor.value.fulfillment;
  const etaStructured = fulfillment?.selectedSourceService !== null
    && typeof fulfillment?.selectedSourceService?.maxDeliveryDate === "string";
  const sourceAvailable = fulfillment?.availabilityStatus === "IN_STOCK"
    && fulfillment?.availableToPromiseQuantity >= 1;
  const body = {
    schema: "outsider/target-exact-spec-eta-route-evidence/v1",
    schemaVersion: "1.0.0",
    recordClass: "TARGET_SOURCE_COMPOSED_READ_ONLY_RECOVERY_ROUTE_EVIDENCE",
    observedAt,
    predecessor: {
      schema: predecessor.value.schema,
      projectionHash: predecessor.value.projectionHash,
      observedAt: predecessor.value.observedAt,
    },
    frozenPredicate: {
      connectorA: "USB_A_MALE", connectorB: "USB_C_MALE",
      dataRequired: true, fiveVoltPowerRequired: true,
      minimumLengthMm: 900, maximumLengthMm: null,
      maximumItemPriceMinorExclusive: 2_000, currency: "USD", quantity: 1,
    },
    specification: {
      ...specification,
      itemPriceMinor: predecessor.value.product.unitPriceMinor,
      lengthMm: Math.round(predecessor.value.product.lengthMeters * 1_000),
      sourceOccurrenceHashes: [
        predecessor.value.sourceOccurrences.pdp.occurrenceHash,
        pageOccurrenceHash,
      ],
    },
    postalFulfillment: {
      availabilityStatus: fulfillment.availabilityStatus,
      availableToPromiseQuantity: fulfillment.availableToPromiseQuantity,
      sourceAvailableForQuantityOne: sourceAvailable,
      selectedSourceService: fulfillment.selectedSourceService,
      structuredEtaObserved: etaStructured,
      etaMeetsRequestedDeadline:
        fulfillment.sourceDateMeetsRequestedDeadline === true,
      sourceOccurrenceHash:
        predecessor.value.sourceOccurrences.fulfillment.occurrenceHash,
      sourceAtpIsCapacityReservation: false,
      sourceEtaIsBindingCommitment: false,
    },
    price: {
      currency: "USD",
      itemPriceMinor: predecessor.value.product.unitPriceMinor,
      itemPlusDisplayedDeliveryFeeBeforeTaxMinor:
        predecessor.value.priceBoundary
          .itemPlusScheduledDeliveryFeeBeforeTaxMinor,
      taxAndAddressBoundFeesIncluded: false,
      allInTotalEstablished: false,
      status: "PARTIAL",
    },
    capacity: {
      status: "UNRESERVED",
      sourceClass: "SELLER_SERVER_ACK_ONLY",
      capacityLifecycleRefHash: null,
      capacityLifecycleHeadHash: null,
    },
    routeAssessment: {
      state: specification.exactSpecificationSatisfied && sourceAvailable
          && etaStructured && fulfillment.sourceDateMeetsRequestedDeadline
        ? "SPEC_AND_STRUCTURED_ETA_OBSERVED_CAPACITY_AND_ALL_IN_UNPROVEN"
        : "SOURCE_REQUIREMENTS_INCOMPLETE",
      exactSpecificationSatisfied:
        specification.exactSpecificationSatisfied,
      structuredEtaWithinDeadline: etaStructured
        && fulfillment.sourceDateMeetsRequestedDeadline === true,
      allInTotalEstablished: false,
      capacityReserved: false,
      commitEligible: false,
    },
    sourceOccurrences: {
      productPage: { occurrenceHash: pageOccurrenceHash,
        bytesHash: pageReceipt.bytesHash, byteLength: pageReceipt.byteLength },
      redskyPdp: predecessor.value.sourceOccurrences.pdp,
      redskyFulfillment: predecessor.value.sourceOccurrences.fulfillment,
    },
    externalEffects: {
      targetProductPagePublicGets: 1 + page.redirectCount,
      inheritedRedskyPublicGets: 2,
      contactSubmissions: 0, streetAddressSubmissions: 0,
      cartMutations: 0, capacityReservations: 0, checkoutSubmissions: 0,
      paymentAttempts: 0, orderSubmissions: 0,
    },
    privacyBoundary: {
      nameProjected: false, emailProjected: false, phoneProjected: false,
      streetAddressProjected: false, postalCodeProjected: false,
      coordinatesProjected: false, rawTargetBytesProjected: false,
    },
    authority: "NONE", actionReady: false, executable: false,
    boundary: OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V1_BOUNDARY,
  };
  const projection = Object.freeze({ ...body,
    projectionHash: digest(body.schema, body) });
  const projectionFile = path.join(runDirectory,
    "route-evidence.public-projection.v1.json");
  const projectionReceipt = writeJson0600(projectionFile, projection);
  const privateManifest = {
    schema: "outsider/private-target-exact-spec-eta-run-manifest/v1",
    observedAt, runRefHash: digest("outsider/target-exact-spec-eta-run/v1",
      { nonce, observedAt }),
    predecessorProjectionPath: predecessor.absolute,
    predecessorProjectionFileHash: sha(predecessor.bytes),
    targetPageFinalUrlHash: sha(Buffer.from(page.finalUrl, "utf8")),
    targetPageSource: pageReceipt,
    targetPageOccurrenceHash: pageOccurrenceHash,
    publicProjectionHash: projection.projectionHash,
    externalEffects: projection.externalEffects,
  };
  const manifestReceipt = writeJson0600(path.join(runDirectory,
    "private-manifest.v1.json"), privateManifest);
  return Object.freeze({ runDirectory, projection, projectionFile,
    projectionReceipt, manifestReceipt });
}

async function main(argv) {
  const index = argv.indexOf("--predecessor-projection");
  if (!argv.includes("--live-read-only") || index < 0
    || argv[index + 1] === undefined) fail("CLI_ARGUMENTS_INVALID");
  const result = await runTargetExactSpecEtaLiveV1({
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

