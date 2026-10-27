#!/usr/bin/env node

/*
 * No-payment live preflight for the first unified physical Outcome Product.
 *
 * One request crosses the model/compute foundation compiler, an existing
 * Autonomous Work Order typed graph, the Episode/Attempt data bridge, and the
 * Adafruit PRIMARY + SparkFun RECOVERY buyer-native transaction surfaces.
 * The injected witness is deliberately only a candidate-readiness seam.
 *
 * This runner has no checkout, payment, order-submission, or commit call. It
 * may create isolated guest carts. Cart/source ACKs remain source occurrences:
 * they are not capacity, owner authority, an outcome, or an outcome promise.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readFileSync, readdirSync, statSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { createAutonomousWorkOrderProjection }
  from "../src/outsider-autonomous-work-order.js";
import { pinAtomicBuyerNativeFrozenArtifactV1 }
  from "../src/outsider-atomic-buyer-native-temporary-network-coordinator-v1.js";
import { OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1 }
  from "../src/outsider-first-physical-outcome-production-composition-v1.js";
import { createFirstPhysicalOutcomeUnifiedProductV1 }
  from "../src/outsider-first-physical-outcome-unified-product-v1.js";

const PREFIX
  = "OUTSIDER_FIRST_PHYSICAL_OUTCOME_UNIFIED_LIVE_PREFLIGHT_V1_";
const SUMMARY_SCHEMA
  = "outsider/first-physical-outcome-unified-live-preflight-summary/v1";
const INVENTORY_SCHEMA
  = "outsider/private-first-physical-unified-preflight-inventory/v1";
const PRIVATE_DESTINATION_FORMATION_REQUEST_SCHEMA
  = "outsider/private-first-physical-outcome-destination-formation-request/v2";
const CONFIRMATION = "LIVE_GUEST_CART_FORMATION_NO_PAYMENT_NO_ORDER";
const DAY_MS = 24 * 60 * 60 * 1_000;
const FORMATION_WINDOW_MS = 30 * 60 * 1_000;
const CLEANUP_WINDOW_MS = DAY_MS;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hashText(value) {
  return hashBytes(Buffer.from(value, "utf8"));
}

function digest(domain, value) {
  return hashText(`${domain}\0${canonicalizeStrict(value)}`);
}

function addMs(instant, milliseconds) {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

function localDateAt(instant, timeZone) {
  const fields = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(instant)).filter((part) =>
    ["year", "month", "day"].includes(part.type)).map((part) =>
    [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function privateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_INVALID");
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
  return Object.freeze({ bytes: bytes.length, hash: hashBytes(bytes) });
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function validatePrivateDestinationFormationRequestV2(value) {
  exact(value, ["schema", "schemaVersion", "destination", "budget",
    "completionDeadline", "paymentAuthorized", "orderAuthorized"],
  "PRIVATE_DESTINATION_FORMATION_REQUEST");
  exact(value.destination, ["countryCode", "postalCode", "regionId",
    "region", "city"], "PRIVATE_DESTINATION");
  exact(value.budget, ["currency", "maximumAmountMinor"], "PRIVATE_BUDGET");
  if (value.schema !== PRIVATE_DESTINATION_FORMATION_REQUEST_SCHEMA
    || value.schemaVersion !== "2.0.0"
    || typeof value.destination.countryCode !== "string"
    || !/^[A-Z]{2}$/u.test(value.destination.countryCode)
    || typeof value.destination.postalCode !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9 .-]{0,31}$/u
      .test(value.destination.postalCode)
    || value.destination.postalCode !== value.destination.postalCode.trim()
    || value.destination.regionId !== null
      && (!Number.isSafeInteger(value.destination.regionId)
        || value.destination.regionId < 1)
    || [value.destination.region, value.destination.city].some((entry) =>
      entry !== null && (typeof entry !== "string" || entry.length < 1
        || entry.length > 128 || entry !== entry.trim()
        || /[\u0000-\u001f\u007f]/u.test(entry)))
    || value.budget.currency !== "USD"
    || typeof value.budget.maximumAmountMinor !== "string"
    || !/^[1-9]\d{0,30}$/u.test(value.budget.maximumAmountMinor)
    || typeof value.completionDeadline !== "string"
    || !Number.isFinite(Date.parse(value.completionDeadline))
    || new Date(Date.parse(value.completionDeadline)).toISOString()
      !== value.completionDeadline
    || value.paymentAuthorized !== false || value.orderAuthorized !== false) {
    fail("PRIVATE_DESTINATION_FORMATION_REQUEST_INVALID");
  }
  return Object.freeze({
    schema: value.schema,
    schemaVersion: value.schemaVersion,
    destination: Object.freeze({ ...value.destination }),
    budget: Object.freeze({ ...value.budget }),
    completionDeadline: value.completionDeadline,
    paymentAuthorized: false,
    orderAuthorized: false,
  });
}

function readPrivateDestinationFormationRequestV2(file) {
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600) {
    fail("PRIVATE_DESTINATION_FORMATION_REQUEST_FILE_INVALID");
  }
  const bytes = readFileSync(absolute);
  if (bytes.length < 3 || bytes.at(-1) !== 0x0a) {
    fail("PRIVATE_DESTINATION_FORMATION_REQUEST_FILE_PARTIAL");
  }
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PRIVATE_DESTINATION_FORMATION_REQUEST_FILE_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("PRIVATE_DESTINATION_FORMATION_REQUEST_FILE_NOT_CANONICAL");
  }
  return validatePrivateDestinationFormationRequestV2(value);
}

function readVerifiedSummaryProjectionHash(file) {
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) {
    fail("SUPERSESSION_SUMMARY_FILE_INVALID");
  }
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("SUPERSESSION_SUMMARY_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("SUPERSESSION_SUMMARY_NOT_CANONICAL");
  }
  const { summaryProjectionHash, ...body } = value;
  if (!/^sha256:[a-f0-9]{64}$/u.test(summaryProjectionHash ?? "")
    || typeof value.schema !== "string"
    || digest(value.schema, body) !== summaryProjectionHash) {
    fail("SUPERSESSION_SUMMARY_HASH_INVALID");
  }
  return summaryProjectionHash;
}

function approvedMilestoneDraft() {
  const discovery = (term) => ({ queryTerms: [term],
    routeKinds: ["PROVIDER_OWNED_PUBLIC_ENTRY"], maximumCandidates: 8 });
  const product = { quantity: 1, connectorA: "USB_A_MALE",
    connectorB: "USB_C_MALE", minimumLengthMm: 900,
    maximumLengthMm: 1100, dataRequired: true,
    fiveVoltPowerRequired: true, condition: "NEW" };
  return {
    schema: "outsider/private-outcome-formation-model-draft/v1",
    outcomeKindCode: "PHYSICAL_GOODS_DELIVERY",
    conditions: [{ metricCode: "DELIVERY_COMPLETE", comparator: "EQUAL",
      target: { valueKind: "BOOLEAN", booleanValue: true,
        integerValue: null, stateCode: null, unitCode: null },
      observationWindowMs: 0 }],
    acceptance: [{ criterionId: "exact_item", comparator: "ALL_FIELDS_EQUAL",
      subject: "delivered cable", expected: product }],
    routes: {
      primary: { capability: "PURCHASE_AND_DELIVER_MATCHING_ITEM",
        classCode: "PHYSICAL_GOODS_SELLER", quantity: 1, unitCode: "ITEM",
        constraints: { product }, discovery: discovery("matching cable seller"),
        observationMode: null, maximumAttempts: null },
      recovery: { capability: "ALTERNATE_PURCHASE_AND_DELIVERY_ROUTE",
        classCode: "PHYSICAL_GOODS_SELLER", quantity: 1, unitCode: "ITEM",
        constraints: { product, distinctFromPrimary: true },
        discovery: discovery("alternate matching cable seller"),
        observationMode: null, maximumAttempts: 1 },
      independentWitness: {
        capability: "INDEPENDENT_DELIVERY_AND_ITEM_OBSERVATION",
        classCode: "DELIVERY_OUTCOME_WITNESS", quantity: 1,
        unitCode: "OBSERVATION",
        constraints: { providerSelfReportSufficient: false },
        discovery: discovery("independent delivery outcome witness"),
        observationMode: "LONGITUDINAL", maximumAttempts: null,
      },
    },
  };
}

function bestBuyFixtureSourceSet() {
  const product = Buffer.from(`<!doctype html><html><head>
<title>Anker Cable [2 Pack 3ft], USB A to USB C Cable Black - Best Buy</title>
<meta name="analytics-metadata" content="{&quot;product&quot;:{&quot;skuId&quot;:&quot;12150546&quot;,&quot;bsin&quot;:&quot;JJ858RS2Z5&quot;,&quot;price&quot;:&quot;8.99&quot;,&quot;brand&quot;:&quot;Anker&quot;}}">
</head></html>`, "utf8");
  const cart = Buffer.from(`<!doctype html><script>var cartOrderInit = ${JSON.stringify({
    lineItems: [{ quantity: 1, quantityLimit: 5, item: {
      shortLabel: "Anker - Cable [2 Pack 3ft], USB A to USB C Cable - Black",
      title: "Cable [2 Pack 3ft], USB A to USB C Cable",
      skuId: "12150546", bsin: "JJ858RS2Z5", modelNumber: "B8172",
      thirdPartySellerName: "AnkerDirect", isOutOfStock: false,
      fulfillmentOptions: { shippingEligible: true, shippable: true },
      fulfillments: [{ typeCode: "SHIPPING", selected: true,
        backordered: false, zipcode: "02446",
        minDate: "2026-09-10T05:00:00.000+00:00",
        maxDate: "2026-09-10T05:00:00.000+00:00",
        minEstimatedArrival: "Thu, Sep 10",
        maxEstimatedArrival: "Thu, Sep 10", price: "FREE" }],
      reservation: { token: "fixture-private-cart-token" },
    } }],
    orderSummary: { productTotal: "$8.99", orderTotal: "$9.55",
      shippingTotal: "$0.00", price: { totalSalesTax: "$0.56" } },
    cartItemCount: "1", authStatus: "G", user: { type: "visitor" },
  })};</script>`, "utf8");
  const guestCheckout = Buffer.from(`<!doctype html><script>var initMetaLayer = ${JSON.stringify({
    recognized: "anonymous", user_recognized: "anonymous",
    loginRequired: false, user_numItemsInCart: 1,
  })};</script><script>var initData = ${JSON.stringify({
    allowsGuestFlow: true, guestUrl: "/identity/guest?token=private-fixture",
    brand: { guestButtonCopy: "Continue as Guest" },
  })};</script>`, "utf8");
  return Object.freeze({ product, cart, guestCheckout,
    reviewedEvidence: Buffer.from("fixture reviewed Best Buy seller claims",
      "utf8") });
}

function bestBuyLiveSourceSet() {
  const directory = path.join(process.cwd(), ".outsider", "private",
    "bestbuy-buyer-native-route-20260904-wXBrsw");
  const readPrivate = (name) => {
    const file = path.join(directory, name);
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink()
      || (info.mode & 0o077) !== 0) fail("BESTBUY_SOURCE_NOT_PRIVATE");
    return readFileSync(file);
  };
  return Object.freeze({
    product: readPrivate("product.source.html"),
    cart: readPrivate("cart.source.html"),
    guestCheckout: readPrivate("guest-checkout.source.html"),
    reviewedEvidence: readPrivate("private-observation.v2.json"),
  });
}

function runHash(scope, label) {
  return digest("outsider/first-physical-unified-live-preflight/v1", {
    scope, label,
  });
}

function makeWorkOrder(scope, outcomeIntentRefHash, recordedAt) {
  const ref = (label) => runHash(scope, label);
  const owner = ref("resource-owner");
  return createAutonomousWorkOrderProjection({
    orderId: `awo_${ref("work-order-alias").slice(7, 39)}`,
    recordedAt,
    appendOnlyLineage: { revision: 0, predecessorProjectionHash: null,
      supersedesProjectionHash: null },
    typedGraph: {
      principalEpoch: { principalRefHash: ref("principal"),
        epochRefHash: ref("principal-epoch-ref"),
        principalEpochProjectionHash: ref("principal-epoch-projection") },
      accountableDeployment: {
        deploymentLineageRefHash: ref("deployment-lineage"),
        deploymentRevisionHash: ref("deployment-revision"),
        accountableDeploymentSubjectHash: ref("deployment-subject") },
      runtime: { runtimeInstanceRefHash: ref("runtime-ref"),
        runtimeInstanceHash: ref("runtime") },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: ref("delegation-evidence"),
        delegationEdgeHash: ref("delegation-edge") },
      episode: { episodeHash: ref("episode"),
        networkCompleteEpisodeJoinHash: ref("episode-join") },
      attempt: { attemptHash: ref("attempt"),
        attemptActorSubjectHash: ref("attempt-actor") },
    },
    contractReferences: { actorIdentityEnvelopeHash: ref("actor-envelope"),
      realitySemanticBundleHash: ref("semantic-bundle"),
      realityObligationGenesisHash: ref("obligation-genesis"),
      realityObligationStateHash: ref("obligation-state"),
      affectedPartyRootHash: ref("affected-party-root"),
      outcomeWitnessEnvelopeHash: null },
    resourceOwner: { resourceOwnerRefHash: owner,
      ownerAdoptionEvidenceRefHash: null,
      externalAdoptionEstablished: false },
    promisedOutcome: { promisedOutcomeRefHash: outcomeIntentRefHash,
      acceptanceCriteriaHash: ref("acceptance-criteria"),
      outcomeWitnessRequirementHash: ref("witness-requirement"),
      consequenceChannelHashes: [ref("consequence-channel")] },
    observationHorizons: [
      { horizonId: "immediate", dueAfterMs: 0,
        observationRequirementHash: ref("observation-immediate"),
        mandatory: true },
      { horizonId: "delayed", dueAfterMs: DAY_MS,
        observationRequirementHash: ref("observation-delayed"),
        mandatory: true },
    ],
    obligors: [
      { obligorRefHash: owner, role: "PRIMARY_PERFORMANCE",
        obligationRefHash: ref("primary-obligation") },
      { obligorRefHash: owner, role: "RECOVERY",
        obligationRefHash: ref("recovery-obligation") },
    ],
    remedyMenu: [{ remedyId: "replace", kind: "REPLACE",
      remedyTermsHash: ref("replacement-terms"),
      obligorRefHashes: [owner] }],
    protectionFunding: { status: "NONE" },
    orderStatus: "STRUCTURAL_PRECOMMITMENT_HOLD",
    challenge: { opened: false, challengeRefHash: null,
      standingExternallyVerified: false },
    closure: { closed: false, closureRefHash: null,
      externalClosureVerified: false },
    proofAccessPolicy: { roleScopedProofPolicyHash: ref("proof-policy"),
      redactionPolicyHash: ref("redaction-policy") },
  });
}

function canonicalCandidateWitnessBytes(request, observedAt) {
  return Buffer.from(canonicalizeStrict({
    schema: "outsider/candidate-witness-readiness-source/v1",
    observedAt,
    operation: request.operation,
    candidateOnly: true,
    independentlyControlled: false,
    operationalCapacityReserved: false,
    independentOutcomeEstablished: false,
    sourceOccurrenceOnly: true,
  }), "utf8");
}

function safeErrorCode(error) {
  if (typeof error?.outsiderCode === "string"
    && /^[A-Z0-9_]{1,160}$/u.test(error.outsiderCode)) {
    return error.outsiderCode;
  }
  const match = /^([A-Z][A-Z0-9_]{1,200})$/u.exec(String(error?.message));
  return match?.[1] ?? "LIVE_PREFLIGHT_FAILED";
}

function walkPrivateFiles(root, excluded = new Set()) {
  const files = [];
  function visit(directory) {
    const directoryInfo = lstatSync(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()
      || (directoryInfo.mode & 0o777) !== 0o700) {
      fail("EVIDENCE_DIRECTORY_MODE_INVALID");
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (excluded.has(relative)) continue;
      const info = lstatSync(absolute);
      if (info.isSymbolicLink()) fail("EVIDENCE_SYMLINK_FORBIDDEN");
      if (info.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!info.isFile() || (info.mode & 0o777) !== 0o600) {
        fail("EVIDENCE_FILE_MODE_INVALID");
      }
      const bytes = readFileSync(absolute);
      files.push(Object.freeze({ relativePath: relative,
        bytes: bytes.length, sha256: hashBytes(bytes) }));
    }
  }
  visit(root);
  return files;
}

function privateOccurrenceSummary(root) {
  const rows = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()
        && path.basename(path.dirname(absolute)) === "occurrences"
        && /^\d{8}\.json$/u.test(entry.name)) {
        const record = JSON.parse(readFileSync(absolute, "utf8"));
        rows.push(record);
      }
    }
  }
  visit(root);
  const transactions = rows.filter((row) =>
    row.sourceKind === "BUYER_NATIVE_TRANSACTION");
  const byRoleAndOperation = {};
  let sourceBytes = 0;
  let anyCapacity = false;
  let anyIndependentOutcome = false;
  for (const row of rows) sourceBytes += row.sourceBytesLength;
  for (const row of transactions) {
    const transaction = row.transaction;
    const key = `${transaction.routeRole}:${transaction.operation}:${transaction.sourceState}`;
    byRoleAndOperation[key] = (byRoleAndOperation[key] ?? 0) + 1;
    anyCapacity ||= transaction.operationalCapacityReceipt === true;
    anyIndependentOutcome ||= transaction.independentOutcomeEstablished === true;
  }
  return Object.freeze({
    rowCount: rows.length,
    transactionCount: transactions.length,
    formationCount: rows.length - transactions.length,
    sourceBytes,
    byRoleAndOperation: Object.fromEntries(Object.entries(byRoleAndOperation)
      .sort(([left], [right]) => left.localeCompare(right))),
    anyCapacity,
    anyIndependentOutcome,
  });
}

function httpSummary(attempts) {
  const providers = {};
  for (const attempt of attempts) {
    const key = `${attempt.hostname}:${attempt.method}`;
    providers[key] = (providers[key] ?? 0) + 1;
  }
  return Object.freeze({
    attemptCount: attempts.length,
    nonGetAttemptCount: attempts.filter(({ method }) => method !== "GET").length,
    byProviderAndMethod: Object.fromEntries(Object.entries(providers)
      .sort(([left], [right]) => left.localeCompare(right))),
  });
}

function publicSummaryBody({ mode, observedAt, completionDeadline, requestId,
  result, error, attempts, occurrence, payloadInventory, inventoryFile,
  supersedesSummaryProjectionHashes, privateDestinationFormationUsed }) {
  const payloadBytes = payloadInventory.reduce((sum, row) => sum + row.bytes, 0);
  const payloadSetHash = digest(
    "outsider/first-physical-unified-live-preflight-artifact-set/v1",
    payloadInventory);
  const http = httpSummary(attempts);
  const census = result?.episodeData?.occurrenceCensus ?? null;
  if (result !== null && (result.paymentAttempted !== false
    || result.orderSubmitted !== false || result.outcomePromiseIssued !== false
    || result.product.capacityReserved !== false
    || result.episodeData.externalOutcomeEstablished !== false
    || occurrence.anyCapacity || occurrence.anyIndependentOutcome)) {
    fail("NO_PAYMENT_HOLD_BOUNDARY_BREACHED");
  }
  const expectedWorkflowState = privateDestinationFormationUsed
    ? "NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA" : "NEEDS_DESTINATION";
  const parallelCandidates
    = result?.product?.parallelUnselectedCandidateRoutes ?? [];
  const parallelCandidateTransactionCount = parallelCandidates.reduce(
    (count, candidate) => count
      + (candidate.provider === "TARGET_REDSKY_READ_ONLY_CANDIDATE" ? 2
        : candidate.provider
          === "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE" ? 3 : 0), 0);
  const expectedTransactionCount = privateDestinationFormationUsed
    ? 10 + parallelCandidateTransactionCount : 8;
  const completeFormation = result !== null
    && result.product.workflowState === expectedWorkflowState
    && occurrence.transactionCount === expectedTransactionCount
    && occurrence.formationCount === 1;
  const body = {
    schema: SUMMARY_SCHEMA,
    schemaVersion: "1.0.0",
    executionMode: mode,
    runState: error !== null ? "FAILED_HOLD"
      : completeFormation ? "COMPLETED_HOLD" : "SOURCE_UNAVAILABLE_HOLD",
    appendOnlyLineage: {
      revision: supersedesSummaryProjectionHashes.length,
      predecessorSummaryProjectionHash:
        supersedesSummaryProjectionHashes.at(-1) ?? null,
      supersedesSummaryProjectionHashes,
      inPlaceMutationAllowed: false,
    },
    observedAt,
    completionDeadline,
    requestId,
    privateDestinationFormationRequestSchema:
      privateDestinationFormationUsed
        ? PRIVATE_DESTINATION_FORMATION_REQUEST_SCHEMA : null,
    privateDestinationFormationUsed,
    rawDestinationProjected: false,
    goal: OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1,
    modelInferenceMode: "FIXED_APPROVED_MILESTONE_DRAFT",
    modelComputeFoundationConnected:
      result?.modelComputeFoundationConnected ?? false,
    autonomousWorkOrderTypedGraphConnected:
      result?.existingTypedGraphConnected ?? false,
    typedGraphHash: result?.episodeData?.typedGraphHash ?? null,
    graphPath: result?.episodeData?.graphPath ?? null,
    attemptCount: result?.episodeData?.episodeAttemptSetComposition
      ?.attemptCensus?.attemptCount ?? 0,
    buyerNativeExecutionConnected:
      result?.buyerNativeExecutionConnected ?? false,
    workflowState: result?.product?.workflowState ?? "FAILED_HOLD",
    selectedOrderScopedRoutes: result?.product?.selectedOrderScopedRoutes ?? [],
    parallelUnselectedCandidateRoutes: parallelCandidates,
    targetCandidateSelectedForAtomicSlot: false,
    bestBuyCandidateSelectedForAtomicSlot: false,
    realSellerHttp: http,
    sellerMessageCount: 0,
    candidateWitnessExternalRequestCount: 0,
    sourceOccurrences: {
      sourceOccurrenceCount: census?.sourceOccurrenceCount
        ?? occurrence.rowCount,
      productFormationOccurrenceCount: census?.productFormationOccurrenceCount
        ?? occurrence.formationCount,
      buyerNativeTransactionOccurrenceCount:
        census?.buyerNativeTransactionOccurrenceCount
        ?? occurrence.transactionCount,
      exactPrivateSourceBytes: occurrence.sourceBytes,
      byRoleOperationAndState: occurrence.byRoleAndOperation,
    },
    guestCartFormationAttempted: http.nonGetAttemptCount > 0,
    cartReadyCountsAsReservation: false,
    candidateWitnessCountsAsIndependentWitness: false,
    capacityReserved: false,
    independentOutcomeEstablished: false,
    paymentAttempted: false,
    checkoutAttempted: false,
    orderSubmitted: false,
    outcomePromiseIssued: false,
    outsiderStaffTouchCount: 0,
    evidencePayloadFileCount: payloadInventory.length,
    evidencePayloadBytes: payloadBytes,
    evidencePayloadSetHash: payloadSetHash,
    evidenceInventoryFileBytes: inventoryFile.bytes,
    evidenceInventoryFileHash: inventoryFile.hash,
    failureCode: error === null ? null : safeErrorCode(error),
    failureMessageHash: error === null ? null
      : hashText(String(error?.message ?? error)),
    nextGate: result?.product?.workflowState === "NEEDS_DESTINATION"
      ? "AUTHORIZED_COUNTRY_AND_POSTAL_CODE_FOR_SHIPPING_TAX_ETA_FORMATION"
      : result?.product?.workflowState
        === "NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA"
        ? "AUTHORIZED_FULL_ADDRESS_FOR_DELIVERABILITY_TAX_AND_DEADLINE_FORMATION"
        : "SOURCE_OR_PRODUCT_PATH_REPAIR_REQUIRED",
    decisionState: "HOLD",
    authority: "FORMATION_ONLY_NO_PAYMENT",
  };
  return Object.freeze({ ...body, summaryProjectionHash: digest(body.schema, body) });
}

/**
 * Run the bounded no-payment preflight. FIXTURE exists only for tests and is
 * always labeled as such; LIVE always uses global fetch.
 */
export async function runFirstPhysicalOutcomeUnifiedLivePreflightV1(
  options = {}) {
  const mode = options.mode ?? "LIVE";
  if (!new Set(["LIVE", "FIXTURE"]).has(mode)
    || mode === "LIVE" && options.fetchImpl !== undefined
    || mode === "FIXTURE" && typeof options.fetchImpl !== "function") {
    fail("OPTIONS_INVALID");
  }
  const supersedesSummaryProjectionHashes
    = options.supersedesSummaryProjectionHashes ?? [];
  if (!Array.isArray(supersedesSummaryProjectionHashes)
    || new Set(supersedesSummaryProjectionHashes).size
      !== supersedesSummaryProjectionHashes.length
    || supersedesSummaryProjectionHashes.some((value) =>
      !/^sha256:[a-f0-9]{64}$/u.test(value))) fail("SUPERSESSION_INVALID");
  const observedAt = options.now ?? new Date().toISOString();
  if (new Date(Date.parse(observedAt)).toISOString() !== observedAt) {
    fail("NOW_INVALID");
  }
  const privateFormationRequest = options.privateFormationRequest === undefined
    || options.privateFormationRequest === null ? null
    : validatePrivateDestinationFormationRequestV2(
      options.privateFormationRequest);
  if (privateFormationRequest !== null
    && options.completionDeadline !== undefined
    && options.completionDeadline !== privateFormationRequest.completionDeadline) {
    fail("COMPLETION_DEADLINE_PRIVATE_REQUEST_MISMATCH");
  }
  const completionDeadline = privateFormationRequest?.completionDeadline
    ?? options.completionDeadline ?? addMs(observedAt, 7 * DAY_MS);
  if (Date.parse(completionDeadline) <= Date.parse(observedAt)
    || Date.parse(completionDeadline) - Date.parse(observedAt) > 365 * DAY_MS) {
    fail("COMPLETION_DEADLINE_INVALID");
  }
  const privateRoot = path.resolve(options.privateRoot
    ?? path.join(process.cwd(), ".outsider", "private"));
  privateDirectory(privateRoot);
  const safeDate = observedAt.slice(0, 10).replaceAll("-", "");
  const runDirectory = mkdtempSync(path.join(privateRoot,
    `first-physical-unified-preflight-${safeDate}-`));
  chmodSync(runDirectory, 0o700);
  const runtimeDirectory = path.join(runDirectory, "runtime");
  privateDirectory(runtimeDirectory);
  const nonce = randomBytes(16).toString("hex");
  const requestId = `physical_unified_live_${nonce}`;
  const scope = `${observedAt}\0${requestId}`;
  const authorityExpiry = addMs(observedAt, 45 * 60 * 1_000);
  const recordedAt = addMs(observedAt, -1_000);
  const attempts = [];
  const baseFetch = mode === "LIVE" ? globalThis.fetch : options.fetchImpl;
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    attempts.push(Object.freeze({ hostname: parsed.hostname,
      method: String(init.method ?? "GET").toUpperCase() }));
    return baseFetch(url, init);
  };
  const ref = (label) => runHash(scope, label);
  let bestBuySources = null;
  const loadBestBuySources = () => {
    if (bestBuySources === null) {
      bestBuySources = mode === "LIVE"
        ? bestBuyLiveSourceSet() : bestBuyFixtureSourceSet();
    }
    return bestBuySources;
  };
  const dependencies = {
    clock: () => observedAt,
    fetchImpl,
    async modelInference() { return approvedMilestoneDraft(); },
    async resolveFoundationContext(input) {
      const outcomeIntentRefHash = pinAtomicBuyerNativeFrozenArtifactV1(
        "OUTCOME", input.frozenOutcome);
      const workOrder = makeWorkOrder(scope, outcomeIntentRefHash, recordedAt);
      return {
        workOrderProjection: workOrder,
        expectedWorkOrderHash: workOrder.workOrderHash,
        prospectiveCensusProjectionHash: ref("prospective-census"),
        foundationBindings: {
          workOrderHash: workOrder.workOrderHash,
          typedGraph: workOrder.typedGraph,
          authorizationBinding: {
            actorIdentityEnvelopeHash: ref("actor-envelope"),
            delegationEvidenceRefHash: ref("delegation-evidence"),
            delegationEdgeHash: ref("delegation-edge"),
            authorityScopeRefHash: ref("formation-authority-scope"),
            resourceOwnerAuthorizationRefHash:
              ref("user-formation-authorization"),
            rightsPrivacyPolicyRefHash: ref("rights-privacy-policy"),
          },
          subjectRefHash: ref("physical-cable-subject"),
          regionRefHash: ref("global-order-scoped-region"),
          consequenceEnvelopeRefHash: ref("consequence-envelope"),
          affectedChannelRefHashes: [ref("consequence-channel")],
          maximumConsequence: {
            consequenceClassCode: "BOUNDED_FORMATION_DELAY",
            measureCode: "MAXIMUM_FORMATION_DELAY",
            maximumValue: 30,
            unitCode: "MINUTE",
          },
        },
      };
    },
    resolveRouteRequests: null,
    async resolveTargetCandidateBinding({ destination, program, budget }) {
      const region = destination.region?.toUpperCase() ?? null;
      if (destination.countryCode !== "US"
        || destination.postalCode !== "02446"
        || ![null, "MA", "MASSACHUSETTS"].includes(region)) return null;
      return { tcin: "91252434", quantity: 1,
        postalCode: destination.postalCode, state: "MA",
        pricingStoreId: "2822", fulfillmentStoreId: "2822",
        latitude: 42.343, longitude: -71.122,
        requestedDeliveryDate: localDateAt(program.completionDeadline,
          "America/New_York"),
        maximumAmountMinor: budget.maximumAmountMinor };
    },
    async resolveBestBuyCandidateBinding({ destination, program, budget }) {
      const region = destination.region?.toUpperCase() ?? null;
      if (destination.countryCode !== "US"
        || destination.postalCode !== "02446"
        || ![null, "MA", "MASSACHUSETTS"].includes(region)) return null;
      const source = loadBestBuySources();
      return {
        sku: "12150546", bsin: "JJ858RS2Z5",
        postalCode: destination.postalCode,
        requestedCableQuantity: 1, cartLineQuantity: 1,
        requestedDeliveryDate: localDateAt(program.completionDeadline,
          "America/New_York"),
        maximumAmountMinor: budget.maximumAmountMinor,
        reviewedProductSpec: { packCableQuantity: 2,
          cableLengthFeet: 3, connectorA: "USB_A_MALE",
          connectorB: "USB_C_MALE", connectorGender: "MALE_TO_MALE",
          powerClaim: "3A/5V up to 15W",
          dataTransferClaim: "up to 480Mbps",
          evidenceRefHash: hashBytes(source.reviewedEvidence) },
        sourcePins: { productSourceBytesHash: hashBytes(source.product),
          cartSourceBytesHash: hashBytes(source.cart),
          guestCheckoutSourceBytesHash: hashBytes(source.guestCheckout) },
      };
    },
    async bestBuyCandidateSourceRead({ stage }) {
      const source = loadBestBuySources();
      if (stage === "PRODUCT") return Buffer.from(source.product);
      if (stage === "CART") return Buffer.from(source.cart);
      if (stage === "GUEST_CHECKOUT") {
        return Buffer.from(source.guestCheckout);
      }
      fail("BESTBUY_SOURCE_STAGE_INVALID");
    },
    async revalidateTransactionAuthority(entry) {
      return { active: true, authorityRefHash: entry.authorityRefHash,
        observedAt: entry.observedAt, expiresAt: authorityExpiry };
    },
    async witnessReadinessImpl({ request }) {
      return {
        sourceBytes: canonicalCandidateWitnessBytes(request, observedAt),
        sourceState: request.operation === "QUOTE"
          ? "QUOTE_AVAILABLE" : "STATE_OBSERVED",
        sourceExpiresAt: request.operation === "QUOTE"
          ? authorityExpiry : null,
        sourceRecordClass: request.operation === "QUOTE"
          ? "QUOTE" : "STATUS_RECEIPT",
      };
    },
    selectShippingRate: null,
  };
  const product = createFirstPhysicalOutcomeUnifiedProductV1({
    directory: runtimeDirectory,
    formationWindowMs: FORMATION_WINDOW_MS,
    cleanupWindowMs: CLEANUP_WINDOW_MS,
  }, dependencies);
  const request = {
    requestId,
    goal: OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1,
    budget: privateFormationRequest?.budget
      ?? { currency: "USD", maximumAmountMinor: "2500" },
    completionDeadline,
    context: { locale: "en-US",
      destinationProvided: privateFormationRequest !== null,
      executionScope: "NO_PAYMENT_FORMATION_PREFLIGHT" },
  };
  const injected = {
    formationAuthorization: { formationOperationsAuthorized: true,
      commitWithoutSeparatePaymentAuthorization: false },
    transactionAuthority: {
      authorityRefHash: ref("transaction-formation-authority"),
      principalEpochRefHash: ref("principal-epoch-projection"),
      issuedAt: recordedAt,
      expiresAt: authorityExpiry,
    },
    destination: privateFormationRequest?.destination ?? null,
  };
  let result = null;
  let error = null;
  try {
    result = await product.requestOutcome(request, injected);
    writeOnce(path.join(runDirectory, "unified-result.json"), result);
  } catch (caught) {
    error = caught;
    writeOnce(path.join(runDirectory, "failure.json"), {
      schema: "outsider/private-first-physical-unified-preflight-failure/v1",
      observedAt, requestId, failureCode: safeErrorCode(caught),
      failureMessageHash: hashText(String(caught?.message ?? caught)),
      paymentAttempted: false, checkoutAttempted: false,
      orderSubmitted: false, decisionState: "HOLD",
    });
  }
  const occurrence = privateOccurrenceSummary(runtimeDirectory);
  const excluded = new Set(["evidence-inventory.json", "public-summary.json"]);
  const payloadInventory = walkPrivateFiles(runDirectory, excluded);
  const inventoryBody = {
    schema: INVENTORY_SCHEMA, schemaVersion: "1.0.0", observedAt,
    requestId, files: payloadInventory,
    fileCount: payloadInventory.length,
    totalBytes: payloadInventory.reduce((sum, row) => sum + row.bytes, 0),
    artifactSetHash: digest(
      "outsider/first-physical-unified-live-preflight-artifact-set/v1",
      payloadInventory),
  };
  const inventoryRecord = Object.freeze({ ...inventoryBody,
    inventoryHash: digest(inventoryBody.schema, inventoryBody) });
  const inventoryFile = writeOnce(path.join(runDirectory,
    "evidence-inventory.json"), inventoryRecord);
  const summary = publicSummaryBody({ mode, observedAt, completionDeadline,
    requestId, result, error, attempts, occurrence, payloadInventory,
    inventoryFile, supersedesSummaryProjectionHashes,
    privateDestinationFormationUsed: privateFormationRequest !== null });
  const summaryFile = writeOnce(path.join(runDirectory,
    "public-summary.json"), summary);
  const finalTree = walkPrivateFiles(runDirectory);
  const output = Object.freeze({
    schema: "outsider/first-physical-outcome-unified-live-preflight-run/v1",
    schemaVersion: "1.0.0",
    evidenceDirectory: runDirectory,
    publicSummary: summary,
    publicSummaryFileBytes: summaryFile.bytes,
    publicSummaryFileHash: summaryFile.hash,
    finalPrivateTreeFileCount: finalTree.length,
    finalPrivateTreeBytes: finalTree.reduce((sum, row) => sum + row.bytes, 0),
  });
  if (error !== null) {
    const wrapped = new Error(`${PREFIX}${summary.failureCode}`,
      { cause: error });
    wrapped.outsiderCode = summary.failureCode;
    wrapped.preflightResult = output;
    throw wrapped;
  }
  return output;
}

function parseCli(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  if (!argv.includes("--live-no-payment")) fail("LIVE_CONFIRMATION_REQUIRED");
  const known = new Set(["--live-no-payment", "--private-root",
    "--private-request-file", "--supersedes-summary-hash",
    "--supersedes-summary-file"]);
  for (let index = 0; index < argv.length; index += 1) {
    if (!known.has(argv[index])) fail("ARGUMENT_INVALID");
    if (["--private-root", "--private-request-file",
      "--supersedes-summary-hash", "--supersedes-summary-file"]
      .includes(argv[index])) index += 1;
  }
  const index = argv.indexOf("--private-root");
  if (index >= 0 && (index + 1 >= argv.length
    || argv[index + 1].startsWith("--"))) fail("PRIVATE_ROOT_REQUIRED");
  const requestIndex = argv.indexOf("--private-request-file");
  if (requestIndex >= 0 && (requestIndex + 1 >= argv.length
    || argv[requestIndex + 1].startsWith("--"))) {
    fail("PRIVATE_DESTINATION_FORMATION_REQUEST_FILE_REQUIRED");
  }
  const supersedesSummaryProjectionHashes = [];
  for (let cursor = 0; cursor < argv.length; cursor += 1) {
    if (argv[cursor] === "--supersedes-summary-hash") {
      const value = argv[cursor + 1];
      if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? "")) {
        fail("SUPERSESSION_HASH_INVALID");
      }
      supersedesSummaryProjectionHashes.push(value);
      cursor += 1;
    }
    if (argv[cursor] === "--supersedes-summary-file") {
      const value = argv[cursor + 1];
      if (value === undefined || value.startsWith("--")) {
        fail("SUPERSESSION_SUMMARY_FILE_REQUIRED");
      }
      supersedesSummaryProjectionHashes.push(
        readVerifiedSummaryProjectionHash(value));
      cursor += 1;
    }
  }
  if (new Set(supersedesSummaryProjectionHashes).size
    !== supersedesSummaryProjectionHashes.length) {
    fail("SUPERSESSION_DUPLICATE");
  }
  return { help: false, privateRoot: index < 0 ? undefined : argv[index + 1],
    privateRequestFile: requestIndex < 0 ? undefined
      : argv[requestIndex + 1],
    supersedesSummaryProjectionHashes };
}

async function main(argv) {
  const options = parseCli(argv);
  if (options.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/outsider-first-physical-outcome-unified-live-preflight-v1.mjs \\",
      "    --live-no-payment [--private-root DIRECTORY] \\",
      "    [--private-request-file MODE_0600_CANONICAL_JSON] \\",
      "    [--supersedes-summary-file VERIFIED_SUMMARY ...]",
      "",
      `Confirmation: ${CONFIRMATION}`,
      "Creates isolated guest carts; cannot pay, checkout, submit an order,",
      "reserve capacity, or issue an outcome promise. A supplied private v2",
      "request sends only country/postal/region/city to the SparkFun quote",
      "surface; it accepts no street address or payment authority.",
      "",
    ].join("\n"));
    return;
  }
  try {
    const output = await runFirstPhysicalOutcomeUnifiedLivePreflightV1({
      mode: "LIVE", privateRoot: options.privateRoot,
      privateFormationRequest: options.privateRequestFile === undefined
        ? null
        : readPrivateDestinationFormationRequestV2(
          options.privateRequestFile),
      supersedesSummaryProjectionHashes:
        options.supersedesSummaryProjectionHashes,
    });
    process.stdout.write(`${canonicalizeStrict(output)}\n`);
    if (output.publicSummary.runState !== "COMPLETED_HOLD") {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error?.preflightResult !== undefined) {
      process.stdout.write(`${canonicalizeStrict(error.preflightResult)}\n`);
    }
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
