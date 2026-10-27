import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, symlinkSync,
  truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  LIBERO_DATASET,
  LIBERO_MAX_DEEP_BUNDLE_BYTES,
  LIBERO_MAX_DEEP_TREE_BYTES,
  LIBERO_MAX_SOURCE_BYTES,
  LIBERO_OFFICIAL_DEEP_PIN,
  LIBERO_OFFICIAL_PIN,
  createLiberoDeepManifestProjection,
  createLiberoManifestProjection,
  verifyLiberoDeepManifestProjection,
  verifyLiberoManifestProjection,
} from "../src/outsider-libero-ingress.js";

const revision = "a".repeat(40);
const sensitive = "Sensitive_Private_Task_48291";
const suites = Object.freeze([
  "libero_spatial", "libero_object", "libero_goal", "libero_10", "libero_90",
]);
const fixtureNames = Object.freeze({
  libero_spatial: sensitive,
  libero_object: "Fixture_Object_Task",
  libero_goal: "Fixture_Goal_Task",
  libero_10: "Fixture_Ten_Task",
  libero_90: "Fixture_Ninety_Task",
});
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const gitHash = (value) => createHash("sha1")
  .update(Buffer.from(`blob ${value.length}\0`)).update(value).digest("hex");

function taskMapBytes({ duplicate = false, extraLine = false } = {}) {
  const names = Object.fromEntries(suites.map((suite) => [suite,
    [duplicate && suite === "libero_object" ? sensitive : fixtureNames[suite]]]));
  return Buffer.from([
    "libero_task_map = {",
    ...suites.flatMap((suite) => [
      `    "${suite}": [`,
      ...names[suite].map((name) => `        "${name}",`),
      "    ],",
    ]),
    ...(extraLine ? ["    unreviewed = private"] : []),
    "}",
    "",
  ].join("\n"));
}

function benchmarkBytes() {
  return Buffer.from([
    "libero_suites = [",
    ...suites.map((suite) => `    "${suite}",`),
    "]",
    "task_maps = {}",
    "task_orders = [",
    "    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],",
    "]",
    "",
    "",
    "class Benchmark:",
    "    pass",
    "",
    "@register_benchmark",
    "class LIBERO_SPATIAL(Benchmark):",
    "    pass",
    "@register_benchmark",
    "class LIBERO_OBJECT(Benchmark):",
    "    pass",
    "@register_benchmark",
    "class LIBERO_GOAL(Benchmark):",
    "    pass",
    "@register_benchmark",
    "class LIBERO_90(Benchmark):",
    "    self.name = \"libero_90\"",
    "@register_benchmark",
    "class LIBERO_10(Benchmark):",
    "    self.name = \"libero_10\"",
    "@register_benchmark",
    "class LIBERO_100(Benchmark):",
    "    self.name = \"libero_100\"",
    "",
  ].join("\n"));
}

function readmeBytes() {
  return Buffer.from([
    "LIBERO provides 130 tasks grouped into four task suites.",
    "**LIBERO-100** consists of 100 manipulation tasks.",
    "**LIBERO-90** for pretraining and **LIBERO-10** for testing.",
    "| Component | License |",
    "| --- | --- |",
    "| Codebase | [MIT License](LICENSE) |",
    "| Datasets | [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/legalcode) |",
    "",
  ].join("\n"));
}

function licenseBytes() {
  return Buffer.from("MIT License\n\nCopyright (c) 2023 Lifelong Robot Learning\n");
}

function fixture({ taskMap = taskMapBytes(), benchmark = benchmarkBytes(),
  readme = readmeBytes(), license = licenseBytes(), revisionValue = revision } = {}) {
  const inputs = { taskMapBytes: taskMap, benchmarkBytes: benchmark,
    readmeBytes: readme, licenseBytes: license };
  const file = (role, path, bytes) => ({ role, path,
    url: `https://example.invalid/private/${path}`, sha256: hash(bytes),
    bytes: bytes.length });
  const body = {
    schema: "outsider/libero-source-pin/v1",
    scope: "TEST_FIXTURE_ONLY",
    datasetId: "outsider/libero-test-fixture",
    repositoryUrl: "https://example.invalid/private-repository",
    revision: revisionValue,
    revisionUrl: `https://example.invalid/private-revision/${revisionValue}`,
    resolvedFromRef: "refs/heads/master",
    releaseTagEstablished: false,
    files: {
      taskMap: file("TASK_SUITE_MAP", "private-task-map.py", taskMap),
      benchmark: file("BENCHMARK_REGISTRY", "private-benchmark.py", benchmark),
      readme: file("PROJECT_AND_DATASET_LICENSE_DECLARATION", "private-readme.md", readme),
      license: file("CODE_LICENSE_TEXT", "private-license.txt", license),
    },
    codeLicenseSpdx: "MIT",
    demonstrationDatasetLicenseSpdx: "CC-BY-4.0",
    licenseScope: "PINNED_REPOSITORY_TEXT_AND_TASK_SUITE_MANIFEST_ONLY",
    expectedCoverage: {
      sourceSuitePartitions: 5,
      conceptualOfficialSuites: 4,
      sourceTaskEntries: 5,
      uniqueTaskNames: 5,
      libero100UnionEntries: 2,
      registeredBenchmarkClasses: 6,
      tenTaskSuiteOrders: 1,
      suiteCounts: Object.fromEntries(suites.map((suite) => [suite, 1])),
    },
    allowedSuites: [...suites],
  };
  const pin = { ...body, pinHash: hash(canonicalizeStrict(body)) };
  return { ...inputs, pin, source: { datasetId: pin.datasetId,
    revision: revisionValue } };
}

function deepFixture() {
  const value = fixture();
  const files = [];
  const suiteArtifacts = {};
  for (const [suiteOrdinal, suite] of suites.entries()) {
    const task = fixtureNames[suite];
    const bddl = Buffer.from([
      "(define (problem Fixture)",
      "  (:domain robosuite)",
      `  (:language ${task})`,
      ")",
      "",
    ].join("\n"));
    const pruned = Buffer.from([0x80, 0x04, suiteOrdinal, 0x2e]);
    const full = suite === "libero_goal" ? null
      : Buffer.from([0x80, 0x04, suiteOrdinal, 0x00, 0x2e]);
    const artifacts = [
      [`libero/libero/bddl_files/${suite}/${task}.bddl`, bddl],
      [`libero/libero/init_files/${suite}/${task}.pruned_init`, pruned],
      ...(full ? [[`libero/libero/init_files/${suite}/${task}.init`, full]] : []),
    ];
    for (const [path, content] of artifacts) files.push({ path, content });
    suiteArtifacts[suite] = {
      tasks: 1,
      bddlDefinitions: 1,
      bddlBytes: bddl.length,
      prunedInitStateFiles: 1,
      prunedInitStateBytes: pruned.length,
      fullInitStateFiles: full ? 1 : 0,
      fullInitStateBytes: full?.length ?? 0,
    };
  }
  const treeEntries = [
    ...suites.map((suite) => {
      const path = `libero/libero/bddl_files/${suite}/tasks_info.txt`;
      const content = Buffer.from(`${fixtureNames[suite]}.bddl\n`);
      return { path, mode: "100644", type: "blob", sha: gitHash(content),
        size: content.length, url: `https://example.invalid/blob/${gitHash(content)}` };
    }),
    ...files.map(({ path, content }) => ({ path, mode: "100644", type: "blob",
      sha: gitHash(content), size: content.length,
      url: `https://example.invalid/blob/${gitHash(content)}` })),
  ];
  const requestUrl = `https://example.invalid/tree/${revision}?recursive=1`;
  const treeValue = { sha: revision, url: requestUrl.replace("?recursive=1", ""),
    tree: treeEntries, truncated: false };
  const sourceTreeBytes = Buffer.from(`${JSON.stringify(treeValue)}\n`);
  const bundleValue = {
    schema: "outsider/libero-deep-byte-bundle/v1",
    revision,
    files: [...files].sort((left, right) => left.path.localeCompare(right.path))
      .map(({ path, content }) => ({ path, contentBase64: content.toString("base64") })),
  };
  const sourceByteBundleBytes = Buffer.from(`${JSON.stringify(bundleValue)}\n`);
  const sum = (key) => suites.reduce((total, suite) =>
    total + suiteArtifacts[suite][key], 0);
  const expectedCoverage = {
    repositoryTreeEntries: treeEntries.length,
    sourceNamespaceBlobEntries: treeEntries.length,
    selectedSourceFiles: files.length,
    selectedSourceBytes: files.reduce((total, file) => total + file.content.length, 0),
    bddlDefinitions: sum("bddlDefinitions"),
    bddlBytes: sum("bddlBytes"),
    prunedInitStateFiles: sum("prunedInitStateFiles"),
    prunedInitStateBytes: sum("prunedInitStateBytes"),
    fullInitStateFiles: sum("fullInitStateFiles"),
    fullInitStateBytes: sum("fullInitStateBytes"),
    unselectedTaskIndexFiles: suites.length,
    suiteArtifacts,
  };
  const body = {
    schema: "outsider/libero-deep-source-pin/v1",
    scope: "TEST_FIXTURE_ONLY",
    basePinHash: value.pin.pinHash,
    revision,
    treeSource: { role: "IMMUTABLE_COMMIT_RECURSIVE_TREE", url: requestUrl,
      sha256: hash(sourceTreeBytes), bytes: sourceTreeBytes.length },
    replayBundle: { schema: "outsider/libero-deep-byte-bundle/v1",
      sha256: hash(sourceByteBundleBytes), bytes: sourceByteBundleBytes.length },
    sourceSelection: { bddlPrefix: "libero/libero/bddl_files",
      initStatePrefix: "libero/libero/init_files",
      selectedExtensions: [".bddl", ".pruned_init", ".init"],
      unselectedIndexBasename: "tasks_info.txt" },
    expectedCoverage,
    licenseBoundary:
      "PINNED_DECLARATIONS_REPLAYED_DEEP_FILES_NOT_REDISTRIBUTED_SCOPE_REQUIRES_REVIEW",
  };
  const deepPin = { ...body, pinHash: hash(canonicalizeStrict(body)) };
  return { ...value, sourceTreeBytes, sourceByteBundleBytes, deepPin,
    treeValue, bundleValue };
}

test("LIBERO manifest admission keeps every task NOT_RUN and removes raw task material", () => {
  const value = fixture();
  const projection = createLiberoManifestProjection({ ...value,
    trustedPin: value.pin });
  assert.equal(projection.authority.admission, "TEST_FIXTURE_ONLY");
  assert.equal(projection.authority.sourcePinAuthority,
    "CALLER_SUPPLIED_TEST_FIXTURE_PIN");
  assert.equal(projection.authority.exactOfficialSourceIntegrityEstablishedByTrustedPinAndReplay,
    false);
  assert.equal(projection.authority.fixtureBytesMatchedCallerSuppliedPin, true);
  assert.equal(projection.license.status, "CALLER_ASSERTED_TEST_FIXTURE_ONLY");
  assert.equal(projection.license.evidenceAuthority,
    "CALLER_SUPPLIED_TEST_FIXTURE_PIN");
  assert.equal(projection.license.exactOfficialLicenseTextHashVerified, false);
  assert.equal(projection.license.fixtureLicenseAndReadmeBytesMatchedCallerSuppliedPin,
    true);
  assert.equal(projection.denominator.sourceTaskEntries, 5);
  assert.equal(projection.denominator.uniqueTaskIds, 5);
  assert.equal(projection.denominator.manifestOnlyNotRun, 5);
  assert.equal(projection.denominator.noOutcome, 5);
  assert.equal(projection.denominator.omittedSourceTasks, 0);
  assert.deepEqual(projection.denominator.suiteDenominators,
    suites.map((suite) => ({ suite, sourceTaskEntries: 1,
      manifestOnlyNotRun: 1, noOutcome: 1 })));
  assert.equal(projection.denominator.libero100DerivedUnion.sourceTaskEntries, 2);
  assert.equal(projection.denominator.libero100DerivedUnion.countedAgainInGlobalDenominator,
    false);
  assert.equal(projection.executionEvidence.classification, "NOT_RUN");
  assert.equal(projection.executionEvidence.outcome, "NO_OUTCOME");
  assert.equal(projection.executionEvidence.missingOutcome, 5);
  assert.equal(projection.manifests.taskRecords.length, 5);
  for (const record of projection.manifests.taskRecords) {
    assert.match(record.taskIdHash, /^sha256:[a-f0-9]{64}$/u);
    assert.match(record.taskManifestHash, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(record.executionClassification, "NOT_RUN");
    assert.equal(record.outcome, "NO_OUTCOME");
  }
  assert.equal(projection.observability.targetIdentityObserved, false);
  assert.equal(projection.observability.workspaceBoundaryObserved, false);
  assert.equal(projection.observability.forceObserved, false);
  assert.equal(projection.observability.energyObserved, false);
  const encoded = JSON.stringify(projection);
  for (const secret of [sensitive, "private-task-map.py", "private-benchmark.py",
    "private-repository", "example.invalid/private", `${sensitive}.bddl`,
    `${sensitive}.pruned_init`, `${sensitive}_demo.hdf5`]) {
    assert.doesNotMatch(encoded, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g,
      "\\$&"), "iu"));
  }
  assert.deepEqual(verifyLiberoManifestProjection(projection, { ...value,
    trustedPin: value.pin }), {
    ok: true,
    projectionHash: projection.projectionHash,
    sourceBytesReplayed: true,
    admission: "TEST_FIXTURE_ONLY",
    sourceTaskEntries: 5,
    executionClassification: "NOT_RUN",
    outcome: "NO_OUTCOME",
  });
});

test("verification requires all pinned bytes and rejects forged execution outcomes", () => {
  const value = fixture();
  const projection = createLiberoManifestProjection({ ...value,
    trustedPin: value.pin });
  assert.deepEqual(verifyLiberoManifestProjection(projection), {
    ok: false, error: "LIBERO_SOURCE_BYTES_REQUIRED",
  });
  const forged = structuredClone(projection);
  forged.executionEvidence.classification = "COMPLETED";
  forged.executionEvidence.outcome = "PASS";
  forged.executionEvidence.recordsPresent = 5;
  forged.executionEvidence.attempted = 5;
  forged.executionEvidence.completed = 5;
  forged.executionEvidence.pass = 5;
  forged.executionEvidence.missingOutcome = 0;
  const { projectionHash: _old, ...body } = forged;
  forged.projectionHash = hash(canonicalizeStrict(body));
  assert.deepEqual(verifyLiberoManifestProjection(forged, { ...value,
    trustedPin: value.pin }), {
    ok: false, error: "LIBERO_PROJECTION_REPLAY_INVALID",
  });
});

test("task duplication, unknown syntax, drifted license and source mutation fail closed", () => {
  const duplicate = fixture({ taskMap: taskMapBytes({ duplicate: true }) });
  assert.throws(() => createLiberoManifestProjection({ ...duplicate,
    trustedPin: duplicate.pin }), /TASK_MAP_GLOBAL_COVERAGE_INVALID/);

  const extra = fixture({ taskMap: taskMapBytes({ extraLine: true }) });
  assert.throws(() => createLiberoManifestProjection({ ...extra,
    trustedPin: extra.pin }), /TASK_MAP_LINE_INVALID/);

  const driftedLicense = Buffer.from("MIT License\nprivate replacement\n");
  const licenseValue = fixture({ license: driftedLicense });
  assert.throws(() => createLiberoManifestProjection({ ...licenseValue,
    trustedPin: licenseValue.pin }), /LICENSE_OR_COVERAGE_EVIDENCE_INVALID/);

  const value = fixture();
  const mutated = Buffer.concat([value.taskMapBytes, Buffer.from("# mutation\n")]);
  assert.throws(() => createLiberoManifestProjection({ ...value,
    taskMapBytes: mutated, trustedPin: value.pin }), /TASKMAP_PROVENANCE_INVALID/);
});

test("floating revision and oversized source are rejected before admission", () => {
  const floating = fixture({ revisionValue: "master" });
  assert.throws(() => createLiberoManifestProjection({ ...floating,
    trustedPin: floating.pin }), /SOURCE_PIN_INVALID/);
  const value = fixture();
  assert.throws(() => createLiberoManifestProjection({ ...value,
    taskMapBytes: Buffer.alloc(LIBERO_MAX_SOURCE_BYTES + 1), trustedPin: value.pin }),
  /TASK_MAP_SIZE_INVALID/);
});

test("built-in pin binds the official immutable commit, licenses, files and denominator", () => {
  assert.equal(LIBERO_DATASET, "Lifelong-Robot-Learning/LIBERO/task-suites");
  assert.equal(LIBERO_OFFICIAL_PIN.revision,
    "8f1084e3132a39270c3a13ebe37270a43ece2a01");
  assert.equal(LIBERO_OFFICIAL_PIN.releaseTagEstablished, false);
  assert.equal(LIBERO_OFFICIAL_PIN.codeLicenseSpdx, "MIT");
  assert.equal(LIBERO_OFFICIAL_PIN.demonstrationDatasetLicenseSpdx, "CC-BY-4.0");
  assert.equal(LIBERO_OFFICIAL_PIN.expectedCoverage.sourceTaskEntries, 130);
  assert.equal(LIBERO_OFFICIAL_PIN.expectedCoverage.uniqueTaskNames, 130);
  assert.equal(LIBERO_OFFICIAL_PIN.expectedCoverage.libero100UnionEntries, 100);
  assert.deepEqual(LIBERO_OFFICIAL_PIN.expectedCoverage.suiteCounts, {
    libero_spatial: 10, libero_object: 10, libero_goal: 10,
    libero_10: 10, libero_90: 90,
  });
  assert.equal(LIBERO_OFFICIAL_PIN.files.taskMap.sha256,
    "sha256:0c950df0a785aa55de968bb38ccd865d2017f71ddbe6f48cfd05ac0742b6d62d");
  assert.equal(LIBERO_OFFICIAL_PIN.files.license.sha256,
    "sha256:e2885fd30a08381b799c4a33385522b23d637b4051b8f9a7f9f2519944b68ff6");
  assert.match(LIBERO_OFFICIAL_PIN.pinHash, /^sha256:[a-f0-9]{64}$/u);
});

test("deep ingress gives real public simulator task/state schema high role-bound weight", () => {
  const value = deepFixture();
  const projection = createLiberoDeepManifestProjection({ ...value,
    trustedPin: value.pin, trustedDeepPin: value.deepPin });
  assert.equal(projection.evidenceRoleWeighting.classification,
    "REAL_PUBLIC_SIMULATOR_SOURCE_HIGH_WEIGHT_FOR_TASK/STATE_SCHEMA");
  assert.equal(projection.evidenceRoleWeighting.taskDefinitionSchemaWeight, "HIGH");
  assert.equal(projection.evidenceRoleWeighting.initialStateArtifactSchemaWeight,
    "HIGH");
  assert.equal(projection.evidenceRoleWeighting.physicalWorldObservationWeight,
    "NONE");
  assert.equal(projection.evidenceRoleWeighting.outsiderExecutionOutcomeWeight,
    "NONE");
  assert.equal(projection.evidenceRoleWeighting.outsiderCausalExperienceWeight,
    "NONE");
  assert.equal(projection.evidenceRoleWeighting.crossRoleWeightTransferAllowed,
    false);
  assert.equal(projection.authority.initStatePayloadDeserialized, false);
  assert.equal(projection.authority.untrustedPickleExecutionPerformed, false);
  assert.equal(projection.authority.benchmarkWasRun, false);
  assert.equal(projection.denominator.taskArtifactRecords, 5);
  assert.equal(projection.denominator.bddlDefinitions, 5);
  assert.equal(projection.denominator.prunedInitStateFiles, 5);
  assert.equal(projection.denominator.fullInitStateFiles, 4);
  assert.equal(projection.denominator.selectedSourceFiles, 14);
  assert.equal(projection.denominator.sourceNamespaceBlobEntries, 19);
  assert.equal(projection.denominator.unselectedTaskIndexFiles, 5);
  assert.equal(projection.denominator.omittedSelectedSourceFiles, 0);
  assert.equal(projection.denominator.manifestOnlyNotRun, 5);
  assert.equal(projection.executionEvidence.classification, "NOT_RUN");
  assert.equal(projection.executionEvidence.outcome, "NO_OUTCOME");
  assert.equal(projection.manifests.taskRecords.length, 5);
  for (const record of projection.manifests.taskRecords) {
    assert.match(record.bddl.sha256, /^sha256:[a-f0-9]{64}$/u);
    assert.match(record.bddl.gitBlobSha1, /^[a-f0-9]{40}$/u);
    assert.match(record.prunedInitState.sha256, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(record.executionClassification, "NOT_RUN");
    assert.equal(record.outcome, "NO_OUTCOME");
  }
  const encoded = JSON.stringify(projection);
  for (const secret of [sensitive, ...Object.values(fixtureNames),
    "libero/libero/bddl_files", "libero/libero/init_files",
    value.bundleValue.files[0].contentBase64, "(:language"]) {
    assert.doesNotMatch(encoded, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g,
      "\\$&"), "u"));
  }
  assert.deepEqual(verifyLiberoDeepManifestProjection(projection, { ...value,
    trustedPin: value.pin, trustedDeepPin: value.deepPin }), {
    ok: true,
    projectionHash: projection.projectionHash,
    sourceBytesReplayed: true,
    admission: "TEST_FIXTURE_ONLY",
    taskArtifactRecords: 5,
    selectedSourceFiles: 14,
    selectedSourceBytes: projection.denominator.selectedSourceBytes,
    executionClassification: "NOT_RUN",
    outcome: "NO_OUTCOME",
  });
});

test("deep replay rejects byte tamper, omission and forged outcomes", () => {
  const value = deepFixture();
  const repin = (bundleValue) => {
    const sourceByteBundleBytes = Buffer.from(`${JSON.stringify(bundleValue)}\n`);
    const { pinHash: _old, ...body } = value.deepPin;
    body.replayBundle = { ...body.replayBundle,
      sha256: hash(sourceByteBundleBytes), bytes: sourceByteBundleBytes.length };
    return { sourceByteBundleBytes,
      deepPin: { ...body, pinHash: hash(canonicalizeStrict(body)) } };
  };
  const tampered = structuredClone(value.bundleValue);
  tampered.files[0].contentBase64 = Buffer.from("tampered official bytes")
    .toString("base64");
  const tamperedReplay = repin(tampered);
  assert.throws(() => createLiberoDeepManifestProjection({ ...value,
    ...tamperedReplay, trustedPin: value.pin,
    trustedDeepPin: tamperedReplay.deepPin }), /BUNDLE_GIT_BLOB_INVALID/);

  const omitted = structuredClone(value.bundleValue);
  omitted.files.pop();
  const omittedReplay = repin(omitted);
  assert.throws(() => createLiberoDeepManifestProjection({ ...value,
    ...omittedReplay, trustedPin: value.pin,
    trustedDeepPin: omittedReplay.deepPin }), /BUNDLE_SHAPE_INVALID/);

  const projection = createLiberoDeepManifestProjection({ ...value,
    trustedPin: value.pin, trustedDeepPin: value.deepPin });
  assert.deepEqual(verifyLiberoDeepManifestProjection(projection), {
    ok: false, error: "LIBERO_DEEP_SOURCE_BYTES_REQUIRED",
  });
  const forged = structuredClone(projection);
  forged.executionEvidence.classification = "COMPLETED";
  forged.executionEvidence.outcome = "PASS";
  forged.executionEvidence.recordsPresent = 5;
  forged.executionEvidence.attempted = 5;
  forged.executionEvidence.completed = 5;
  forged.executionEvidence.pass = 5;
  forged.executionEvidence.missingOutcome = 0;
  const { projectionHash: _old, ...body } = forged;
  forged.projectionHash = hash(canonicalizeStrict(body));
  assert.deepEqual(verifyLiberoDeepManifestProjection(forged, { ...value,
    trustedPin: value.pin, trustedDeepPin: value.deepPin }), {
    ok: false, error: "LIBERO_DEEP_PROJECTION_REPLAY_INVALID",
  });
});

test("official deep pin freezes the full BDDL/init artifact denominator", () => {
  assert.equal(LIBERO_MAX_DEEP_TREE_BYTES, 1024 * 1024);
  assert.equal(LIBERO_MAX_DEEP_BUNDLE_BYTES, 24 * 1024 * 1024);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.revision, LIBERO_OFFICIAL_PIN.revision);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.repositoryTreeEntries,
    1_367);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.sourceNamespaceBlobEntries,
    385);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.selectedSourceFiles, 380);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.selectedSourceBytes,
    12_913_625);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.bddlDefinitions, 130);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.prunedInitStateFiles, 130);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.fullInitStateFiles, 120);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.expectedCoverage.unselectedTaskIndexFiles, 5);
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.treeSource.sha256,
    "sha256:4032eccaf6b2ce2cfc231d917f15a2eba13f6274c57cf24e1100427939ca9c32");
  assert.equal(LIBERO_OFFICIAL_DEEP_PIN.replayBundle.sha256,
    "sha256:acb6f627ffd6d93ff253cc661359d7f6ec04afffd86d9905f84bb8bc33b9a295");
  assert.match(LIBERO_OFFICIAL_DEEP_PIN.pinHash, /^sha256:[a-f0-9]{64}$/u);
});

test("CLI refuses symlink and oversized input; official replay is O_EXCL mode 0600", () => {
  const value = fixture();
  const dir = mkdtempSync(join(tmpdir(), "outsider-libero-cli-"));
  const taskMap = join(dir, "task-map.py");
  const taskMapLink = join(dir, "task-map-link.py");
  const benchmark = join(dir, "benchmark.py");
  const readme = join(dir, "README.md");
  const license = join(dir, "LICENSE");
  const output = join(dir, "projection.json");
  writeFileSync(taskMap, value.taskMapBytes, { mode: 0o600 });
  writeFileSync(benchmark, value.benchmarkBytes, { mode: 0o600 });
  writeFileSync(readme, value.readmeBytes, { mode: 0o600 });
  writeFileSync(license, value.licenseBytes, { mode: 0o600 });
  symlinkSync(taskMap, taskMapLink);
  const args = ["tools/outsider-ingest-libero.mjs",
    "--task-map-input", taskMapLink, "--benchmark-input", benchmark,
    "--readme-input", readme, "--license-input", license,
    "--revision", LIBERO_OFFICIAL_PIN.revision, "--output", output];
  const refused = spawnSync(process.execPath, args, { cwd: process.cwd(),
    encoding: "utf8" });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /LIBERO_TASK_MAP_INPUT_FILE_INVALID/);

  const oversized = join(dir, "oversized.py");
  writeFileSync(oversized, "x", { mode: 0o600 });
  truncateSync(oversized, LIBERO_MAX_SOURCE_BYTES + 1);
  args[2] = oversized;
  const refusedOversized = spawnSync(process.execPath, args, { cwd: process.cwd(),
    encoding: "utf8" });
  assert.equal(refusedOversized.status, 2);
  assert.match(refusedOversized.stderr, /LIBERO_TASK_MAP_INPUT_FILE_INVALID/);

  const officialRoot = process.env.OUTSIDER_LIBERO_OFFICIAL_SOURCE;
  if (!officialRoot) return;
  const official = {
    taskMap: join(officialRoot, "libero_suite_task_map.py"),
    benchmark: join(officialRoot, "benchmark_init.py"),
    readme: join(officialRoot, "README.md"),
    license: join(officialRoot, "LICENSE"),
  };
  for (const path of Object.values(official)) chmodSync(path, 0o600);
  args[2] = official.taskMap;
  args[4] = official.benchmark;
  args[6] = official.readme;
  args[8] = official.license;
  const stdout = execFileSync(process.execPath, args, { cwd: process.cwd(),
    encoding: "utf8" });
  assert.equal(lstatSync(output).mode & 0o777, 0o600);
  assert.doesNotMatch(stdout, new RegExp(officialRoot, "u"));
  assert.doesNotMatch(stdout, new RegExp(output, "u"));
  const projection = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(projection.authority.admission, "ADMITTED_MANIFEST_ONLY");
  assert.equal(projection.license.status,
    "ESTABLISHED_FOR_PINNED_MANIFEST_INPUTS");
  assert.equal(projection.license.exactOfficialLicenseTextHashVerified, true);
  assert.equal(projection.denominator.sourceTaskEntries, 130);
  assert.equal(projection.denominator.manifestOnlyNotRun, 130);
  assert.equal(projection.executionEvidence.outcome, "NO_OUTCOME");
  const original = readFileSync(output);
  const refusedOverwrite = spawnSync(process.execPath, args, { cwd: process.cwd(),
    encoding: "utf8" });
  assert.equal(refusedOverwrite.status, 2);
  assert.match(refusedOverwrite.stderr, /LIBERO_OUTPUT_CREATE_INVALID/);
  assert.deepEqual(readFileSync(output), original);
});

test("deep CLI performs official byte replay with private no-clobber output", () => {
  const officialRoot = process.env.OUTSIDER_LIBERO_OFFICIAL_SOURCE;
  const deepRoot = process.env.OUTSIDER_LIBERO_DEEP_OFFICIAL_SOURCE;
  if (!officialRoot || !deepRoot) return;
  const dir = mkdtempSync(join(tmpdir(), "outsider-libero-deep-cli-"));
  const output = join(dir, "deep-projection.json");
  const tree = join(deepRoot, "source-tree.json");
  const treeLink = join(dir, "source-tree-link.json");
  const bundle = join(deepRoot, "source-byte-bundle.json");
  const args = ["tools/outsider-ingest-libero.mjs",
    "--task-map-input", join(officialRoot, "libero_suite_task_map.py"),
    "--benchmark-input", join(officialRoot, "benchmark_init.py"),
    "--readme-input", join(officialRoot, "README.md"),
    "--license-input", join(officialRoot, "LICENSE"),
    "--revision", LIBERO_OFFICIAL_PIN.revision,
    "--source-tree-input", tree,
    "--source-byte-bundle-input", bundle,
    "--output", output];
  for (const path of [args[2], args[4], args[6], args[8], tree, bundle]) {
    chmodSync(path, 0o600);
  }
  symlinkSync(tree, treeLink);
  args[12] = treeLink;
  const refusedLink = spawnSync(process.execPath, args, { cwd: process.cwd(),
    encoding: "utf8" });
  assert.equal(refusedLink.status, 2);
  assert.match(refusedLink.stderr, /LIBERO_DEEP_TREE_INPUT_FILE_INVALID/);

  args[12] = tree;
  const stdout = execFileSync(process.execPath, args, { cwd: process.cwd(),
    encoding: "utf8" });
  const summary = JSON.parse(stdout);
  assert.equal(summary.artifactClass,
    "REAL_PUBLIC_SIMULATOR_SOURCE_HIGH_WEIGHT_FOR_TASK/STATE_SCHEMA");
  assert.equal(summary.taskArtifactRecords, 130);
  assert.equal(summary.selectedSourceFiles, 380);
  assert.equal(summary.selectedSourceBytes, 12_913_625);
  assert.equal(summary.executionClassification, "NOT_RUN");
  assert.equal(summary.outcome, "NO_OUTCOME");
  assert.equal(lstatSync(output).mode & 0o777, 0o600);
  assert.doesNotMatch(stdout, /\/private\/tmp/u);
  const projectionText = readFileSync(output, "utf8");
  const projection = JSON.parse(projectionText);
  assert.equal(projection.authority.admission,
    "ADMITTED_TASK_AND_STATE_SCHEMA_ONLY");
  assert.equal(projection.denominator.bddlDefinitions, 130);
  assert.equal(projection.denominator.prunedInitStateFiles, 130);
  assert.equal(projection.denominator.fullInitStateFiles, 120);
  assert.equal(projection.denominator.omittedSelectedSourceFiles, 0);
  assert.equal(projection.authority.benchmarkWasRun, false);
  assert.equal(projection.authority.initStatePayloadDeserialized, false);
  assert.equal(projection.executionEvidence.outcome, "NO_OUTCOME");
  for (const secret of ["KITCHEN_SCENE3_turn_on_the_stove",
    "libero/libero/bddl_files", "libero/libero/init_files", "/private/tmp",
    officialRoot, deepRoot]) {
    assert.doesNotMatch(projectionText, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g,
      "\\$&"), "u"));
  }
  const original = readFileSync(output);
  const refusedOverwrite = spawnSync(process.execPath, args, { cwd: process.cwd(),
    encoding: "utf8" });
  assert.equal(refusedOverwrite.status, 2);
  assert.match(refusedOverwrite.stderr, /LIBERO_OUTPUT_CREATE_INVALID/);
  assert.deepEqual(readFileSync(output), original);
});
