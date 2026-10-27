#!/usr/bin/env node

/*
 * Thin production decision entry for the first physical Outcome Product.
 *
 * It consumes frozen unified-outcome and seller projections, delegates all
 * candidate math to the existing ranking materializer, and persists only a
 * privacy-safe product state.  A seller cart/quote is not surfaced as a human
 * work item: low-risk formation continues autonomously until every commit gate
 * is closed.  This runner performs no network, payment, order, or commit call.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { materializeFirstPhysicalFormationRankingV1 } from
  "../src/outsider-first-physical-formation-ranking-materializer-v1.js";

export const FIRST_PHYSICAL_FORMATION_PRODUCT_STATE_V1_SCHEMA =
  "outsider/first-physical-formation-product-state/v1";

const PREFIX = "OUTSIDER_FIRST_PHYSICAL_FORMATION_DECISION_RUNNER_V1_";
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
  if (!Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8").equals(bytes)) {
    fail(`${label}_NOT_CANONICAL`);
  }
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
    `formation-product-state-${productState.productStateHash.slice(7)}.json`);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
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
    || materialization.boundary.humanQueueCreated !== false) {
    fail("MATERIALIZATION_BOUNDARY_INVALID");
  }
  const facts = materialization.materializedRealityFacts;
  const body = {
    schema: FIRST_PHYSICAL_FORMATION_PRODUCT_STATE_V1_SCHEMA,
    schemaVersion: "1.0.0",
    product: {
      outcomeKind: "PHYSICAL_GOODS_DELIVERY",
      exactItem: {
        condition: "NEW",
        connectorA: "USB_A_MALE",
        connectorB: "USB_C_MALE",
        dataRequired: true,
        fiveVoltPowerRequired: true,
        minimumLengthMm: 900,
        maximumLengthMm: 1100,
        quantity: 1,
      },
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
    observedSellerState: {
      provider: "SPARKFUN_MAGENTO_GUEST_CART",
      currency: facts.sparkFunCurrency,
      maximumAmountMinor: materialization.hardConstraintEvaluations.find((row) =>
        row.provider === "SPARKFUN_MAGENTO_GUEST_CART")?.facts.maximumAmountMinor,
      finalTotalMinor: facts.sparkFunFinalTotalMinor,
      selectedShippingMethod: facts.sparkFunSelectedShippingMethod,
      budgetConstraintState: facts.sparkFunBudgetConstraintState,
      deadlineConstraintState: facts.sparkFunDeadlineConstraintState,
      structuredEtaAvailable: facts.sparkFunStructuredEtaAvailable,
    },
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
    productStateHash: digest(FIRST_PHYSICAL_FORMATION_PRODUCT_STATE_V1_SCHEMA, body) });
}

export function runFirstPhysicalFormationDecisionV1(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Reflect.ownKeys(input).length !== 3
    || !Object.hasOwn(input, "unifiedResultFile")
    || !Object.hasOwn(input, "sellerProjectionFile")
    || !Object.hasOwn(input, "outputDirectory")) fail("INPUT_INVALID");
  const unifiedResult = readFrozenProjection(input.unifiedResultFile, "UNIFIED_RESULT");
  const sparkFunFullAddressProjection = readFrozenProjection(
    input.sellerProjectionFile, "SELLER_PROJECTION");
  const materialization = materializeFirstPhysicalFormationRankingV1({
    unifiedResult, sparkFunFullAddressProjection,
  });
  const productState = createProductState(materialization);
  const outputDirectory = privateDirectory(input.outputDirectory);
  const persisted = persistOnce(outputDirectory, productState);
  return Object.freeze({ productState, ...persisted });
}

function parseCli(argv) {
  const accepted = new Set(["--unified-result", "--seller-projection",
    "--output-directory"]);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!accepted.has(flag) || typeof value !== "string" || value.length === 0
      || Object.hasOwn(parsed, flag)) fail("CLI_ARGUMENT_INVALID");
    parsed[flag] = value;
  }
  if (Reflect.ownKeys(parsed).length !== accepted.size) fail("CLI_ARGUMENT_INVALID");
  return { unifiedResultFile: parsed["--unified-result"],
    sellerProjectionFile: parsed["--seller-projection"],
    outputDirectory: parsed["--output-directory"] };
}

if (process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = runFirstPhysicalFormationDecisionV1(parseCli(process.argv.slice(2)));
  process.stdout.write(`${canonicalizeStrict(result.productState)}\n`);
}
