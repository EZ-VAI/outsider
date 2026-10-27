#!/usr/bin/env node

/*
 * Target RedSky read-only live runner v3.
 *
 * This descendant turns the v2 source capture into a provider-neutral,
 * machine-readable route assessment for the frozen physical Outcome.  It
 * performs only the two v2 public GETs.  It cannot use Target account-only
 * fulfillment, create a cart, reserve stock, submit checkout, pay, or order.
 * Destination inputs and exact seller bytes remain in mode-0600 local files.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, openSync,
  readFileSync, realpathSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { runTargetRedskyReadOnlyLiveV2 }
  from "./outsider-target-redsky-read-only-live-v2.mjs";

const PREFIX = "OUTSIDER_TARGET_REDSKY_READ_ONLY_LIVE_V3_";

export const OUTSIDER_TARGET_REDSKY_READ_ONLY_LIVE_V3_BOUNDARY
  = Object.freeze({
    descendsFrom: "outsider/target-redsky-read-only-live/v2",
    provider: "TARGET_REDSKY_PUBLIC_WEB",
    routeRole: "RECOVERY_CANDIDATE",
    transport: "MACHINE_HTTPS",
    permittedHttpMethods: Object.freeze(["GET"]),
    publicPdpGetCount: 1,
    publicFulfillmentGetCount: 1,
    accountOnlySameDayPathAllowed: false,
    cartMutationAllowed: false,
    capacityReservationAllowed: false,
    checkoutAllowed: false,
    paymentAllowed: false,
    orderAllowed: false,
    rawDestinationProjected: false,
    rawSellerBytesProjected: false,
    authorityMinted: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
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
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes) });
}

function frozenOutcomeAcceptance(privateRoot, file) {
  const root = realpathSync(path.resolve(privateRoot));
  const absolute = realpathSync(path.resolve(file));
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    fail("PRODUCT_STATE_OUTSIDE_PRIVATE_ROOT");
  }
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 3
    || info.size > 1024 * 1024) fail("PRODUCT_STATE_NOT_PRIVATE");
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PRODUCT_STATE_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")
    || value.schema !== "outsider/first-physical-formation-product-state/v2"
    || value.schemaVersion !== "2.0.0"
    || !/^sha256:[a-f0-9]{64}$/u.test(String(value.productStateHash ?? ""))) {
    fail("PRODUCT_STATE_BINDING_INVALID");
  }
  const item = value.product?.exactItem;
  if (value.product?.outcomeKind !== "PHYSICAL_GOODS_DELIVERY"
    || item?.condition !== "NEW"
    || item.connectorA !== "USB_A_MALE"
    || item.connectorB !== "USB_C_MALE"
    || item.dataRequired !== true
    || item.fiveVoltPowerRequired !== true
    || item.minimumLengthMm !== 900 || item.maximumLengthMm !== 1100
    || item.quantity !== 1) fail("PRODUCT_STATE_ACCEPTANCE_MISMATCH");
  return Object.freeze({
    contractRefHash: value.productStateHash,
    condition: item.condition,
    connectorA: item.connectorA,
    connectorB: item.connectorB,
    dataRequired: item.dataRequired,
    fiveVoltPowerRequired: item.fiveVoltPowerRequired,
    minimumLengthMm: item.minimumLengthMm,
    maximumLengthMm: item.maximumLengthMm,
    quantity: item.quantity,
  });
}

function assessment(predecessor) {
  const exactProduct = predecessor.product.exactAcceptanceSatisfied === true;
  const sourceAtp = predecessor.fulfillment.sourceAtpSatisfiesQuantity === true;
  const sourceDeadline
    = predecessor.fulfillment.sourceDateMeetsRequestedDeadline === true;
  const standardShippingBudget
    = predecessor.product.standardShippingRouteState !== "BUDGET_INFEASIBLE";
  let state = "OBSERVED_NOT_RESERVABLE";
  let reasonCode = "TARGET_OBSERVATION_HAS_NO_CAPACITY_OR_ALL_IN_TOTAL";
  if (!exactProduct) {
    state = "REJECT_PRODUCT_REQUIREMENTS";
    reasonCode = "TARGET_EXACT_PRODUCT_REQUIREMENTS_UNPROVEN";
  } else if (!standardShippingBudget) {
    state = "REJECT_BUDGET_ROUTE";
    reasonCode = "TARGET_STANDARD_SHIPPING_BUDGET_INFEASIBLE";
  } else if (!sourceAtp || !sourceDeadline) {
    state = "REJECT_FULFILLMENT_REQUIREMENTS";
    reasonCode = "TARGET_ATP_OR_DEADLINE_UNPROVEN";
  }
  return Object.freeze({
    state,
    reasonCode,
    exactProductRequirementsSatisfied: exactProduct,
    sourceAtpSatisfiesQuantity: sourceAtp,
    sourceDateMeetsRequestedDeadline: sourceDeadline,
    standardShippingBudgetPotentiallyFeasible: standardShippingBudget,
    fullAddressAllInTotalProven: false,
    capacityReserved: false,
    commitEligible: false,
  });
}

export async function runTargetRedskyReadOnlyLiveV3(options = {}) {
  if (typeof options.outcomeInputFile !== "string"
    || typeof options.priorRouteBindingFile !== "string"
    || typeof options.frozenProductStateFile !== "string"
    || typeof options.privateRoot !== "string") fail("PRIVATE_INPUTS_REQUIRED");
  const acceptance = frozenOutcomeAcceptance(options.privateRoot,
    options.frozenProductStateFile);
  const predecessor = await runTargetRedskyReadOnlyLiveV2({
    outcomeInputFile: options.outcomeInputFile,
    priorRouteBindingFile: options.priorRouteBindingFile,
    privateRoot: options.privateRoot,
    observedAt: options.observedAt,
    nonce: options.nonce,
    fetchImpl: options.fetchImpl,
  });
  const routeAssessment = assessment(predecessor.projection);
  const body = {
    schema: "outsider/target-redsky-read-only-route-assessment/v3",
    schemaVersion: "3.0.0",
    predecessor: {
      schema: predecessor.projection.schema,
      projectionHash: predecessor.projection.projectionHash,
    },
    observedAt: predecessor.projection.observedAt,
    executionClass: "LIVE_MACHINE_HTTPS",
    routeRole: "RECOVERY_CANDIDATE",
    constraints: {
      maximumAmountMinor:
        predecessor.projection.priceBoundary.maximumAmountMinor,
      quantity: predecessor.projection.product.quantity,
      requestedDeliveryDate:
        predecessor.projection.requestedDeliveryDate,
    },
    frozenOutcomeAcceptance: acceptance,
    structuredSellerEvidence: {
      availabilityStatus:
        predecessor.projection.fulfillment.availabilityStatus,
      availableToPromiseQuantity:
        predecessor.projection.fulfillment.availableToPromiseQuantity,
      selectedSourceService:
        predecessor.projection.fulfillment.selectedSourceService,
      sourceAtpSatisfiesQuantity:
        predecessor.projection.fulfillment.sourceAtpSatisfiesQuantity,
      sourceDateMeetsRequestedDeadline:
        predecessor.projection.fulfillment.sourceDateMeetsRequestedDeadline,
      itemPlusScheduledDeliveryFeeBeforeTaxMinor:
        predecessor.projection.priceBoundary
          .itemPlusScheduledDeliveryFeeBeforeTaxMinor,
    },
    productEvidence: {
      acceptanceGaps: predecessor.projection.product.acceptanceGaps,
      exactAcceptanceSatisfied:
        predecessor.projection.product.exactAcceptanceSatisfied,
      explicit5vClaim: predecessor.projection.product.explicit5vClaim,
      standardShippingRouteState:
        predecessor.projection.product.standardShippingRouteState,
      tcin: predecessor.projection.product.tcin,
    },
    routeAssessment,
    sourceOccurrences: predecessor.projection.sourceOccurrences,
    privacyBoundary: predecessor.projection.privacyBoundary,
    externalEffects: {
      publicReadRequests: 2,
      accountOnlySameDayRequests: 0,
      cartMutations: 0,
      checkoutSubmissions: 0,
      paymentAttempts: 0,
      orderSubmissions: 0,
    },
    boundary: OUTSIDER_TARGET_REDSKY_READ_ONLY_LIVE_V3_BOUNDARY,
  };
  const projection = Object.freeze({ ...body,
    projectionHash: digest(body.schema, body) });
  const projectionArtifact = writeOnce0600(path.join(predecessor.runDirectory,
    "route-assessment.public-projection.v3.json"), projection);
  return Object.freeze({ ...predecessor, predecessor,
    projection, projectionArtifact });
}

function parseCli(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const known = new Set(["--live-read-only", "--outcome-input",
    "--route-binding", "--product-state", "--private-root"]);
  const output = { help: false, confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!known.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-read-only") { output.confirmed = true; continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_VALUE_REQUIRED");
    }
    if (flag === "--outcome-input") output.outcomeInputFile = value;
    if (flag === "--route-binding") output.priorRouteBindingFile = value;
    if (flag === "--product-state") output.frozenProductStateFile = value;
    if (flag === "--private-root") output.privateRoot = value;
    index += 1;
  }
  if (!output.confirmed) fail("LIVE_READ_ONLY_CONFIRMATION_REQUIRED");
  if (output.outcomeInputFile === undefined
    || output.priorRouteBindingFile === undefined
    || output.frozenProductStateFile === undefined
    || output.privateRoot === undefined) fail("PRIVATE_INPUTS_REQUIRED");
  return output;
}

async function main(argv) {
  const options = parseCli(argv);
  if (options.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/outsider-target-redsky-read-only-live-v3.mjs \\",
      "    --live-read-only --outcome-input MODE_0600_JSON \\",
      "    --route-binding MODE_0600_JSON --product-state MODE_0600_JSON \\",
      "    --private-root MODE_0700_DIRECTORY",
      "",
    ].join("\n"));
    return;
  }
  const result = await runTargetRedskyReadOnlyLiveV3(options);
  process.stdout.write(`${canonicalizeStrict({
    artifactRef: path.basename(result.runDirectory),
    observedAt: result.projection.observedAt,
    projectionFile: path.basename(result.projectionArtifact.file),
    projectionHash: result.projection.projectionHash,
    routeAssessment: result.projection.routeAssessment,
    structuredSellerEvidence: result.projection.structuredSellerEvidence,
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
