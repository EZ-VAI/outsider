import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  createRealityEvidenceAssessment,
  verifyRealityEvidenceAssessment,
} from "../src/outsider-reality-evidence.js";
import {
  PUBLIC_REALITY_SOURCE_BYTE_LIMITS,
  createPublicRealityEvidenceRegistry,
  hashPublicRealityEvidenceValue,
  verifyPublicRealityEvidenceRegistry,
} from "../src/outsider-public-reality-evidence.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const DEFAULT_SOURCE_ROOT = "/private/tmp/outsider-web-data-20260825";
const sourceRoot = process.env.OUTSIDER_PUBLIC_REALITY_SOURCE_ROOT
  ?? (existsSync(DEFAULT_SOURCE_ROOT) ? DEFAULT_SOURCE_ROOT : null);

const SOURCE_FILES = Object.freeze({
  bridgeData: Object.freeze({
    projectPageBytes: ["real-robot", "project-page.html"],
    trajectoryIndexBytes: ["real-robot", "traj_links.csv"],
    datasetInfoBytes: ["real-robot", "dataset_info.json"],
    featuresBytes: ["real-robot", "features.json"],
    actionProprioStatsBytes: ["real-robot",
      "action_proprio_stats_7d6a416829d818b733e7342f225f3c522a8265a5224e0175f2ab28e26a932ff1.json"],
    codeReadmeBytes: ["real-robot", "code-readme.md"],
    codeLicenseBytes: ["real-robot", "code-license.txt"],
    sampleInitialBytes: ["real-robot", "trajectory-sample-initial.jpg"],
    sampleFinalBytes: ["real-robot", "trajectory-sample-final.jpg"],
  }),
  libero: Object.freeze({
    taskMapBytes: ["libero", "libero_suite_task_map.py"],
    benchmarkBytes: ["libero", "benchmark_init.py"],
    readmeBytes: ["libero", "README.md"],
    licenseBytes: ["libero", "LICENSE"],
    sourceTreeBytes: ["libero-deep", "source-tree.json"],
    sourceByteBundleBytes: ["libero-deep", "source-byte-bundle.json"],
  }),
});

const CLI_INPUTS = Object.freeze({
  "--bridge-project-page-input": ["real-robot", "project-page.html"],
  "--bridge-trajectory-index-input": ["real-robot", "traj_links.csv"],
  "--bridge-dataset-info-input": ["real-robot", "dataset_info.json"],
  "--bridge-features-input": ["real-robot", "features.json"],
  "--bridge-action-proprio-stats-input": ["real-robot",
    "action_proprio_stats_7d6a416829d818b733e7342f225f3c522a8265a5224e0175f2ab28e26a932ff1.json"],
  "--bridge-code-readme-input": ["real-robot", "code-readme.md"],
  "--bridge-code-license-input": ["real-robot", "code-license.txt"],
  "--bridge-sample-initial-input": ["real-robot",
    "trajectory-sample-initial.jpg"],
  "--bridge-sample-final-input": ["real-robot", "trajectory-sample-final.jpg"],
  "--libero-task-map-input": ["libero", "libero_suite_task_map.py"],
  "--libero-benchmark-input": ["libero", "benchmark_init.py"],
  "--libero-readme-input": ["libero", "README.md"],
  "--libero-license-input": ["libero", "LICENSE"],
  "--libero-source-tree-input": ["libero-deep", "source-tree.json"],
  "--libero-source-byte-bundle-input": ["libero-deep",
    "source-byte-bundle.json"],
});

const officialAvailable = sourceRoot !== null
  && Object.values(SOURCE_FILES).flatMap((group) => Object.values(group))
    .every((segments) => existsSync(join(sourceRoot, ...segments)));

function officialInput() {
  if (!officialAvailable) throw new Error("OFFICIAL_PUBLIC_REALITY_BYTES_UNAVAILABLE");
  return Object.fromEntries(Object.entries(SOURCE_FILES).map(([group, files]) =>
    [group, Object.fromEntries(Object.entries(files).map(([key, segments]) =>
      [key, readFileSync(join(sourceRoot, ...segments))]))]));
}

function cloneInput(input) {
  return Object.fromEntries(Object.entries(input).map(([group, files]) =>
    [group, Object.fromEntries(Object.entries(files).map(([key, value]) =>
      [key, Buffer.from(value)]))]));
}

function source(registry, needle) {
  const found = registry.sources.find((entry) =>
    String(entry.sourceId).toLowerCase().includes(needle));
  assert.ok(found, `missing ${needle} source`);
  return found;
}

function receipt(sourceEntry, claimType) {
  const found = sourceEntry.claimReceipts.find((entry) =>
    entry.claimType === claimType);
  assert.ok(found, `missing ${sourceEntry.sourceId}/${claimType} receipt`);
  return found;
}

function rehashRegistry(value) {
  const { registryHash: _old, ...body } = value;
  value.registryHash = hashPublicRealityEvidenceValue("registry", body);
  assert.match(value.registryHash, HASH);
  return value;
}

function rehashReceipt(value) {
  const { receiptHash: _old, ...body } = value;
  value.receiptHash = hashPublicRealityEvidenceValue("claim-receipt", body);
  return value;
}

function rehashSourceEntry(value) {
  const { sourceEntryHash: _old, ...body } = value;
  value.sourceEntryHash = hashPublicRealityEvidenceValue("source-entry", body);
  return value;
}

let input;
let registry;
const temporaryRoots = [];

function cliArgs(output) {
  return ["tools/outsider-public-reality-evidence.mjs",
    ...Object.entries(CLI_INPUTS).flatMap(([argument, segments]) =>
      [argument, join(sourceRoot, ...segments)]),
    "--output", output];
}

before(() => {
  if (!officialAvailable) return;
  input = officialInput();
  registry = createPublicRealityEvidenceRegistry(input);
});

after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the closed API publishes finite byte limits for exactly fifteen source inputs", () => {
  assert.deepEqual(Object.keys(PUBLIC_REALITY_SOURCE_BYTE_LIMITS).sort(), [
    "bridgeActionProprioStats", "bridgeCodeLicense", "bridgeCodeReadme",
    "bridgeDatasetInfo", "bridgeFeatures", "bridgeProjectPage",
    "bridgeSampleFinal", "bridgeSampleInitial", "bridgeTrajectoryIndex",
    "liberoBenchmark", "liberoLicense", "liberoReadme", "liberoSourceByteBundle",
    "liberoSourceTree", "liberoTaskMap",
  ]);
  for (const limit of Object.values(PUBLIC_REALITY_SOURCE_BYTE_LIMITS)) {
    assert.equal(Number.isSafeInteger(limit) && limit > 0, true);
  }
});

test("exact official replay creates eighteen receipts and only six claim-scoped HIGH receipts",
  { skip: !officialAvailable }, () => {
    const checked = verifyPublicRealityEvidenceRegistry(registry, input);
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceBytesReplayedThisInvocation, true);
    assert.equal(checked.sourceCount, 2);
    assert.equal(checked.receiptCount, 18);
    assert.equal(checked.highWeightReceiptCount, 6);
    assert.equal(checked.registryHash, registry.registryHash);
    assert.equal(checked.definitionHash, registry.definition.definitionHash);

    assert.equal(registry.schema,
      "outsider/public-reality-evidence-registry/v1");
    assert.equal(registry.sources.length, 2);
    assert.equal(registry.summary.sourceCount, 2);
    assert.equal(registry.summary.receiptCount, 18);
    assert.equal(registry.summary.highWeightReceiptCount, 6);
    assert.equal(registry.sources.reduce((sum, entry) =>
      sum + entry.claimReceipts.length, 0), 18);

    const libero = source(registry, "libero");
    const bridge = source(registry, "bridge");
    assert.deepEqual(registry.sources.map((entry) => entry.sourceId),
      ["bridgedata-v2", "libero-deep"]);
    assert.deepEqual({
      sourceClass: registry.definition.adapters["bridgedata-v2"].sourceClass,
      ceiling: registry.definition.adapters["bridgedata-v2"].realityCeiling,
    }, {
      sourceClass: "REAL_PHYSICAL",
      ceiling:
        "PUBLISHER_SCOPED_HISTORICAL_PHYSICAL_OBSERVATION_NOT_TRAJECTORY_OUTCOME",
    });
    assert.deepEqual({
      sourceClass: registry.definition.adapters["libero-deep"].sourceClass,
      ceiling: registry.definition.adapters["libero-deep"].realityCeiling,
    }, {
      sourceClass: "CONTROLLED_SIMULATION",
      ceiling:
        "EXACT_OFFICIAL_TASK_AND_ARTIFACT_INVENTORY_NOT_DECODED_STATE_OR_EXECUTION",
    });
    assert.deepEqual(libero.claimReceipts.filter((entry) =>
      entry.claimWeight === "HIGH").map((entry) => entry.claimType).sort(),
    ["SOURCE_DEFINED_TASK_UNIVERSE", "SOURCE_FACT", "TAXONOMY"]);
    assert.deepEqual(bridge.claimReceipts.filter((entry) =>
      entry.claimWeight === "HIGH").map((entry) => entry.claimType).sort(),
    ["SOURCE_FACT", "TAXONOMY", "WORLD_PHENOMENON"]);

    for (const entry of registry.sources) {
      assert.equal(entry.claimReceipts.length, 9);
      assert.equal(new Set(entry.claimReceipts.map((item) => item.claimType)).size,
        9);
      for (const item of entry.claimReceipts) {
        assert.match(item.claimBodyHash, HASH);
        assert.match(item.receiptHash, HASH);
        assert.ok(["HIGH", "NONE"].includes(item.claimWeight));
        assert.equal(item.status, item.claimWeight === "HIGH"
          ? "HIGH_WEIGHT_SUPPORT" : "NOT_ESTABLISHED");
        assert.equal(item.highWeightAuthorized, item.claimWeight === "HIGH");
        assert.equal(item.sourceBinding.sourceBytesReplayedThisInvocation, true);
        assert.equal(item.sourceBinding.claimBodyDerivedFromReplayedProjection,
          true);
        assert.equal(item.genericVerification.claimWeight, "NONE");
        assert.equal(item.genericVerification.highWeightAuthorized, false);
        assert.equal(item.crossClaimPromotionAllowed, false);
        assert.equal(item.authority, "none");
      }
    }
  });

test("official projections retain exact, non-fungible denominators and zero target outcomes",
  { skip: !officialAvailable }, () => {
    const libero = source(registry, "libero");
    const bridge = source(registry, "bridge");
    assert.deepEqual({
      taskArtifactRecords: libero.projection.denominator.taskArtifactRecords,
      selectedSourceFiles: libero.projection.denominator.selectedSourceFiles,
      selectedSourceBytes: libero.projection.denominator.selectedSourceBytes,
      bddlDefinitions: libero.projection.denominator.bddlDefinitions,
      prunedInitStateFiles: libero.projection.denominator.prunedInitStateFiles,
      fullInitStateFiles: libero.projection.denominator.fullInitStateFiles,
      manifestOnlyNotRun: libero.projection.denominator.manifestOnlyNotRun,
      noOutcome: libero.projection.denominator.noOutcome,
      executionRecordsPresent:
        libero.projection.denominator.executionRecordsPresent,
    }, {
      taskArtifactRecords: 130,
      selectedSourceFiles: 380,
      selectedSourceBytes: 12_913_625,
      bddlDefinitions: 130,
      prunedInitStateFiles: 130,
      fullInitStateFiles: 120,
      manifestOnlyNotRun: 130,
      noOutcome: 130,
      executionRecordsPresent: 0,
    });
    assert.deepEqual({
      publisher: bridge.projection.coverage.publisherPage.claimedTrajectories,
      tfds: bridge.projection.coverage.tfdsMetadata.totalExamples,
      browser: bridge.projection.coverage.publicTrajectoryBrowserIndex.rows,
      selected: bridge.projection.coverage.replayedObservationSubset
        .selectedTrajectoryRecords,
      frames: bridge.projection.coverage.replayedObservationSubset.cameraFrames,
      actions: bridge.projection.coverage.replayedObservationSubset
        .completeActionTrajectories,
      proprio: bridge.projection.coverage.replayedObservationSubset
        .completeProprioTrajectories,
      discrepancy: bridge.projection.coverage.denominatorReconciliation
        .publisherMinusTfds,
      complete: bridge.projection.coverage.denominatorReconciliation
        .globallyCompleteTrajectoryCensusEstablished,
      outsiderOutcomes: bridge.projection.outcome
        .outsiderOutcomeDenominatorContribution,
    }, {
      publisher: 60_096, tfds: 60_064, browser: 43_592, selected: 1,
      frames: 2, actions: 0, proprio: 0, discrepancy: 32,
      complete: false, outsiderOutcomes: 0,
    });

    for (const entry of [libero, bridge]) {
      for (const claimType of ["OWN_OUTCOME", "OUTSIDER_CAUSAL_EFFECT",
        "TARGET_PRICE", "EXTERNAL_GRANT_DOCUMENT_EVIDENCE"]) {
        const item = receipt(entry, claimType);
        assert.equal(item.claimWeight, "NONE", `${entry.sourceId}/${claimType}`);
        assert.equal(item.highWeightAuthorized, false,
          `${entry.sourceId}/${claimType}`);
      }
    }
    assert.equal(registry.summary.scalarRealityScore, null);
    assert.equal(registry.boundary.scalarScore, null);
    assert.equal(registry.boundary.authority, "none");
    assert.deepEqual(registry.boundary.permits, {
      EXECUTE: false, PRICE: false, GUARANTEE: false, SETTLE: false,
      CLOSE: false,
    });
  });

test("registry retains commitments but no paths, pixels, payloads, or task language",
  { skip: !officialAvailable }, () => {
    const encoded = canonicalizeStrict(registry);
    assert.doesNotMatch(encoded, /\/private\/tmp|\/Users\//u);
    assert.doesNotMatch(encoded,
      /raw\/rss\/toykitchen7|\.bddl|\.pruned_init|contentBase64/u);
    assert.doesNotMatch(encoded,
      /place the red and white mushroom|move the mushroom into the pot/u);
    assert.doesNotMatch(encoded, /pixel-bytes|JFIF/u);
    assert.equal(source(registry, "libero").projection.privacy
      .rawTaskLanguageRetained, false);
    assert.equal(source(registry, "bridge").projection.privacy
      .rawImagesRetainedInProjection, false);
  });

test("one changed official source byte cannot create or verify a registry",
  { skip: !officialAvailable }, () => {
    const altered = cloneInput(input);
    altered.bridgeData.sampleFinalBytes[altered.bridgeData.sampleFinalBytes.length - 1]
      ^= 1;
    assert.throws(() => createPublicRealityEvidenceRegistry(altered),
      /PUBLIC_REALITY_SOURCE_REPLAY_INVALID|REAL_ROBOT_SAMPLEFINAL_PROVENANCE_INVALID/u);
    const checked = verifyPublicRealityEvidenceRegistry(registry, altered);
    assert.equal(checked.ok, false);
    assert.match(checked.error,
      /PUBLIC_REALITY_SOURCE_REPLAY_INVALID|REAL_ROBOT_SAMPLEFINAL_PROVENANCE_INVALID/u);
  });

test("claim, decision, definition, denominator and claim-body tampering fail canonical rebuild even after public rehash",
  { skip: !officialAvailable }, () => {
    const variants = [];
    const alteredClaim = structuredClone(registry);
    source(alteredClaim, "libero").claimReceipts[0].claimType = "TARGET_PRICE";
    variants.push(alteredClaim);

    const alteredDecision = structuredClone(registry);
    source(alteredDecision, "bridge").claimReceipts[0].status =
      "NOT_ESTABLISHED";
    variants.push(alteredDecision);

    const alteredDefinition = structuredClone(registry);
    alteredDefinition.definition.definitionHash = `sha256:${"0".repeat(64)}`;
    variants.push(alteredDefinition);

    const alteredDenominator = structuredClone(registry);
    source(alteredDenominator, "libero").projection.denominator
      .selectedSourceFiles = 381;
    variants.push(alteredDenominator);

    const alteredClaimBody = structuredClone(registry);
    const changedBody = source(alteredClaimBody, "bridge").claimReceipts[0];
    changedBody.claimBody.claimKind = "CLAIM_NOT_ESTABLISHED";
    changedBody.claimBodyHash = hashPublicRealityEvidenceValue("claim-body",
      changedBody.claimBody);
    variants.push(alteredClaimBody);

    for (const variant of variants) {
      rehashRegistry(variant);
      const checked = verifyPublicRealityEvidenceRegistry(variant, input);
      assert.equal(checked.ok, false);
      assert.match(checked.error, /CANONICAL_REPLAY_MISMATCH/u);
    }
  });

test("closed input rejects missing fields, extra fields, and shared memory",
  { skip: !officialAvailable }, () => {
    const missingGroup = { bridgeData: cloneInput(input).bridgeData };
    assert.throws(() => createPublicRealityEvidenceRegistry(missingGroup),
      /PUBLIC_REALITY_INPUT_SHAPE_INVALID/u);

    const extra = cloneInput(input);
    extra.bridgeData.callerPin = Buffer.from("not admitted");
    assert.throws(() => createPublicRealityEvidenceRegistry(extra),
      /PUBLIC_REALITY_BRIDGEDATA_INPUT_SHAPE_INVALID/u);

    const shared = cloneInput(input);
    const expected = shared.bridgeData.codeLicenseBytes;
    const sharedBytes = new Uint8Array(new SharedArrayBuffer(expected.length));
    sharedBytes.set(expected);
    shared.bridgeData.codeLicenseBytes = sharedBytes;
    assert.throws(() => createPublicRealityEvidenceRegistry(shared),
      /PUBLIC_REALITY_SHARED_ARRAY_BUFFER_REJECTED/u);
  });

test("source buffers are cloned and caller mutation cannot rewrite an issued registry",
  { skip: !officialAvailable }, () => {
    const mutable = cloneInput(input);
    const issued = createPublicRealityEvidenceRegistry(mutable);
    const before = canonicalizeStrict(issued);
    mutable.bridgeData.codeLicenseBytes.fill(0);
    mutable.libero.licenseBytes.fill(0);
    assert.equal(canonicalizeStrict(issued), before);
    assert.equal(Object.isFrozen(issued), true);
    assert.equal(Object.isFrozen(issued.sources), true);
  });

test("simulation relabel and trajectory-count laundering fail even with a new registry hash",
  { skip: !officialAvailable }, () => {
    const relabeled = structuredClone(registry);
    source(relabeled, "libero").projection.evidenceRoleWeighting
      .publicSourceClassification = "REAL_PHYSICAL_OBSERVATION_HIGH_WEIGHT";
    rehashRegistry(relabeled);
    assert.match(verifyPublicRealityEvidenceRegistry(relabeled, input).error,
      /CANONICAL_REPLAY_MISMATCH/u);

    const laundered = structuredClone(registry);
    const bridge = source(laundered, "bridge");
    bridge.projection.coverage.replayedObservationSubset
      .completeActionTrajectories = 60_096;
    bridge.projection.coverage.denominatorReconciliation
      .globallyCompleteTrajectoryCensusEstablished = true;
    rehashRegistry(laundered);
    assert.match(verifyPublicRealityEvidenceRegistry(laundered, input).error,
      /CANONICAL_REPLAY_MISMATCH/u);
  });

test("a changed claim body is not replay-compatible with an already-issued receipt",
  { skip: !officialAvailable }, () => {
    const changed = structuredClone(registry);
    const bridge = source(changed, "bridge");
    const item = receipt(bridge, "WORLD_PHENOMENON");
    const original = item.claimBodyHash;
    item.claimBody.causalAttributionEstablished = true;
    item.claimBodyHash = hashPublicRealityEvidenceValue("claim-body",
      item.claimBody);
    assert.notEqual(item.claimBodyHash, original);
    item.genericAssessment = createRealityEvidenceAssessment({
      profile: bridge.profile,
      claimType: item.claimType,
      claimBodyHash: item.claimBodyHash,
    });
    item.genericVerification = verifyRealityEvidenceAssessment(
      item.genericAssessment, { profile: bridge.profile,
        claimBodyHash: item.claimBodyHash });
    assert.equal(item.genericVerification.ok, true);
    rehashReceipt(item);
    rehashSourceEntry(bridge);
    rehashRegistry(changed);
    const checked = verifyPublicRealityEvidenceRegistry(changed, input);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /CANONICAL_REPLAY_MISMATCH/u);
  });

test("official CLI writes a private path-free registry and refuses replacement",
  { skip: !officialAvailable, timeout: 30_000 }, () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(),
      "outsider-public-reality-cli-")));
    temporaryRoots.push(root);
    chmodSync(root, 0o700);
    const output = join(root, "public-reality-registry.json");
    const args = cliArgs(output);
    const first = spawnSync(process.execPath, args, {
      cwd: process.cwd(), encoding: "utf8", timeout: 25_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(first.status, 0, first.stderr);
    const summary = JSON.parse(first.stdout);
    assert.deepEqual({
      outputCreated: summary.outputCreated,
      registryHash: summary.registryHash,
      definitionHash: summary.definitionHash,
      sourceCount: summary.sourceCount,
      receiptCount: summary.receiptCount,
      highWeightReceiptCount: summary.highWeightReceiptCount,
      sourceBytesReplayedThisInvocation:
        summary.sourceBytesReplayedThisInvocation,
      scalarScore: summary.scalarScore,
      authority: summary.authority,
    }, {
      outputCreated: true,
      registryHash: registry.registryHash,
      definitionHash: registry.definition.definitionHash,
      sourceCount: 2,
      receiptCount: 18,
      highWeightReceiptCount: 6,
      sourceBytesReplayedThisInvocation: true,
      scalarScore: null,
      authority: "none",
    });
    assert.doesNotMatch(first.stdout, /\/private\/tmp|\/Users\//u);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const written = readFileSync(output);
    assert.equal(canonicalizeStrict(JSON.parse(written)),
      canonicalizeStrict(registry));
    assert.doesNotMatch(written.toString("utf8"),
      /raw\/rss\/toykitchen7|\.bddl|\.pruned_init|contentBase64/u);
    assert.doesNotMatch(written.toString("utf8"),
      /place the red and white mushroom|move the mushroom into the pot/u);

    const second = spawnSync(process.execPath, args, {
      cwd: process.cwd(), encoding: "utf8", timeout: 25_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /PUBLIC_REALITY_OUTPUT_CREATE_INVALID/u);
    assert.deepEqual(readFileSync(output), written);
  });

test("CLI refuses relative paths before reading source bytes",
  { skip: !officialAvailable, timeout: 10_000 }, () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(),
      "outsider-public-reality-relative-")));
    temporaryRoots.push(root);
    chmodSync(root, 0o700);
    const args = cliArgs(join(root, "must-not-exist.json"));
    args[2] = "relative-project-page.html";
    const result = spawnSync(process.execPath, args, {
      cwd: process.cwd(), encoding: "utf8", timeout: 5_000,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /PUBLIC_REALITY_CLI_PATH_NOT_ABSOLUTE/u);
    assert.equal(existsSync(join(root, "must-not-exist.json")), false);
  });
