#!/usr/bin/env node

/*
 * Multi-source production decision entry for the first physical Outcome
 * Product.  It consumes frozen unified, SparkFun, and Target projections and
 * persists one privacy-safe state for autonomous formation continuation.
 * It performs no network, payment, order, capacity, or commitment operation.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { materializeFirstPhysicalFormationRankingV2 } from
  "../src/outsider-first-physical-formation-ranking-materializer-v2.js";

export const FIRST_PHYSICAL_FORMATION_PRODUCT_STATE_V2_SCHEMA =
  "outsider/first-physical-formation-product-state/v2";

const PREFIX = "OUTSIDER_FIRST_PHYSICAL_FORMATION_DECISION_RUNNER_V2_";
const MAX_INPUT_BYTES = 16 * 1024 * 1024;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function readFrozenProjection(file, label) {
  if (typeof file !== "string" || file.length === 0) fail(`${label}_PATH_INVALID`);
  const absolute = path.resolve(file);
  let info;
  try { info = lstatSync(absolute); }
  catch { fail(`${label}_FILE_UNAVAILABLE`); }
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600
    || info.size < 3 || info.size > MAX_INPUT_BYTES) fail(`${label}_FILE_INVALID`);
  const bytes = readFileSync(absolute);
  if (bytes.at(-1) !== 0x0a) fail(`${label}_FILE_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${label}_JSON_INVALID`); }
  if (!canonicalBytes(value).equals(bytes)) fail(`${label}_NOT_CANONICAL`);
  return value;
}

function privateDirectory(directory) {
  if (typeof directory !== "string" || directory.length === 0) {
    fail("OUTPUT_DIRECTORY_INVALID");
  }
  const absolute = path.resolve(directory);
  let info;
  try { info = lstatSync(absolute); }
  catch (error) {
    if (error?.code !== "ENOENT") fail("OUTPUT_DIRECTORY_INVALID");
    mkdirSync(absolute, { recursive: true, mode: 0o700 });
    info = lstatSync(absolute);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("OUTPUT_DIRECTORY_INVALID");
  chmodSync(absolute, 0o700);
  if ((lstatSync(absolute).mode & 0o777) !== 0o700) fail("OUTPUT_DIRECTORY_MODE_INVALID");
  return absolute;
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function persistOnce(outputDirectory, productState) {
  const bytes = canonicalBytes(productState);
  const file = path.join(outputDirectory,
    `formation-product-state-v2-${productState.productStateHash.slice(7)}.json`);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("OUTPUT_REPLAY_CONFLICT");
    return Object.freeze({ file, bytes: bytes.length, replayed: true });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  return Object.freeze({ file, bytes: bytes.length, replayed: false });
}

function safeRankings(materialization) {
  const providers = new Map(materialization.hardConstraintEvaluations.map((row) =>
    [row.candidateRefHash, row.provider]));
  return Object.fromEntries(["PRIMARY", "RECOVERY", "WITNESS"].map((role) => [role,
    materialization.ranking.rankings[role].map((row) => ({
      rank: row.rank,
      provider: providers.get(row.candidateRefHash),
      rankingScore: row.rankingScore,
      explanationCodes: [...row.explanationCodes],
    }))]));
}

function safeHardRejections(materialization) {
  return materialization.hardConstraintEvaluations
    .filter((row) => row.hardFilterDecision === "REJECT_HARD_CONSTRAINT")
    .map((row) => ({
      provider: row.provider,
      sourceKind: row.sourceKind ?? "UNIFIED_FROZEN_PROJECTION",
      failedConstraints: Object.entries(row.constraints)
        .filter(([, constraint]) => constraint.state === "FAIL")
        .map(([constraint, value]) => ({ constraint, reasonCode: value.reasonCode }))
        .sort((left, right) => left.constraint.localeCompare(right.constraint)),
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

function createProductState(materialization) {
  if (materialization.outcomeCommitEligible !== false
    || materialization.boundary.paymentAttempted !== false
    || materialization.boundary.orderSubmitted !== false
    || materialization.boundary.employeeTouches !== 0
    || materialization.boundary.humanQueueCreated !== false
    || materialization.boundary.targetIndependentSellerProjectionConsumed !== true
    || materialization.boundary.targetProductHardFilterAppliedBeforeRanking !== true
    || materialization.boundary.targetRankingScoreComputed !== false) {
    fail("MATERIALIZATION_BOUNDARY_INVALID");
  }
  const facts = materialization.materializedRealityFacts;
  const sparkfun = materialization.hardConstraintEvaluations.find((row) =>
    row.provider === "SPARKFUN_MAGENTO_GUEST_CART");
  if (!sparkfun) fail("SPARKFUN_FACTS_MISSING");
  const body = {
    schema: FIRST_PHYSICAL_FORMATION_PRODUCT_STATE_V2_SCHEMA,
    schemaVersion: "2.0.0",
    product: {
      outcomeKind: "PHYSICAL_GOODS_DELIVERY",
      exactItem: { condition: "NEW", connectorA: "USB_A_MALE",
        connectorB: "USB_C_MALE", dataRequired: true,
        fiveVoltPowerRequired: true, minimumLengthMm: 900,
        maximumLengthMm: 1100, quantity: 1 },
    },
    formationOperationalState: "CONTINUE_AUTONOMOUSLY",
    outcomePromiseState: "NOT_COMMITTED",
    paymentState: "AUTHORIZATION_REQUIRED",
    interaction: {
      userActionRequiredNow: false,
      paymentAuthorizationCollectionState:
        "DEFERRED_UNTIL_FORMATION_IS_COMMIT_READY",
      humanQueueCreated: false,
      employeeTouches: 0,
      userBabysitting: 0,
    },
    observedSellerStates: [
      {
        provider: "SPARKFUN_MAGENTO_GUEST_CART",
        sourceKind: "INDEPENDENT_FROZEN_SELLER_PROJECTION_V1",
        currency: facts.sparkFunCurrency,
        maximumAmountMinor: sparkfun.facts.maximumAmountMinor,
        finalTotalMinor: facts.sparkFunFinalTotalMinor,
        selectedShippingMethod: facts.sparkFunSelectedShippingMethod,
        productConstraintState: sparkfun.constraints.product.state,
        budgetConstraintState: facts.sparkFunBudgetConstraintState,
        deadlineConstraintState: facts.sparkFunDeadlineConstraintState,
        structuredEtaAvailable: facts.sparkFunStructuredEtaAvailable,
      },
      {
        provider: "TARGET_REDSKY_READ_ONLY_CANDIDATE",
        sourceKind: facts.target.sourceKind,
        currency: facts.target.currency,
        unitPriceMinor: facts.target.unitPriceMinor,
        itemPlusScheduledDeliveryFeeBeforeTaxMinor:
          facts.target.itemPlusScheduledDeliveryFeeBeforeTaxMinor,
        maximumAmountMinor: facts.target.maximumAmountMinor,
        explicit5vClaim: facts.target.explicit5vClaim,
        dataTransferClaimed: facts.target.dataTransferClaimed,
        availabilityStatus: facts.target.availabilityStatus,
        availableToPromiseQuantity: facts.target.availableToPromiseQuantity,
        productConstraintState: facts.target.productConstraintState,
        productConstraintReasonCode: facts.target.productConstraintReasonCode,
        budgetConstraintState: facts.target.budgetConstraintState,
        deadlineConstraintState: facts.target.deadlineConstraintState,
        sourceDateMeetsRequestedDeadline: facts.target.sourceDateMeetsRequestedDeadline,
        sourceDateIsBindingCommitment: false,
        providerSourceEstablishesCapacity: false,
      },
    ],
    formationSearchOrder: safeRankings(materialization),
    hardRejectedCandidates: safeHardRejections(materialization),
    rankingEvidence: {
      episodeReportOccurrencesInspected:
        materialization.rankingEvidence.episodeReportOccurrenceCount,
      completeCandidateBoundIndependentOutcomes:
        materialization.rankingEvidence
          .completeCandidateBoundEpisodeOutcomeObservationCount,
      empiricalObservationsMaterialized:
        materialization.rankingEvidence.empiricalObservationsMaterialized,
      causalProofsMaterialized:
        materialization.rankingEvidence.causalProofsMaterialized,
      modelDecision: materialization.rankingEvidence.modelDecision,
      rankingPurpose: "SEARCH_ORDER_ONLY",
    },
    commitmentBlockers: [...materialization.commitmentBlockers],
    nextMachineSearchObjectives: [...materialization.nextMachineSearchObjectives],
    boundary: {
      independentFrozenSellerProjectionCount: 2,
      hardConstraintsEvaluatedBeforeRanking: true,
      targetRankingScoreComputed: false,
      rankingCreatesAuthority: false,
      rankingProvesCapacity: false,
      rankingProvesOutcomeTruth: false,
      paymentAttempted: false,
      orderSubmitted: false,
      rawInputProjected: false,
      sourcePathsProjected: false,
      sourceHashesProjected: false,
      candidateHashesProjected: false,
      destinationOrContactProjected: false,
      piiDerivedUnsaltedHashesProjected: false,
    },
  };
  return Object.freeze({ ...body,
    productStateHash: digest(FIRST_PHYSICAL_FORMATION_PRODUCT_STATE_V2_SCHEMA, body) });
}

export function runFirstPhysicalFormationDecisionV2(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Reflect.ownKeys(input).length !== 4
    || !Object.hasOwn(input, "unifiedResultFile")
    || !Object.hasOwn(input, "sparkFunSellerProjectionFile")
    || !Object.hasOwn(input, "targetSellerProjectionFile")
    || !Object.hasOwn(input, "outputDirectory")) fail("INPUT_INVALID");
  const materialization = materializeFirstPhysicalFormationRankingV2({
    unifiedResult: readFrozenProjection(input.unifiedResultFile, "UNIFIED_RESULT"),
    sparkFunFullAddressProjection: readFrozenProjection(
      input.sparkFunSellerProjectionFile, "SPARKFUN_SELLER_PROJECTION"),
    targetRedskyFormationCandidateProjection: readFrozenProjection(
      input.targetSellerProjectionFile, "TARGET_SELLER_PROJECTION"),
  });
  const productState = createProductState(materialization);
  const persisted = persistOnce(privateDirectory(input.outputDirectory), productState);
  return Object.freeze({ productState, ...persisted });
}

function parseCli(argv) {
  const accepted = new Set(["--unified-result", "--sparkfun-seller-projection",
    "--target-seller-projection", "--output-directory"]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!accepted.has(flag) || typeof value !== "string" || value.length === 0
      || Object.hasOwn(parsed, flag)) fail("CLI_ARGUMENT_INVALID");
    parsed[flag] = value;
  }
  if (Reflect.ownKeys(parsed).length !== accepted.size) fail("CLI_ARGUMENT_INVALID");
  return {
    unifiedResultFile: parsed["--unified-result"],
    sparkFunSellerProjectionFile: parsed["--sparkfun-seller-projection"],
    targetSellerProjectionFile: parsed["--target-seller-projection"],
    outputDirectory: parsed["--output-directory"],
  };
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = runFirstPhysicalFormationDecisionV2(parseCli(process.argv.slice(2)));
  process.stdout.write(`${canonicalizeStrict(result.productState)}\n`);
}
