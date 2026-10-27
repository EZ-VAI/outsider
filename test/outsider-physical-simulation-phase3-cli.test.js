import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { createLiberoManifestProjection } from "../src/outsider-libero-ingress.js";
import {
  PHYSICAL_SIMULATION_PHASE3_ARTIFACT_CLASS,
  PHYSICAL_SIMULATION_PHASE3_TEST_ARTIFACT_CLASS,
} from "../src/outsider-physical-simulation-phase3.js";

const tool = fileURLToPath(new URL(
  "../tools/outsider-physical-simulation-phase3.mjs", import.meta.url));
const suites = [
  "libero_spatial", "libero_object", "libero_goal", "libero_10", "libero_90",
];
const counts = { libero_spatial: 10, libero_object: 10, libero_goal: 10,
  libero_10: 10, libero_90: 90 };
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function publicShapeTestFixture() {
  const taskMapBytes = Buffer.from([
    "libero_task_map = {",
    ...suites.flatMap((suite) => [
      `    "${suite}": [`,
      ...Array.from({ length: counts[suite] }, (_, index) =>
        `        "${suite.replaceAll("_", "")}Task${String(index).padStart(3, "0")}",`),
      "    ],",
    ]),
    "}", "",
  ].join("\n"));
  const benchmarkBytes = Buffer.from([
    "libero_suites = [", ...suites.map((suite) => `    "${suite}",`),
    "]", "task_maps = {}", "task_orders = [",
    "    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],", "]", "", "",
    "class Benchmark:", "    pass", "",
    "@register_benchmark", "class LIBERO_SPATIAL(Benchmark):", "    pass",
    "@register_benchmark", "class LIBERO_OBJECT(Benchmark):", "    pass",
    "@register_benchmark", "class LIBERO_GOAL(Benchmark):", "    pass",
    "@register_benchmark", "class LIBERO_90(Benchmark):",
    "    self.name = \"libero_90\"",
    "@register_benchmark", "class LIBERO_10(Benchmark):",
    "    self.name = \"libero_10\"",
    "@register_benchmark", "class LIBERO_100(Benchmark):",
    "    self.name = \"libero_100\"", "",
  ].join("\n"));
  const readmeBytes = Buffer.from([
    "LIBERO provides 130 tasks grouped into four task suites.",
    "**LIBERO-100** consists of 100 manipulation tasks.",
    "**LIBERO-90** for pretraining and **LIBERO-10** for testing.",
    "| Codebase | [MIT License](LICENSE) |",
    "| Datasets | [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/legalcode) |",
    "",
  ].join("\n"));
  const licenseBytes = Buffer.from(
    "MIT License\n\nCopyright (c) 2023 Lifelong Robot Learning\n");
  const bytes = { taskMapBytes, benchmarkBytes, readmeBytes, licenseBytes };
  const revision = "c".repeat(40);
  const file = (role, path, value) => ({ role, path,
    url: `https://cli-fixture.invalid/${path}`, sha256: hash(value),
    bytes: value.length });
  const body = {
    schema: "outsider/libero-source-pin/v1",
    scope: "TEST_FIXTURE_ONLY",
    datasetId: "outsider/phase3-cli-test-fixture",
    repositoryUrl: "https://cli-fixture.invalid/repository",
    revision,
    revisionUrl: `https://cli-fixture.invalid/revision/${revision}`,
    resolvedFromRef: "refs/heads/master",
    releaseTagEstablished: false,
    files: {
      taskMap: file("TASK_SUITE_MAP", "task-map.py", taskMapBytes),
      benchmark: file("BENCHMARK_REGISTRY", "benchmark.py", benchmarkBytes),
      readme: file("PROJECT_AND_DATASET_LICENSE_DECLARATION", "README.md",
        readmeBytes),
      license: file("CODE_LICENSE_TEXT", "LICENSE", licenseBytes),
    },
    codeLicenseSpdx: "MIT",
    demonstrationDatasetLicenseSpdx: "CC-BY-4.0",
    licenseScope: "PINNED_REPOSITORY_TEXT_AND_TASK_SUITE_MANIFEST_ONLY",
    expectedCoverage: {
      sourceSuitePartitions: 5,
      conceptualOfficialSuites: 4,
      sourceTaskEntries: 130,
      uniqueTaskNames: 130,
      libero100UnionEntries: 100,
      registeredBenchmarkClasses: 6,
      tenTaskSuiteOrders: 1,
      suiteCounts: { ...counts },
    },
    allowedSuites: [...suites],
  };
  const trustedPin = { ...body, pinHash: hash(canonicalizeStrict(body)) };
  const source = { datasetId: trustedPin.datasetId, revision };
  const projection = createLiberoManifestProjection({ ...bytes, source, trustedPin });
  return { ...bytes, trustedPin, projection };
}

function writeInputs(root, fixture) {
  const paths = {
    projection: join(root, "projection.json"),
    taskMap: join(root, "task-map.py"),
    benchmark: join(root, "benchmark.py"),
    readme: join(root, "README.md"),
    license: join(root, "LICENSE"),
    trustedPin: join(root, "trusted-pin.json"),
  };
  for (const [path, value] of [
    [paths.projection, canonicalizeStrict(fixture.projection)],
    [paths.taskMap, fixture.taskMapBytes],
    [paths.benchmark, fixture.benchmarkBytes],
    [paths.readme, fixture.readmeBytes],
    [paths.license, fixture.licenseBytes],
    [paths.trustedPin, canonicalizeStrict(fixture.trustedPin)],
  ]) writeFileSync(path, value, { mode: 0o600 });
  return paths;
}

function args({ stateRoot, output, paths, trustedPin = paths.trustedPin }) {
  const value = [
    "--state-root", stateRoot,
    "--libero-projection-input", paths.projection,
    "--task-map-input", paths.taskMap,
    "--benchmark-input", paths.benchmark,
    "--readme-input", paths.readme,
    "--license-input", paths.license,
    "--output", output,
  ];
  if (trustedPin !== null) value.push("--trusted-pin-input", trustedPin);
  return value;
}

function run(argv) {
  return spawnSync(process.execPath, [tool, ...argv], {
    cwd: dirname(tool),
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("Phase 3 CLI writes one 0600 no-clobber test-authority report", (t) => {
  const root = mkdtempSync(join(realpathSync(tmpdir()),
    "outsider-physical-phase3-cli."));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = publicShapeTestFixture();
  const paths = writeInputs(root, fixture);
  const stateRoot = join(root, "census-state");
  const output = join(root, "phase3-report.json");

  const result = run(args({ stateRoot, output, paths }));
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.artifactClass, PHYSICAL_SIMULATION_PHASE3_TEST_ARTIFACT_CLASS);
  assert.equal(summary.publicManifestIntegrated, false);
  assert.equal(summary.publicManifest.sourceTaskEntries, 0);
  assert.equal(summary.testFixtureManifest.sourceTaskEntries, 130);
  assert.equal(summary.census.censusUnfinalized, 16);
  assert.equal(summary.census.censusBlocked, 3);
  assert.equal(summary.census.censusAbandoned, 1);
  assert.equal(summary.census.censusOpen, 0);
  assert.equal(summary.census.censusSafe, 0);
  assert.equal(summary.realObservedAttemptDenominator, 0);
  assert.equal(summary.realWorldRatesAreNull, true);
  assert.match(summary.fileSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  const report = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(report.reportHash, summary.reportHash);
  assert.equal(report.authority.sourceAuthority,
    "CALLER_SUPPLIED_TEST_FIXTURE_PIN_ONLY");
  assert.equal(report.conclusions.physicalSafetyEstablished, false);

  const original = readFileSync(output);
  const duplicate = run(args({ stateRoot: join(root, "unused-state"),
    output, paths }));
  assert.equal(duplicate.status, 2);
  assert.match(duplicate.stderr, /PHYSICAL_SIMULATION_PHASE3_CLI_OUTPUT_EXISTS/);
  assert.deepEqual(readFileSync(output), original);
});

test("Phase 3 CLI refuses unknown arguments and relative paths", () => {
  for (const argv of [["--unknown"], [
    "--state-root", "relative", "--libero-projection-input", "relative",
    "--task-map-input", "relative", "--benchmark-input", "relative",
    "--readme-input", "relative", "--license-input", "relative",
    "--output", "relative",
  ]]) {
    const result = run(argv);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /PHYSICAL_SIMULATION_PHASE3_CLI_/);
  }
});

test("Phase 3 CLI produces the official public artifact when official bytes are supplied",
  (t) => {
    const officialRoot = process.env.OUTSIDER_LIBERO_OFFICIAL_SOURCE;
    if (!officialRoot) return;
    const root = mkdtempSync(join(realpathSync(tmpdir()),
      "outsider-physical-phase3-official."));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const paths = {
      projection: join(officialRoot, "libero-manifest-projection.json"),
      taskMap: join(officialRoot, "libero_suite_task_map.py"),
      benchmark: join(officialRoot, "benchmark_init.py"),
      readme: join(officialRoot, "README.md"),
      license: join(officialRoot, "LICENSE"),
      trustedPin: null,
    };
    for (const path of Object.values(paths).filter(Boolean)) chmodSync(path, 0o600);
    const output = join(root, "official-phase3-report.json");
    const result = run(args({ stateRoot: join(root, "census-state"), output,
      paths, trustedPin: null }));
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.artifactClass, PHYSICAL_SIMULATION_PHASE3_ARTIFACT_CLASS);
    assert.equal(summary.publicManifestIntegrated, true);
    assert.equal(summary.publicManifest.source, "LIBERO");
    assert.equal(summary.publicManifest.sourceTaskEntries, 130);
    assert.equal(summary.publicManifest.manifestOnlyNotRun, 130);
    assert.equal(summary.publicManifest.noOutcome, 130);
    assert.equal(summary.testFixtureManifest.sourceTaskEntries, 0);
    assert.equal(summary.publicDatasetWasRun, false);
    assert.equal(summary.publicDatasetOutcomeEstablished, false);
  });
