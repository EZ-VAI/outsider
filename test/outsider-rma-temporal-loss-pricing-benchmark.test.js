import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildRmaTemporalLossPricingBenchmark,
  RMA_TEMPORAL_LOSS_PRICING_CANONICAL,
  RMA_TEMPORAL_LOSS_PRICING_SCHEMA,
  verifyRmaTemporalLossPricingBenchmark,
  verifyRmaTemporalLossPricingBenchmarkWithSource,
  verifyRmaTemporalLossPricingCanonical,
  verifyRmaTemporalLossPricingCanonicalWithSource,
} from "../src/outsider-rma-temporal-loss-pricing-benchmark.js";

const ROOT = path.resolve("artifacts/rma-temporal-loss-pricing-2010-2020");
const SOURCE = path.join(ROOT, "source");
const CANONICAL = path.join(ROOT, "final-v2/artifact.json");
const V1_CANONICAL = path.join(ROOT, "final-v1/artifact.json");
const V1_RECEIPT = path.join(ROOT, "final-v1/verification-receipt.json");
const HAS_CANONICAL = existsSync(CANONICAL);

function reseal(artifact) {
  const copy = structuredClone(artifact);
  delete copy.artifactHash;
  copy.artifactHash = `sha256:${createHash("sha256")
    .update(`${RMA_TEMPORAL_LOSS_PRICING_SCHEMA}\0${canonicalizeStrict(copy)}`).digest("hex")}`;
  return copy;
}

test("RMA temporal canonical fits a source-domain benchmark without target training", {
  skip: !HAS_CANONICAL,
  timeout: 120_000,
}, () => {
  const artifact = JSON.parse(readFileSync(CANONICAL, "utf8"));
  assert.equal(artifact.artifactHash,
    "sha256:7ebd42f5969253924a44c632ab2b2afbcc194b734fa3b67eb396a0fcf8b64df3");
  assert.equal(artifact.identity.version, "final-v2");
  assert.equal(artifact.identity.generatedAtFixed, true);
  assert.equal(artifact.headline,
    "RMA_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_PER_EARNING_POLICY_CELL_BENCHMARK");
  assert.equal(artifact.annual.length, 11);
  assert.deepEqual(artifact.temporal.frozenSplit.developmentYears,
    [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017]);
  assert.deepEqual(artifact.temporal.frozenSplit.calibrationYears, [2018, 2019]);
  assert.deepEqual(artifact.temporal.frozenSplit.testYears, [2020]);
  assert.equal(artifact.temporal.calibration2018To2019.meanAbsolutePercentageError,
    "0.40433123");
  assert.equal(artifact.temporal.holdout2020
    .indicatedLossCostPerEarningPolicyCellDollars, "6996.62");
  assert.equal(artifact.temporal.holdout2020
    .actualLossCostPerEarningPolicyCellDollars, "7829.81");
  assert.equal(artifact.temporal.holdout2020.absolutePercentageError, "0.10641259");
  assert.equal(artifact.temporal.nextYearSourceDomainShadow
    .indicatedLossCostPerEarningPolicyCellDollars, "8007.93");
  assert.equal(artifact.admission.sourceDomainBenchmarkFitted, true);
  assert.equal(artifact.admission.sourceDomainFitYearCount, 8);
  assert.equal(artifact.admission.sourceDomainCalibrationYearCount, 2);
  assert.equal(artifact.admission.sourceDomainTestYearCount, 1);
  assert.equal(artifact.admission.targetDomainModelTrained, false);
  assert.equal(artifact.admission.automaticTraining, false);
  assert.equal(typeof artifact.admission.trainingPermission, "boolean");
  assert.equal(artifact.admission.trainingPermission, false);
  assert.equal(typeof artifact.admission.pricePermission, "boolean");
  assert.equal(artifact.admission.pricePermission, false);
  assert.equal(artifact.admission.targetQuotedPrice, null);
  assert.equal(artifact.admission.targetPriceState, "NULL_NOT_ZERO");
  const standalone = verifyRmaTemporalLossPricingBenchmark(artifact);
  assert.equal(standalone.ok, false);
  assert.equal(standalone.verificationLevel, "SOURCE_REPLAY_REQUIRED");
  assert.ok(standalone.failures.includes("SOURCE_REPLAY_REQUIRED"));
  const canonicalOnly = verifyRmaTemporalLossPricingCanonical(CANONICAL);
  assert.equal(canonicalOnly.ok, false);
  assert.equal(canonicalOnly.canonicalPathVerified, true);
  assert.equal(canonicalOnly.canonicalBytesVerified, true);
  assert.equal(canonicalOnly.canonicalFileBytes,
    RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactFileBytes);
  const replay = verifyRmaTemporalLossPricingCanonicalWithSource(CANONICAL, SOURCE);
  assert.equal(replay.ok, true, replay.failures.join("\n"));
  assert.equal(replay.verificationLevel,
    "FULL_OFFICIAL_USDA_RMA_TEMPORAL_SOURCE_REPLAYED");
  assert.equal(replay.currentChainArtifactsReplayed, false);
  assert.equal(replay.currentChainAdmitted, false);
  assert.equal(replay.currentChainDecision,
    "NOT_EVALUATED_BY_INDEPENDENT_RMA_SOURCE_LANE");
});

test("coherently resealed 2020 and 2021 amount attacks never verify standalone or by source", {
  skip: !HAS_CANONICAL,
  timeout: 120_000,
}, () => {
  const artifact = JSON.parse(readFileSync(CANONICAL, "utf8"));
  const attacks = [
    (copy) => {
      copy.temporal.holdout2020.indicatedLossCostPerEarningPolicyCellDollars
        = "999999999.99";
    },
    (copy) => {
      copy.temporal.nextYearSourceDomainShadow
        .indicatedLossCostPerEarningPolicyCellDollars = "999999999.99";
    },
  ];
  for (const attack of attacks) {
    const forged = structuredClone(artifact);
    attack(forged);
    const standalone = verifyRmaTemporalLossPricingBenchmark(reseal(forged));
    assert.equal(standalone.ok, false);
    assert.ok(standalone.failures.includes("SOURCE_REPLAY_REQUIRED"));
  }
  const combined = structuredClone(artifact);
  for (const attack of attacks) attack(combined);
  const replay = verifyRmaTemporalLossPricingBenchmarkWithSource(reseal(combined), SOURCE);
  assert.equal(replay.ok, false);
  assert.ok(replay.failures.includes("SOURCE_DERIVATION_INVALID"));
});

test("RMA temporal envelope cannot self-promote target training or price", {
  skip: !HAS_CANONICAL,
}, () => {
  const artifact = JSON.parse(readFileSync(CANONICAL, "utf8"));
  for (const mutate of [
    (copy) => { copy.admission.targetDomainModelTrained = true; },
    (copy) => { copy.admission.trainingPermission = true; },
    (copy) => { copy.admission.pricePermission = true; },
    (copy) => { copy.admission.targetQuotedPrice = "8007.93"; },
    (copy) => { copy.admission.targetPriceState = "NUMERIC_ZERO"; },
  ]) {
    const copy = structuredClone(artifact);
    mutate(copy);
    const checked = verifyRmaTemporalLossPricingBenchmark(reseal(copy));
    assert.equal(checked.ok, false);
    assert.ok(checked.failures.includes("AUTHORITY_BOUNDARY_INVALID"));
  }
});

test("RMA temporal final-v2 rejects alternate and future frozen timestamps", {
  skip: !HAS_CANONICAL,
}, () => {
  const artifact = JSON.parse(readFileSync(CANONICAL, "utf8"));
  assert.equal(artifact.generatedAt, "2026-08-22T09:26:00.000Z");
  assert.ok(Date.parse(artifact.generatedAt) <= Date.now());
  for (const generatedAt of [
    "2026-08-22T08:59:59.999Z",
    "2030-01-01T00:00:00.000Z",
  ]) {
    const copy = structuredClone(artifact);
    copy.generatedAt = generatedAt;
    copy.identity.generatedAt = generatedAt;
    const checked = verifyRmaTemporalLossPricingBenchmark(reseal(copy));
    assert.equal(checked.ok, false);
    assert.ok(checked.failures.includes("SCHEMA_INVALID"));
  }
});

test("RMA temporal source and canonical permissions are private", {
  skip: !HAS_CANONICAL,
}, () => {
  assert.equal(statSync(ROOT).mode & 0o777, 0o700);
  assert.equal(statSync(SOURCE).mode & 0o777, 0o700);
  assert.equal(statSync(path.dirname(CANONICAL)).mode & 0o777, 0o700);
  assert.equal(statSync(CANONICAL).mode & 0o777, 0o600);
  assert.equal(createHash("sha256").update(readFileSync(V1_CANONICAL)).digest("hex"),
    "3f0ffd67317c831ac12cf998e53c8ce04e2f85c1f0d33859415156d6d48748e2");
  assert.equal(createHash("sha256").update(readFileSync(V1_RECEIPT)).digest("hex"),
    "968b2f98504fdf20504f58d7336bb80b193d54939b72b7f564e7b36c6d1adb67");
  for (const name of readdirSync(SOURCE)) {
    assert.equal(statSync(path.join(SOURCE, name)).mode & 0o777, 0o600, name);
  }
});

test("RMA temporal source rejects directory symlinks and permissive roots", {
  skip: !HAS_CANONICAL,
}, () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-rma-temporal-"));
  chmodSync(temporary, 0o700);
  const link = path.join(temporary, "source-link");
  symlinkSync(SOURCE, link, "dir");
  assert.throws(() => buildRmaTemporalLossPricingBenchmark(link),
    /RMA_TEMPORAL_SOURCE_DIRECTORY_INVALID/);
  const permissive = mkdtempSync(path.join(tmpdir(), "outsider-rma-permissive-"));
  chmodSync(permissive, 0o755);
  assert.throws(() => buildRmaTemporalLossPricingBenchmark(permissive),
    /RMA_TEMPORAL_SOURCE_DIRECTORY_INVALID/);
});

test("RMA temporal CLI refuses to clobber the canonical artifact before replay", {
  skip: !HAS_CANONICAL,
}, () => {
  const result = spawnSync(process.execPath, [
    "scripts/rma-temporal-loss-pricing-benchmark.mjs", "build",
    "--source-dir", SOURCE, "--out", CANONICAL,
  ], { cwd: path.resolve("."), encoding: "utf8", timeout: 10_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RMA_TEMPORAL_CLI_OUT_ALREADY_EXISTS/);
});

test("RMA temporal final-v2 rejects arbitrary generatedAt input", {
  skip: !HAS_CANONICAL,
}, () => {
  const result = spawnSync(process.execPath, [
    "scripts/rma-temporal-loss-pricing-benchmark.mjs", "build",
    "--source-dir", SOURCE,
    "--out", path.join(ROOT, "forbidden-time/artifact.json"),
    "--generated-at", "2030-01-01T00:00:00.000Z",
  ], { cwd: path.resolve("."), encoding: "utf8", timeout: 10_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /RMA_TEMPORAL_CLI_ARGUMENT_INVALID:--generated-at/);
});
