import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { canonicalizeStrict } from "./canonical.js";

export const LIBERO_DATASET = "Lifelong-Robot-Learning/LIBERO/task-suites";
export const LIBERO_MAX_SOURCE_BYTES = 128 * 1024;
export const LIBERO_MAX_DEEP_TREE_BYTES = 1024 * 1024;
export const LIBERO_MAX_DEEP_BUNDLE_BYTES = 24 * 1024 * 1024;
export const LIBERO_SCHEMAS = Object.freeze({
  source: "outsider/libero-source/v1",
  projection: "outsider/libero-manifest-projection/v1",
  deepPin: "outsider/libero-deep-source-pin/v1",
  deepBundle: "outsider/libero-deep-byte-bundle/v1",
  deepProjection: "outsider/libero-deep-manifest-projection/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_SUITE = /^libero_(?:spatial|object|goal|10|90)$/u;
const SAFE_TASK = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/u;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype", "toString"]);
const EXPECTED_CLASSES = Object.freeze([
  "LIBERO_SPATIAL", "LIBERO_OBJECT", "LIBERO_GOAL", "LIBERO_90", "LIBERO_10",
  "LIBERO_100",
]);

const OFFICIAL_DEEP_SUITE_ARTIFACTS = Object.freeze({
  libero_spatial: Object.freeze({
    tasks: 10, bddlDefinitions: 10, bddlBytes: 30_079,
    prunedInitStateFiles: 10, prunedInitStateBytes: 442_326,
    fullInitStateFiles: 10, fullInitStateBytes: 878_678,
  }),
  libero_object: Object.freeze({
    tasks: 10, bddlDefinitions: 10, bddlBytes: 21_236,
    prunedInitStateFiles: 10, prunedInitStateBytes: 532_502,
    fullInitStateFiles: 10, fullInitStateBytes: 532_502,
  }),
  libero_goal: Object.freeze({
    tasks: 10, bddlDefinitions: 10, bddlBytes: 29_532,
    prunedInitStateFiles: 10, prunedInitStateBytes: 375_638,
    fullInitStateFiles: 0, fullInitStateBytes: 0,
  }),
  libero_10: Object.freeze({
    tasks: 10, bddlDefinitions: 10, bddlBytes: 22_705,
    prunedInitStateFiles: 10, prunedInitStateBytes: 352_790,
    fullInitStateFiles: 10, fullInitStateBytes: 698_966,
  }),
  libero_90: Object.freeze({
    tasks: 90, bddlDefinitions: 90, bddlBytes: 197_939,
    prunedInitStateFiles: 90, prunedInitStateBytes: 2_951_366,
    fullInitStateFiles: 90, fullInitStateBytes: 5_847_366,
  }),
});

function digest(value) {
  const input = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function plain(value) {
  return value != null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function gitBlobDigest(value) {
  const header = Buffer.from(`blob ${value.length}\0`);
  return createHash("sha1").update(header).update(value).digest("hex");
}

function same(value, expected) {
  return canonicalizeStrict(value) === canonicalizeStrict(expected);
}

function sameSet(value, expected) {
  return value.length === expected.length
    && same([...value].sort(), [...expected].sort());
}

const OFFICIAL_FILES = Object.freeze({
  taskMap: Object.freeze({
    role: "TASK_SUITE_MAP",
    path: "libero/libero/benchmark/libero_suite_task_map.py",
    url: "https://raw.githubusercontent.com/Lifelong-Robot-Learning/LIBERO/8f1084e3132a39270c3a13ebe37270a43ece2a01/libero/libero/benchmark/libero_suite_task_map.py",
    sha256: "sha256:0c950df0a785aa55de968bb38ccd865d2017f71ddbe6f48cfd05ac0742b6d62d",
    bytes: 9_775,
  }),
  benchmark: Object.freeze({
    role: "BENCHMARK_REGISTRY",
    path: "libero/libero/benchmark/__init__.py",
    url: "https://raw.githubusercontent.com/Lifelong-Robot-Learning/LIBERO/8f1084e3132a39270c3a13ebe37270a43ece2a01/libero/libero/benchmark/__init__.py",
    sha256: "sha256:4ce6edbb00b3280692f2e2b2e8a14bf6e2d5878965b0484a386c0355a867ecc5",
    bytes: 6_108,
  }),
  readme: Object.freeze({
    role: "PROJECT_AND_DATASET_LICENSE_DECLARATION",
    path: "README.md",
    url: "https://raw.githubusercontent.com/Lifelong-Robot-Learning/LIBERO/8f1084e3132a39270c3a13ebe37270a43ece2a01/README.md",
    sha256: "sha256:e87d5b284da3d7c127e1bc8282ea80b5da02aad3e9272c13adc96c4eca0eaa41",
    bytes: 8_128,
  }),
  license: Object.freeze({
    role: "CODE_LICENSE_TEXT",
    path: "LICENSE",
    url: "https://raw.githubusercontent.com/Lifelong-Robot-Learning/LIBERO/8f1084e3132a39270c3a13ebe37270a43ece2a01/LICENSE",
    sha256: "sha256:e2885fd30a08381b799c4a33385522b23d637b4051b8f9a7f9f2519944b68ff6",
    bytes: 1_080,
  }),
});

const OFFICIAL_EXPECTED_COVERAGE = Object.freeze({
  sourceSuitePartitions: 5,
  conceptualOfficialSuites: 4,
  sourceTaskEntries: 130,
  uniqueTaskNames: 130,
  libero100UnionEntries: 100,
  registeredBenchmarkClasses: 6,
  tenTaskSuiteOrders: 21,
  suiteCounts: Object.freeze({
    libero_spatial: 10,
    libero_object: 10,
    libero_goal: 10,
    libero_10: 10,
    libero_90: 90,
  }),
});

const OFFICIAL_PIN_BODY = Object.freeze({
  schema: "outsider/libero-source-pin/v1",
  scope: "BUILT_IN_REVIEWED_PUBLIC_SOURCE",
  datasetId: LIBERO_DATASET,
  repositoryUrl: "https://github.com/Lifelong-Robot-Learning/LIBERO",
  revision: "8f1084e3132a39270c3a13ebe37270a43ece2a01",
  revisionUrl: "https://github.com/Lifelong-Robot-Learning/LIBERO/commit/8f1084e3132a39270c3a13ebe37270a43ece2a01",
  resolvedFromRef: "refs/heads/master",
  releaseTagEstablished: false,
  files: OFFICIAL_FILES,
  codeLicenseSpdx: "MIT",
  demonstrationDatasetLicenseSpdx: "CC-BY-4.0",
  licenseScope: "PINNED_REPOSITORY_TEXT_AND_TASK_SUITE_MANIFEST_ONLY",
  expectedCoverage: OFFICIAL_EXPECTED_COVERAGE,
  allowedSuites: Object.freeze([
    "libero_spatial", "libero_object", "libero_goal", "libero_10", "libero_90",
  ]),
});

export const LIBERO_OFFICIAL_PIN = Object.freeze({
  ...OFFICIAL_PIN_BODY,
  pinHash: digest(OFFICIAL_PIN_BODY),
});

export const LIBERO_SOURCE_PINS = Object.freeze({
  [LIBERO_OFFICIAL_PIN.revision]: LIBERO_OFFICIAL_PIN,
});

const OFFICIAL_DEEP_PIN_BODY = Object.freeze({
  schema: LIBERO_SCHEMAS.deepPin,
  scope: "BUILT_IN_REVIEWED_PUBLIC_SOURCE",
  basePinHash: LIBERO_OFFICIAL_PIN.pinHash,
  revision: LIBERO_OFFICIAL_PIN.revision,
  treeSource: Object.freeze({
    role: "IMMUTABLE_COMMIT_RECURSIVE_TREE",
    url: "https://api.github.com/repos/Lifelong-Robot-Learning/LIBERO/git/trees/8f1084e3132a39270c3a13ebe37270a43ece2a01?recursive=1",
    sha256: "sha256:4032eccaf6b2ce2cfc231d917f15a2eba13f6274c57cf24e1100427939ca9c32",
    bytes: 481_472,
  }),
  replayBundle: Object.freeze({
    schema: LIBERO_SCHEMAS.deepBundle,
    sha256: "sha256:acb6f627ffd6d93ff253cc661359d7f6ec04afffd86d9905f84bb8bc33b9a295",
    bytes: 17_270_856,
  }),
  sourceSelection: Object.freeze({
    bddlPrefix: "libero/libero/bddl_files",
    initStatePrefix: "libero/libero/init_files",
    selectedExtensions: Object.freeze([".bddl", ".pruned_init", ".init"]),
    unselectedIndexBasename: "tasks_info.txt",
  }),
  expectedCoverage: Object.freeze({
    repositoryTreeEntries: 1_367,
    sourceNamespaceBlobEntries: 385,
    selectedSourceFiles: 380,
    selectedSourceBytes: 12_913_625,
    bddlDefinitions: 130,
    bddlBytes: 301_491,
    prunedInitStateFiles: 130,
    prunedInitStateBytes: 4_654_622,
    fullInitStateFiles: 120,
    fullInitStateBytes: 7_957_512,
    unselectedTaskIndexFiles: 5,
    suiteArtifacts: OFFICIAL_DEEP_SUITE_ARTIFACTS,
  }),
  licenseBoundary:
    "PINNED_DECLARATIONS_REPLAYED_DEEP_FILES_NOT_REDISTRIBUTED_SCOPE_REQUIRES_REVIEW",
});

export const LIBERO_OFFICIAL_DEEP_PIN = Object.freeze({
  ...OFFICIAL_DEEP_PIN_BODY,
  pinHash: digest(OFFICIAL_DEEP_PIN_BODY),
});

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => /^[A-Za-z0-9._+-]+$/u.test(part)
      && part !== "." && part !== ".." && !FORBIDDEN_KEYS.has(part));
}

function validSourceFile(value) {
  return exactKeys(value, ["role", "path", "url", "sha256", "bytes"])
    && /^[A-Z][A-Z0-9_]+$/u.test(String(value.role ?? ""))
    && safeRelativePath(value.path) && /^https:\/\//u.test(String(value.url ?? ""))
    && HASH.test(String(value.sha256 ?? "")) && positiveInteger(value.bytes)
    && value.bytes <= LIBERO_MAX_SOURCE_BYTES;
}

function validCoverage(value, suites) {
  const keys = ["sourceSuitePartitions", "conceptualOfficialSuites",
    "sourceTaskEntries", "uniqueTaskNames", "libero100UnionEntries",
    "registeredBenchmarkClasses", "tenTaskSuiteOrders", "suiteCounts"];
  return exactKeys(value, keys)
    && keys.filter((key) => key !== "suiteCounts").every((key) => positiveInteger(value[key]))
    && plain(value.suiteCounts) && exactKeys(value.suiteCounts, suites)
    && suites.every((suite) => positiveInteger(value.suiteCounts[suite]))
    && Object.values(value.suiteCounts).reduce((sum, count) => sum + count, 0)
      === value.sourceTaskEntries
    && value.sourceSuitePartitions === suites.length
    && value.uniqueTaskNames === value.sourceTaskEntries
    && value.libero100UnionEntries
      === value.suiteCounts.libero_10 + value.suiteCounts.libero_90;
}

function validatePin(pin, { custom = false } = {}) {
  const keys = ["schema", "scope", "datasetId", "repositoryUrl", "revision",
    "revisionUrl", "resolvedFromRef", "releaseTagEstablished", "files",
    "codeLicenseSpdx", "demonstrationDatasetLicenseSpdx", "licenseScope",
    "expectedCoverage", "allowedSuites", "pinHash"];
  if (!exactKeys(pin, keys)) throw new Error("LIBERO_SOURCE_PIN_SHAPE_INVALID");
  const { pinHash, ...body } = pin;
  const files = pin.files;
  if (pin.schema !== "outsider/libero-source-pin/v1" || pinHash !== digest(body)
    || !COMMIT.test(String(pin.revision ?? ""))
    || typeof pin.datasetId !== "string" || pin.datasetId.length === 0
    || !/^https:\/\//u.test(String(pin.repositoryUrl ?? ""))
    || !/^https:\/\//u.test(String(pin.revisionUrl ?? ""))
    || pin.resolvedFromRef !== "refs/heads/master"
    || pin.releaseTagEstablished !== false
    || !exactKeys(files, ["taskMap", "benchmark", "readme", "license"])
    || !Object.values(files).every(validSourceFile)
    || pin.codeLicenseSpdx !== "MIT"
    || pin.demonstrationDatasetLicenseSpdx !== "CC-BY-4.0"
    || pin.licenseScope !== "PINNED_REPOSITORY_TEXT_AND_TASK_SUITE_MANIFEST_ONLY"
    || !Array.isArray(pin.allowedSuites) || pin.allowedSuites.length !== 5
    || new Set(pin.allowedSuites).size !== pin.allowedSuites.length
    || !pin.allowedSuites.every((suite) => SAFE_SUITE.test(suite)
      && !FORBIDDEN_KEYS.has(suite))
    || !validCoverage(pin.expectedCoverage, pin.allowedSuites)) {
    throw new Error("LIBERO_SOURCE_PIN_INVALID");
  }
  if (custom) {
    if (pin.scope !== "TEST_FIXTURE_ONLY" || pin.datasetId === LIBERO_DATASET) {
      throw new Error("LIBERO_CUSTOM_PIN_SCOPE_INVALID");
    }
  } else if (pin.scope !== "BUILT_IN_REVIEWED_PUBLIC_SOURCE"
    || pinHash !== LIBERO_OFFICIAL_PIN.pinHash) {
    throw new Error("LIBERO_BUILTIN_PIN_INVALID");
  }
  return pin;
}

function sourceBytes(value, label) {
  const bytes = Buffer.isBuffer(value) ? value
    : value instanceof Uint8Array ? Buffer.from(value)
      : typeof value === "string" ? Buffer.from(value) : null;
  if (!bytes || bytes.length === 0 || bytes.length > LIBERO_MAX_SOURCE_BYTES) {
    throw new Error(`LIBERO_${label}_SIZE_INVALID`);
  }
  return bytes;
}

function text(bytes, label) {
  let output;
  try { output = UTF8.decode(bytes); }
  catch { throw new Error(`LIBERO_${label}_UTF8_INVALID`); }
  if (output.includes("\0")) throw new Error(`LIBERO_${label}_NUL_INVALID`);
  return output;
}

function parseTaskMap(bytes, pin) {
  const lines = text(bytes, "TASK_MAP").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines[0] !== "libero_task_map = {" || lines.at(-1) !== "}") {
    throw new Error("LIBERO_TASK_MAP_WRAPPER_INVALID");
  }
  const suites = new Map();
  let current = null;
  for (const line of lines.slice(1, -1)) {
    const suite = /^    "([a-z0-9_]+)": \[$/u.exec(line);
    if (suite) {
      if (current !== null || suites.has(suite[1]) || !SAFE_SUITE.test(suite[1])
        || FORBIDDEN_KEYS.has(suite[1])) {
        throw new Error("LIBERO_TASK_MAP_SUITE_INVALID");
      }
      current = suite[1];
      suites.set(current, []);
      continue;
    }
    if (line === "    ],") {
      if (current === null) throw new Error("LIBERO_TASK_MAP_SUITE_CLOSE_INVALID");
      current = null;
      continue;
    }
    const task = /^        "([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)",$/u.exec(line);
    if (!task || current === null || !SAFE_TASK.test(task[1])
      || FORBIDDEN_KEYS.has(task[1])) {
      throw new Error("LIBERO_TASK_MAP_LINE_INVALID");
    }
    suites.get(current).push(task[1]);
  }
  if (current !== null || suites.size !== pin.allowedSuites.length
    || !same([...suites.keys()], pin.allowedSuites)) {
    throw new Error("LIBERO_TASK_MAP_SUITE_SET_INVALID");
  }
  const all = [];
  for (const [suite, tasks] of suites) {
    if (tasks.length !== pin.expectedCoverage.suiteCounts[suite]
      || new Set(tasks).size !== tasks.length) {
      throw new Error("LIBERO_TASK_MAP_SUITE_COVERAGE_INVALID");
    }
    for (const task of tasks) all.push({ suite, task });
  }
  if (all.length !== pin.expectedCoverage.sourceTaskEntries
    || new Set(all.map(({ task }) => task)).size !== pin.expectedCoverage.uniqueTaskNames) {
    throw new Error("LIBERO_TASK_MAP_GLOBAL_COVERAGE_INVALID");
  }
  const union = [...suites.get("libero_90"), ...suites.get("libero_10")];
  if (union.length !== pin.expectedCoverage.libero100UnionEntries
    || new Set(union).size !== union.length) {
    throw new Error("LIBERO_TASK_MAP_LIBERO100_UNION_INVALID");
  }
  return { suites, all };
}

function extractBracketBlock(source, prefix, suffix, label) {
  const start = source.indexOf(prefix);
  const end = source.indexOf(suffix, start + prefix.length);
  if (start < 0 || end < 0 || source.indexOf(prefix, start + 1) >= 0) {
    throw new Error(`LIBERO_${label}_BLOCK_INVALID`);
  }
  return source.slice(start + prefix.length, end);
}

function parseBenchmark(bytes, pin) {
  const source = text(bytes, "BENCHMARK");
  const suiteBlock = extractBracketBlock(source, "libero_suites = [\n",
    "]\ntask_maps = {}", "BENCHMARK_SUITE");
  const suites = [...suiteBlock.matchAll(/^    "([a-z0-9_]+)",$/gmu)]
    .map((match) => match[1]);
  if (suiteBlock.split("\n").filter(Boolean).length !== suites.length
    || !sameSet(suites, pin.allowedSuites)) {
    throw new Error("LIBERO_BENCHMARK_SUITE_SET_INVALID");
  }
  const orderBlock = extractBracketBlock(source, "task_orders = [\n",
    "]\n\n\nclass Benchmark", "BENCHMARK_ORDER");
  const orderLines = orderBlock.split("\n").filter(Boolean);
  const orders = orderLines.map((line) => {
    const match = /^    \[([0-9, ]+)\],$/u.exec(line);
    if (!match) throw new Error("LIBERO_BENCHMARK_ORDER_LINE_INVALID");
    return match[1].split(",").map((value) => Number(value.trim()));
  });
  if (orders.length !== pin.expectedCoverage.tenTaskSuiteOrders
    || orders.some((order) => order.length !== 10
      || !order.every((value) => Number.isSafeInteger(value))
      || !same([...order].sort((left, right) => left - right),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))) {
    throw new Error("LIBERO_BENCHMARK_ORDER_COVERAGE_INVALID");
  }
  const classes = [...source.matchAll(/^@register_benchmark\nclass ([A-Z0-9_]+)\(Benchmark\):$/gmu)]
    .map((match) => match[1]);
  if (classes.length !== pin.expectedCoverage.registeredBenchmarkClasses
    || !same(classes, EXPECTED_CLASSES)) {
    throw new Error("LIBERO_BENCHMARK_CLASS_SET_INVALID");
  }
  if (!source.includes('self.name = "libero_100"')
    || !source.includes('self.name = "libero_90"')
    || !source.includes('self.name = "libero_10"')) {
    throw new Error("LIBERO_BENCHMARK_CLASS_BINDING_INVALID");
  }
  return { suites, orders, classes };
}

function validateLicenseEvidence(readmeBytes, licenseBytes) {
  const readme = text(readmeBytes, "README");
  const license = text(licenseBytes, "LICENSE");
  if (!readme.includes("130 tasks grouped into four task suites")
    || !readme.includes("**LIBERO-100** consists of 100 manipulation tasks")
    || !readme.includes("**LIBERO-90** for pretraining")
    || !readme.includes("**LIBERO-10** for testing")
    || !/^\| Codebase\s+\| \[MIT License\]\(LICENSE\)/mu.test(readme)
    || !/^\| Datasets\s+\| \[Creative Commons Attribution 4\.0 International \(CC BY 4\.0\)\]/mu.test(readme)
    || !license.startsWith("MIT License\n")
    || !license.includes("Copyright (c) 2023 Lifelong Robot Learning")) {
    throw new Error("LIBERO_LICENSE_OR_COVERAGE_EVIDENCE_INVALID");
  }
}

function normalizeSource(source, input, trustedPin = null) {
  if (!exactKeys(source, ["datasetId", "revision"])) {
    throw new Error("LIBERO_SOURCE_SHAPE_INVALID");
  }
  const pin = validatePin(trustedPin ?? LIBERO_SOURCE_PINS[source.revision],
    { custom: trustedPin != null });
  if (source.datasetId !== pin.datasetId || source.revision !== pin.revision) {
    throw new Error("LIBERO_SOURCE_PROVENANCE_INVALID");
  }
  for (const key of ["taskMap", "benchmark", "readme", "license"]) {
    const expected = pin.files[key];
    if (input[key].length !== expected.bytes || digest(input[key]) !== expected.sha256) {
      throw new Error(`LIBERO_${key.toUpperCase()}_PROVENANCE_INVALID`);
    }
  }
  const builtIn = pin.scope === "BUILT_IN_REVIEWED_PUBLIC_SOURCE";
  const projectedFiles = Object.fromEntries(Object.entries(pin.files).map(([key, file]) =>
    [key, {
      role: file.role,
      evidenceUrl: builtIn ? file.url : "TEST_FIXTURE_SOURCE_REDACTED",
      sha256: file.sha256,
      bytes: file.bytes,
    }]));
  return { pin, projected: {
    schema: LIBERO_SCHEMAS.source,
    pinHash: pin.pinHash,
    pinAuthority: builtIn ? "BUILT_IN_REVIEWED_PIN" : "TEST_FIXTURE_PIN",
    datasetId: builtIn ? pin.datasetId
      : `outsider/test-fixture/${digest(pin.datasetId).slice(7)}`,
    repositoryUrl: builtIn ? pin.repositoryUrl : "TEST_FIXTURE_SOURCE_REDACTED",
    revision: pin.revision,
    revisionEvidenceUrl: builtIn ? pin.revisionUrl : "TEST_FIXTURE_SOURCE_REDACTED",
    resolvedFromRef: pin.resolvedFromRef,
    releaseTagEstablished: pin.releaseTagEstablished,
    files: projectedFiles,
  } };
}

function sourceForReplay(projected, trustedPin = null) {
  if (!plain(projected) || projected.schema !== LIBERO_SCHEMAS.source
    || !COMMIT.test(String(projected.revision ?? ""))) {
    throw new Error("LIBERO_PROJECTED_SOURCE_INVALID");
  }
  if (projected.pinAuthority === "TEST_FIXTURE_PIN") {
    if (trustedPin == null) throw new Error("LIBERO_CUSTOM_TRUSTED_PIN_REQUIRED");
    return { datasetId: trustedPin.datasetId, revision: trustedPin.revision };
  }
  return { datasetId: projected.datasetId, revision: projected.revision };
}

export function createLiberoManifestProjection({ taskMapBytes, benchmarkBytes,
  readmeBytes, licenseBytes, source, trustedPin = null }) {
  const input = {
    taskMap: sourceBytes(taskMapBytes, "TASK_MAP"),
    benchmark: sourceBytes(benchmarkBytes, "BENCHMARK"),
    readme: sourceBytes(readmeBytes, "README"),
    license: sourceBytes(licenseBytes, "LICENSE"),
  };
  const { pin, projected } = normalizeSource(source, input, trustedPin);
  const builtIn = pin.scope === "BUILT_IN_REVIEWED_PUBLIC_SOURCE";
  const manifest = parseTaskMap(input.taskMap, pin);
  const benchmark = parseBenchmark(input.benchmark, pin);
  validateLicenseEvidence(input.readme, input.license);

  const taskRecords = manifest.all.map(({ suite, task }, sourceOrdinal) => {
    const suiteOrdinal = manifest.suites.get(suite).indexOf(task);
    const taskIdHash = digest({ domain: "libero/task-identity/v1", suite, task });
    return {
      suite,
      sourceOrdinal,
      suiteOrdinal,
      taskIdHash,
      taskManifestHash: digest({ domain: "libero/task-manifest/v1", taskIdHash,
        suite, sourceOrdinal, suiteOrdinal, revision: pin.revision }),
      executionClassification: "NOT_RUN",
      outcome: "NO_OUTCOME",
    };
  });
  const suiteDenominators = pin.allowedSuites.map((suite) => ({
    suite,
    sourceTaskEntries: manifest.suites.get(suite).length,
    manifestOnlyNotRun: manifest.suites.get(suite).length,
    noOutcome: manifest.suites.get(suite).length,
  }));
  const body = {
    schema: LIBERO_SCHEMAS.projection,
    source: projected,
    extractionPolicy: {
      id: "outsider/libero-exact-task-manifest-only",
      version: "1.0.0",
      retained: ["reviewed-official-source-metadata", "suite-identifiers",
        "suite-level-denominators", "hashed-task-identifiers",
        "hashed-task-manifest-commitments", "manifest-only-execution-states",
        "license-and-provenance-evidence"],
      removed: ["task-language", "task-names", "task-paths", "bddl-paths",
        "init-state-paths", "demonstration-paths", "images", "videos", "models",
        "trajectories", "observations", "actions", "filesystem-paths"],
    },
    authority: {
      mode: "QUARANTINE_MANIFEST_ONLY",
      admission: builtIn ? "ADMITTED_MANIFEST_ONLY" : "TEST_FIXTURE_ONLY",
      sourcePinAuthority: builtIn ? "BUILT_IN_REVIEWED_PIN"
        : "CALLER_SUPPLIED_TEST_FIXTURE_PIN",
      exactOfficialSourceIntegrityEstablishedByTrustedPinAndReplay: builtIn,
      fixtureBytesMatchedCallerSuppliedPin: !builtIn,
      immutableOfficialCommitPinned: builtIn,
      commitSignatureVerified: false,
      publisherIdentityCryptographicallyVerified: false,
      benchmarkWasRun: false,
      benchmarkOutcomeEstablished: false,
      simulatorTelemetryPresent: false,
      externalWorldOutcomeEstablished: false,
      physicalSafetyEstablished: false,
      productionReliabilityEstablished: false,
      causalEffectEstablished: false,
      modelTrainingAuthorizedByOutsider: false,
      rawDatasetRedistributionAuthorizedByOutsider: false,
    },
    license: {
      status: builtIn ? "ESTABLISHED_FOR_PINNED_MANIFEST_INPUTS"
        : "CALLER_ASSERTED_TEST_FIXTURE_ONLY",
      evidenceAuthority: builtIn ? "BUILT_IN_REVIEWED_PIN_AND_REPLAY"
        : "CALLER_SUPPLIED_TEST_FIXTURE_PIN",
      sourceCodeSpdx: pin.codeLicenseSpdx,
      demonstrationDatasetSpdx: pin.demonstrationDatasetLicenseSpdx,
      scope: pin.licenseScope,
      exactOfficialLicenseTextHashVerified: builtIn,
      exactOfficialReadmeLicenseDeclarationHashVerified: builtIn,
      fixtureLicenseAndReadmeBytesMatchedCallerSuppliedPin: !builtIn,
      demonstrationDatasetBytesIngested: false,
      expandedUseRequiresIndependentReview: true,
    },
    privacy: {
      rawSourceRetainedInProjection: false,
      rawTaskLanguageRetained: false,
      rawTaskNamesRetained: false,
      rawTaskPathsRetained: false,
      bddlOrInitStatePathsRetained: false,
      demonstrationPathsRetained: false,
      filesystemPathsRetained: false,
      imagesRetained: false,
      videosRetained: false,
      modelsRetained: false,
      trajectoriesRetained: false,
      observationsOrActionsRetained: false,
      callerControlledSourceMetadataRetained: false,
      reviewedOfficialSourceMetadataRetained: true,
      reviewedOfficialSuiteIdentifiersRetained: true,
    },
    denominator: {
      sourceSuitePartitions: manifest.suites.size,
      sourceTaskEntries: taskRecords.length,
      uniqueTaskIds: new Set(taskRecords.map((record) => record.taskIdHash)).size,
      manifestOnlyNotRun: taskRecords.length,
      noOutcome: taskRecords.length,
      executionRecordsPresent: 0,
      omittedSourceTasks: 0,
      suiteDenominators,
      libero100DerivedUnion: {
        sourcePartitions: ["libero_90", "libero_10"],
        sourceTaskEntries: pin.expectedCoverage.libero100UnionEntries,
        countedAgainInGlobalDenominator: false,
        directTaskMapKeyPresent: false,
      },
    },
    manifests: {
      suiteSetHash: digest({ domain: "libero/suite-set/v1",
        suites: suiteDenominators }),
      taskSetHash: digest({ domain: "libero/task-set/v1",
        taskManifestHashes: taskRecords.map((record) => record.taskManifestHash) }),
      benchmarkRegistryHash: digest({ domain: "libero/benchmark-registry/v1",
        classes: benchmark.classes, suitePartitions: benchmark.suites,
        taskOrderCount: benchmark.orders.length }),
      bddlDefinitionsDownloaded: 0,
      initStateFilesDownloaded: 0,
      demonstrationFilesDownloaded: 0,
      imageOrVideoFilesDownloaded: 0,
      modelFilesDownloaded: 0,
      taskRecords,
    },
    executionEvidence: {
      classification: "NOT_RUN",
      outcome: "NO_OUTCOME",
      recordsPresent: 0,
      attempted: 0,
      completed: 0,
      pass: 0,
      fail: 0,
      error: 0,
      missingOutcome: taskRecords.length,
    },
    observability: {
      taskIdentityCommitted: true,
      suiteMembershipCommitted: true,
      sourceOrderCommitted: true,
      bddlSemanticsObserved: false,
      initialStatesObserved: false,
      simulatorResetObserved: false,
      targetIdentityObserved: false,
      workspaceBoundaryObserved: false,
      forceObserved: false,
      energyObserved: false,
      taskSuccessPredicateObserved: false,
      rolloutTerminationObserved: false,
    },
  };
  return Object.freeze({ ...body, projectionHash: digest(body) });
}

export function verifyLiberoManifestProjection(projection, { taskMapBytes = null,
  benchmarkBytes = null, readmeBytes = null, licenseBytes = null,
  trustedPin = null } = {}) {
  try {
    const keys = ["schema", "source", "extractionPolicy", "authority", "license",
      "privacy", "denominator", "manifests", "executionEvidence", "observability",
      "projectionHash"];
    if (!exactKeys(projection, keys) || projection.schema !== LIBERO_SCHEMAS.projection
      || !HASH.test(String(projection.projectionHash ?? ""))) {
      return { ok: false, error: "LIBERO_PROJECTION_SHAPE_INVALID" };
    }
    const { projectionHash, ...body } = projection;
    if (projectionHash !== digest(body)) {
      return { ok: false, error: "LIBERO_PROJECTION_HASH_INVALID" };
    }
    if ([taskMapBytes, benchmarkBytes, readmeBytes, licenseBytes]
      .some((value) => value == null)) {
      return { ok: false, error: "LIBERO_SOURCE_BYTES_REQUIRED" };
    }
    const rebuilt = createLiberoManifestProjection({ taskMapBytes, benchmarkBytes,
      readmeBytes, licenseBytes, source: sourceForReplay(projection.source, trustedPin),
      trustedPin });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(projection)) {
      return { ok: false, error: "LIBERO_PROJECTION_REPLAY_INVALID" };
    }
    return { ok: true, projectionHash, sourceBytesReplayed: true,
      admission: projection.authority.admission,
      sourceTaskEntries: projection.denominator.sourceTaskEntries,
      executionClassification: "NOT_RUN", outcome: "NO_OUTCOME" };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function deepSourceBytes(value, label, maximum) {
  const bytes = Buffer.isBuffer(value) ? value
    : value instanceof Uint8Array ? Buffer.from(value)
      : typeof value === "string" ? Buffer.from(value) : null;
  if (!bytes || bytes.length === 0 || bytes.length > maximum) {
    throw new Error(`LIBERO_DEEP_${label}_SIZE_INVALID`);
  }
  return bytes;
}

function validDeepSuiteCoverage(value) {
  const keys = ["tasks", "bddlDefinitions", "bddlBytes",
    "prunedInitStateFiles", "prunedInitStateBytes", "fullInitStateFiles",
    "fullInitStateBytes"];
  return exactKeys(value, keys)
    && positiveInteger(value.tasks)
    && value.bddlDefinitions === value.tasks
    && positiveInteger(value.bddlBytes)
    && value.prunedInitStateFiles === value.tasks
    && positiveInteger(value.prunedInitStateBytes)
    && nonnegativeInteger(value.fullInitStateFiles)
    && [0, value.tasks].includes(value.fullInitStateFiles)
    && nonnegativeInteger(value.fullInitStateBytes)
    && (value.fullInitStateFiles === 0) === (value.fullInitStateBytes === 0);
}

function validDeepCoverage(value, suites) {
  const keys = ["repositoryTreeEntries", "sourceNamespaceBlobEntries",
    "selectedSourceFiles", "selectedSourceBytes", "bddlDefinitions",
    "bddlBytes", "prunedInitStateFiles", "prunedInitStateBytes",
    "fullInitStateFiles", "fullInitStateBytes", "unselectedTaskIndexFiles",
    "suiteArtifacts"];
  if (!exactKeys(value, keys)
    || !keys.filter((key) => key !== "suiteArtifacts")
      .every((key) => positiveInteger(value[key]))
    || !plain(value.suiteArtifacts)
    || !exactKeys(value.suiteArtifacts, suites)
    || !suites.every((suite) => validDeepSuiteCoverage(value.suiteArtifacts[suite]))) {
    return false;
  }
  const sum = (key) => suites.reduce((total, suite) =>
    total + value.suiteArtifacts[suite][key], 0);
  return value.bddlDefinitions === sum("bddlDefinitions")
    && value.bddlBytes === sum("bddlBytes")
    && value.prunedInitStateFiles === sum("prunedInitStateFiles")
    && value.prunedInitStateBytes === sum("prunedInitStateBytes")
    && value.fullInitStateFiles === sum("fullInitStateFiles")
    && value.fullInitStateBytes === sum("fullInitStateBytes")
    && value.selectedSourceFiles === value.bddlDefinitions
      + value.prunedInitStateFiles + value.fullInitStateFiles
    && value.selectedSourceBytes === value.bddlBytes
      + value.prunedInitStateBytes + value.fullInitStateBytes
    && value.sourceNamespaceBlobEntries === value.selectedSourceFiles
      + value.unselectedTaskIndexFiles
    && value.unselectedTaskIndexFiles === suites.length;
}

function validateDeepPin(pin, basePin, { custom = false } = {}) {
  const keys = ["schema", "scope", "basePinHash", "revision", "treeSource",
    "replayBundle", "sourceSelection", "expectedCoverage", "licenseBoundary",
    "pinHash"];
  if (!exactKeys(pin, keys)) throw new Error("LIBERO_DEEP_PIN_SHAPE_INVALID");
  const { pinHash, ...body } = pin;
  const selection = pin.sourceSelection;
  const tree = pin.treeSource;
  const bundle = pin.replayBundle;
  if (pin.schema !== LIBERO_SCHEMAS.deepPin || pinHash !== digest(body)
    || pin.basePinHash !== basePin.pinHash || pin.revision !== basePin.revision
    || !exactKeys(tree, ["role", "url", "sha256", "bytes"])
    || tree.role !== "IMMUTABLE_COMMIT_RECURSIVE_TREE"
    || !/^https:\/\//u.test(String(tree.url ?? ""))
    || !HASH.test(String(tree.sha256 ?? "")) || !positiveInteger(tree.bytes)
    || tree.bytes > LIBERO_MAX_DEEP_TREE_BYTES
    || !exactKeys(bundle, ["schema", "sha256", "bytes"])
    || bundle.schema !== LIBERO_SCHEMAS.deepBundle
    || !HASH.test(String(bundle.sha256 ?? "")) || !positiveInteger(bundle.bytes)
    || bundle.bytes > LIBERO_MAX_DEEP_BUNDLE_BYTES
    || !exactKeys(selection, ["bddlPrefix", "initStatePrefix",
      "selectedExtensions", "unselectedIndexBasename"])
    || selection.bddlPrefix !== "libero/libero/bddl_files"
    || selection.initStatePrefix !== "libero/libero/init_files"
    || !same(selection.selectedExtensions, [".bddl", ".pruned_init", ".init"])
    || selection.unselectedIndexBasename !== "tasks_info.txt"
    || !validDeepCoverage(pin.expectedCoverage, basePin.allowedSuites)
    || pin.licenseBoundary
      !== "PINNED_DECLARATIONS_REPLAYED_DEEP_FILES_NOT_REDISTRIBUTED_SCOPE_REQUIRES_REVIEW") {
    throw new Error("LIBERO_DEEP_PIN_INVALID");
  }
  if (custom) {
    if (pin.scope !== "TEST_FIXTURE_ONLY") {
      throw new Error("LIBERO_DEEP_CUSTOM_PIN_SCOPE_INVALID");
    }
  } else if (pin.scope !== "BUILT_IN_REVIEWED_PUBLIC_SOURCE"
    || pinHash !== LIBERO_OFFICIAL_DEEP_PIN.pinHash) {
    throw new Error("LIBERO_DEEP_BUILTIN_PIN_INVALID");
  }
  return pin;
}

function parseDeepTree(bytes, pin, basePin, manifest) {
  if (bytes.length !== pin.treeSource.bytes || digest(bytes) !== pin.treeSource.sha256) {
    throw new Error("LIBERO_DEEP_TREE_PROVENANCE_INVALID");
  }
  let value;
  try { value = JSON.parse(text(bytes, "DEEP_TREE")); }
  catch (error) {
    if (String(error?.message ?? error).startsWith("LIBERO_")) throw error;
    throw new Error("LIBERO_DEEP_TREE_JSON_INVALID");
  }
  if (!exactKeys(value, ["sha", "url", "tree", "truncated"])
    || value.sha !== pin.revision
    || value.url !== pin.treeSource.url.replace("?recursive=1", "")
    || value.truncated !== false || !Array.isArray(value.tree)
    || value.tree.length !== pin.expectedCoverage.repositoryTreeEntries) {
    throw new Error("LIBERO_DEEP_TREE_SHAPE_INVALID");
  }
  const seen = new Set();
  const selected = new Map();
  const taskIndexes = new Set();
  let namespaceBlobEntries = 0;
  for (const entry of value.tree) {
    if (!plain(entry) || typeof entry.path !== "string" || entry.path.includes("\0")
      || seen.has(entry.path)) {
      throw new Error("LIBERO_DEEP_TREE_ENTRY_INVALID");
    }
    seen.add(entry.path);
    if (entry.type !== "blob") continue;
    const inNamespace = entry.path.startsWith(`${pin.sourceSelection.bddlPrefix}/`)
      || entry.path.startsWith(`${pin.sourceSelection.initStatePrefix}/`);
    if (!inNamespace) continue;
    namespaceBlobEntries += 1;
    if (!exactKeys(entry, ["path", "mode", "type", "sha", "size", "url"])
      || entry.mode !== "100644" || !/^[a-f0-9]{40}$/u.test(String(entry.sha ?? ""))
      || !positiveInteger(entry.size) || !/^https:\/\//u.test(String(entry.url ?? ""))
      || !safeRelativePath(entry.path)) {
      throw new Error("LIBERO_DEEP_TREE_BLOB_INVALID");
    }
    const bddl = /^libero\/libero\/bddl_files\/(libero_(?:spatial|object|goal|10|90))\/([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)\.bddl$/u
      .exec(entry.path);
    const state = /^libero\/libero\/init_files\/(libero_(?:spatial|object|goal|10|90))\/([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)\.(pruned_init|init)$/u
      .exec(entry.path);
    const taskIndex = /^libero\/libero\/bddl_files\/(libero_(?:spatial|object|goal|10|90))\/tasks_info\.txt$/u
      .exec(entry.path);
    if (taskIndex) {
      if (taskIndexes.has(taskIndex[1])) {
        throw new Error("LIBERO_DEEP_TREE_TASK_INDEX_DUPLICATE");
      }
      taskIndexes.add(taskIndex[1]);
      continue;
    }
    if (!bddl && !state) throw new Error("LIBERO_DEEP_TREE_NAMESPACE_FILE_INVALID");
    const [match, suite, task, extension = "bddl"] = bddl ?? state;
    void match;
    if (!basePin.allowedSuites.includes(suite)) {
      throw new Error("LIBERO_DEEP_TREE_SUITE_INVALID");
    }
    const key = `${suite}\0${task}\0${extension}`;
    if (selected.has(key)) throw new Error("LIBERO_DEEP_TREE_FILE_DUPLICATE");
    selected.set(key, { ...entry, suite, task, extension });
  }
  if (namespaceBlobEntries !== pin.expectedCoverage.sourceNamespaceBlobEntries
    || taskIndexes.size !== pin.expectedCoverage.unselectedTaskIndexFiles
    || !sameSet([...taskIndexes], basePin.allowedSuites)) {
    throw new Error("LIBERO_DEEP_TREE_NAMESPACE_COVERAGE_INVALID");
  }
  const records = [];
  for (const { suite, task } of manifest.all) {
    const suiteCoverage = pin.expectedCoverage.suiteArtifacts[suite];
    const get = (extension) => selected.get(`${suite}\0${task}\0${extension}`);
    const bddl = get("bddl");
    const prunedInit = get("pruned_init");
    const fullInit = get("init") ?? null;
    if (!bddl || !prunedInit
      || (suiteCoverage.fullInitStateFiles === suiteCoverage.tasks) !== (fullInit != null)) {
      throw new Error("LIBERO_DEEP_TREE_TASK_BINDING_INVALID");
    }
    records.push({ suite, task, bddl, prunedInit, fullInit });
  }
  if (selected.size !== pin.expectedCoverage.selectedSourceFiles
    || records.length !== pin.expectedCoverage.bddlDefinitions) {
    throw new Error("LIBERO_DEEP_TREE_SELECTED_COVERAGE_INVALID");
  }
  const actualBySuite = Object.fromEntries(basePin.allowedSuites.map((suite) =>
    [suite, { tasks: 0, bddlDefinitions: 0, bddlBytes: 0,
      prunedInitStateFiles: 0, prunedInitStateBytes: 0,
      fullInitStateFiles: 0, fullInitStateBytes: 0 }]));
  for (const record of records) {
    const coverage = actualBySuite[record.suite];
    coverage.tasks += 1;
    coverage.bddlDefinitions += 1;
    coverage.bddlBytes += record.bddl.size;
    coverage.prunedInitStateFiles += 1;
    coverage.prunedInitStateBytes += record.prunedInit.size;
    if (record.fullInit) {
      coverage.fullInitStateFiles += 1;
      coverage.fullInitStateBytes += record.fullInit.size;
    }
  }
  if (!same(actualBySuite, pin.expectedCoverage.suiteArtifacts)) {
    throw new Error("LIBERO_DEEP_TREE_BYTE_DENOMINATOR_INVALID");
  }
  return { repositoryTreeEntries: value.tree.length, records };
}

function validBase64(value) {
  return typeof value === "string" && value.length > 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
      .test(value);
}

function parseDeepBundle(bytes, pin, treeRecords) {
  if (bytes.length !== pin.replayBundle.bytes || digest(bytes) !== pin.replayBundle.sha256) {
    throw new Error("LIBERO_DEEP_BUNDLE_PROVENANCE_INVALID");
  }
  let value;
  try { value = JSON.parse(text(bytes, "DEEP_BUNDLE")); }
  catch (error) {
    if (String(error?.message ?? error).startsWith("LIBERO_")) throw error;
    throw new Error("LIBERO_DEEP_BUNDLE_JSON_INVALID");
  }
  if (!exactKeys(value, ["schema", "revision", "files"])
    || value.schema !== LIBERO_SCHEMAS.deepBundle || value.revision !== pin.revision
    || !Array.isArray(value.files)
    || value.files.length !== pin.expectedCoverage.selectedSourceFiles) {
    throw new Error("LIBERO_DEEP_BUNDLE_SHAPE_INVALID");
  }
  const expected = new Map();
  for (const record of treeRecords) {
    for (const file of [record.bddl, record.prunedInit, record.fullInit].filter(Boolean)) {
      expected.set(file.path, file);
    }
  }
  const replayed = new Map();
  let selectedSourceBytes = 0;
  for (const file of value.files) {
    if (!exactKeys(file, ["path", "contentBase64"]) || !safeRelativePath(file.path)
      || !validBase64(file.contentBase64) || replayed.has(file.path)
      || !expected.has(file.path)) {
      throw new Error("LIBERO_DEEP_BUNDLE_FILE_INVALID");
    }
    const content = Buffer.from(file.contentBase64, "base64");
    if (content.toString("base64") !== file.contentBase64) {
      throw new Error("LIBERO_DEEP_BUNDLE_BASE64_INVALID");
    }
    const treeFile = expected.get(file.path);
    if (content.length !== treeFile.size || gitBlobDigest(content) !== treeFile.sha) {
      throw new Error("LIBERO_DEEP_BUNDLE_GIT_BLOB_INVALID");
    }
    if (file.path.endsWith(".bddl")) {
      const source = text(content, "DEEP_BDDL");
      if (!source.startsWith("(define (problem ")
        || !source.includes("(:domain robosuite)")
        || !source.includes("(:language ")) {
        throw new Error("LIBERO_DEEP_BDDL_STRUCTURE_INVALID");
      }
    }
    selectedSourceBytes += content.length;
    replayed.set(file.path, {
      bytes: content.length,
      sha256: digest(content),
      gitBlobSha1: treeFile.sha,
    });
  }
  if (replayed.size !== expected.size
    || selectedSourceBytes !== pin.expectedCoverage.selectedSourceBytes) {
    throw new Error("LIBERO_DEEP_BUNDLE_COVERAGE_INVALID");
  }
  return replayed;
}

function projectedArtifact(file, replayed) {
  if (!file) return null;
  const value = replayed.get(file.path);
  return { bytes: value.bytes, sha256: value.sha256,
    gitBlobSha1: value.gitBlobSha1 };
}

export function createLiberoDeepManifestProjection({ taskMapBytes, benchmarkBytes,
  readmeBytes, licenseBytes, sourceTreeBytes, sourceByteBundleBytes, source,
  trustedPin = null, trustedDeepPin = null }) {
  const baseInput = { taskMapBytes, benchmarkBytes, readmeBytes, licenseBytes };
  const baseProjection = createLiberoManifestProjection({ ...baseInput, source,
    trustedPin });
  const basePin = validatePin(trustedPin ?? LIBERO_SOURCE_PINS[source.revision],
    { custom: trustedPin != null });
  const deepPin = validateDeepPin(trustedDeepPin ?? LIBERO_OFFICIAL_DEEP_PIN,
    basePin, { custom: trustedDeepPin != null });
  const treeBytes = deepSourceBytes(sourceTreeBytes, "TREE",
    LIBERO_MAX_DEEP_TREE_BYTES);
  const bundleBytes = deepSourceBytes(sourceByteBundleBytes, "BUNDLE",
    LIBERO_MAX_DEEP_BUNDLE_BYTES);
  const manifest = parseTaskMap(sourceBytes(taskMapBytes, "TASK_MAP"), basePin);
  const tree = parseDeepTree(treeBytes, deepPin, basePin, manifest);
  const replayed = parseDeepBundle(bundleBytes, deepPin, tree.records);
  const builtIn = deepPin.scope === "BUILT_IN_REVIEWED_PUBLIC_SOURCE";
  const taskRecords = tree.records.map((record, sourceOrdinal) => {
    const baseTask = baseProjection.manifests.taskRecords[sourceOrdinal];
    const bddl = projectedArtifact(record.bddl, replayed);
    const prunedInitState = projectedArtifact(record.prunedInit, replayed);
    const fullInitState = projectedArtifact(record.fullInit, replayed);
    const value = {
      suite: record.suite,
      sourceOrdinal,
      taskIdHash: baseTask.taskIdHash,
      baseTaskManifestHash: baseTask.taskManifestHash,
      bddl,
      prunedInitState,
      fullInitState,
      executionClassification: "NOT_RUN",
      outcome: "NO_OUTCOME",
    };
    return { ...value, taskArtifactCommitmentHash: digest({
      domain: "libero/deep-task-artifact/v1", ...value,
    }) };
  });
  const suiteDenominators = basePin.allowedSuites.map((suite) => {
    const expected = deepPin.expectedCoverage.suiteArtifacts[suite];
    return { suite, taskDefinitions: expected.tasks,
      bddlDefinitions: expected.bddlDefinitions, bddlBytes: expected.bddlBytes,
      prunedInitStateFiles: expected.prunedInitStateFiles,
      prunedInitStateBytes: expected.prunedInitStateBytes,
      fullInitStateFiles: expected.fullInitStateFiles,
      fullInitStateBytes: expected.fullInitStateBytes,
      manifestOnlyNotRun: expected.tasks, noOutcome: expected.tasks };
  });
  const artifactHashes = (field) => taskRecords
    .map((record) => record[field])
    .filter(Boolean)
    .map(({ sha256, bytes, gitBlobSha1 }) => ({ sha256, bytes, gitBlobSha1 }));
  const body = {
    schema: LIBERO_SCHEMAS.deepProjection,
    source: baseProjection.source,
    baseManifest: {
      schema: baseProjection.schema,
      projectionHash: baseProjection.projectionHash,
      sourceTaskEntries: baseProjection.denominator.sourceTaskEntries,
      executionClassification: baseProjection.executionEvidence.classification,
      outcome: baseProjection.executionEvidence.outcome,
    },
    extractionPolicy: {
      id: "outsider/libero-deep-byte-commitments-only",
      version: "1.0.0",
      retained: ["reviewed-source-and-license-commitments", "suite-identifiers",
        "complete-file-and-byte-denominators", "hashed-task-identifiers",
        "per-task-bddl-byte-commitments", "per-task-init-state-byte-commitments",
        "role-bounded-reality-weight", "manifest-only-execution-states"],
      removed: ["task-language", "task-names", "repository-file-paths",
        "bddl-source-text", "init-state-payloads", "base64-payloads",
        "deserialized-pickle-values", "demonstrations", "observations", "actions",
        "images", "videos", "models", "trajectories", "filesystem-paths"],
    },
    evidenceRoleWeighting: {
      classification:
        "REAL_PUBLIC_SIMULATOR_SOURCE_HIGH_WEIGHT_FOR_TASK/STATE_SCHEMA",
      publicSourceClassification: "REAL_PUBLIC_SOURCE",
      substrate: "LIBERO_SIMULATOR_BENCHMARK",
      scale: "ROLE_BOUND_ORDINAL_V1",
      taskDefinitionSchemaWeight: "HIGH",
      initialStateArtifactSchemaWeight: "HIGH",
      physicalWorldObservationWeight: "NONE",
      outsiderExecutionOutcomeWeight: "NONE",
      outsiderCausalExperienceWeight: "NONE",
      crossRoleWeightTransferAllowed: false,
      highSchemaWeightDoesNotMeanBenchmarkExecuted: true,
      highSchemaWeightDoesNotEstablishPhysicalReality: true,
    },
    authority: {
      mode: "QUARANTINE_TASK_AND_STATE_SCHEMA_ONLY",
      admission: builtIn ? "ADMITTED_TASK_AND_STATE_SCHEMA_ONLY"
        : "TEST_FIXTURE_ONLY",
      sourcePinAuthority: builtIn ? "BUILT_IN_REVIEWED_DEEP_PIN"
        : "CALLER_SUPPLIED_TEST_FIXTURE_DEEP_PIN",
      immutableOfficialCommitPinned: builtIn,
      exactOfficialRecursiveTreeBytesReplayed: builtIn,
      exactSelectedGitBlobBytesReplayed: builtIn,
      fixtureTreeAndBlobBytesMatchedCallerPin: !builtIn,
      completeSelectedFileAndByteDenominatorsEstablished: true,
      bddlSemanticAstParsed: false,
      initStatePayloadDeserialized: false,
      untrustedPickleExecutionPerformed: false,
      commitSignatureVerified: false,
      publisherIdentityCryptographicallyVerified: false,
      benchmarkWasRun: false,
      benchmarkOutcomeEstablished: false,
      simulatorTelemetryPresent: false,
      physicalWorldOutcomeEstablished: false,
      physicalSafetyEstablished: false,
      productionReliabilityEstablished: false,
      causalEffectEstablished: false,
      modelTrainingAuthorizedByOutsider: false,
      rawDatasetRedistributionAuthorizedByOutsider: false,
    },
    license: {
      status: builtIn
        ? "PINNED_DECLARATIONS_REPLAYED_DEEP_SCOPE_REQUIRES_INDEPENDENT_REVIEW"
        : "CALLER_ASSERTED_TEST_FIXTURE_ONLY",
      sourceCodeSpdx: basePin.codeLicenseSpdx,
      declaredDatasetSpdx: basePin.demonstrationDatasetLicenseSpdx,
      pinnedDeclarationEvidenceReplayed: builtIn,
      bddlAndInitSpecificLicenseAssignmentExplicitInPinnedText: false,
      rawDeepFilesRedistributedInProjection: false,
      licenseBoundary: deepPin.licenseBoundary,
      expandedUseRequiresIndependentReview: true,
    },
    privacy: {
      rawSourceRetainedInProjection: false,
      rawTaskLanguageRetained: false,
      rawTaskNamesRetained: false,
      repositoryFilePathsRetained: false,
      bddlSourceTextRetained: false,
      initStatePayloadsRetained: false,
      base64PayloadsRetained: false,
      deserializedPickleValuesRetained: false,
      filesystemPathsRetained: false,
      demonstrationsOrTrajectoriesRetained: false,
      observationsOrActionsRetained: false,
    },
    denominator: {
      repositoryTreeEntries: tree.repositoryTreeEntries,
      sourceNamespaceBlobEntries: deepPin.expectedCoverage.sourceNamespaceBlobEntries,
      selectedSourceFiles: deepPin.expectedCoverage.selectedSourceFiles,
      selectedSourceBytes: deepPin.expectedCoverage.selectedSourceBytes,
      bddlDefinitions: deepPin.expectedCoverage.bddlDefinitions,
      bddlBytes: deepPin.expectedCoverage.bddlBytes,
      prunedInitStateFiles: deepPin.expectedCoverage.prunedInitStateFiles,
      prunedInitStateBytes: deepPin.expectedCoverage.prunedInitStateBytes,
      fullInitStateFiles: deepPin.expectedCoverage.fullInitStateFiles,
      fullInitStateBytes: deepPin.expectedCoverage.fullInitStateBytes,
      unselectedTaskIndexFiles: deepPin.expectedCoverage.unselectedTaskIndexFiles,
      omittedSelectedSourceFiles: 0,
      taskArtifactRecords: taskRecords.length,
      manifestOnlyNotRun: taskRecords.length,
      noOutcome: taskRecords.length,
      executionRecordsPresent: 0,
      suiteDenominators,
    },
    commitments: {
      deepPinHash: deepPin.pinHash,
      recursiveTreeBytesHash: digest(treeBytes),
      replayBundleBytesHash: digest(bundleBytes),
      bddlSetHash: digest({ domain: "libero/bddl-byte-set/v1",
        artifacts: artifactHashes("bddl") }),
      prunedInitStateSetHash: digest({ domain: "libero/pruned-init-byte-set/v1",
        artifacts: artifactHashes("prunedInitState") }),
      fullInitStateSetHash: digest({ domain: "libero/full-init-byte-set/v1",
        artifacts: artifactHashes("fullInitState") }),
      taskArtifactSetHash: digest({ domain: "libero/deep-task-artifact-set/v1",
        commitments: taskRecords.map((record) => record.taskArtifactCommitmentHash) }),
    },
    manifests: { taskRecords },
    executionEvidence: {
      classification: "NOT_RUN",
      outcome: "NO_OUTCOME",
      recordsPresent: 0,
      attempted: 0,
      completed: 0,
      pass: 0,
      fail: 0,
      error: 0,
      missingOutcome: taskRecords.length,
    },
    observability: {
      taskIdentityCommitted: true,
      suiteMembershipCommitted: true,
      bddlDefinitionBytesCommitted: true,
      initStateArtifactBytesCommitted: true,
      bddlSemanticsExecuted: false,
      initialStatesLoadedOrObserved: false,
      simulatorResetObserved: false,
      targetIdentityObserved: false,
      workspaceBoundaryObserved: false,
      forceObserved: false,
      energyObserved: false,
      taskSuccessPredicateObserved: false,
      rolloutTerminationObserved: false,
    },
  };
  return Object.freeze({ ...body, projectionHash: digest(body) });
}

export function verifyLiberoDeepManifestProjection(projection, {
  taskMapBytes = null, benchmarkBytes = null, readmeBytes = null,
  licenseBytes = null, sourceTreeBytes = null, sourceByteBundleBytes = null,
  trustedPin = null, trustedDeepPin = null } = {}) {
  try {
    const keys = ["schema", "source", "baseManifest", "extractionPolicy",
      "evidenceRoleWeighting", "authority", "license", "privacy", "denominator",
      "commitments", "manifests", "executionEvidence", "observability",
      "projectionHash"];
    if (!exactKeys(projection, keys)
      || projection.schema !== LIBERO_SCHEMAS.deepProjection
      || !HASH.test(String(projection.projectionHash ?? ""))) {
      return { ok: false, error: "LIBERO_DEEP_PROJECTION_SHAPE_INVALID" };
    }
    const { projectionHash, ...body } = projection;
    if (projectionHash !== digest(body)) {
      return { ok: false, error: "LIBERO_DEEP_PROJECTION_HASH_INVALID" };
    }
    const inputs = [taskMapBytes, benchmarkBytes, readmeBytes, licenseBytes,
      sourceTreeBytes, sourceByteBundleBytes];
    if (inputs.some((value) => value == null)) {
      return { ok: false, error: "LIBERO_DEEP_SOURCE_BYTES_REQUIRED" };
    }
    const source = sourceForReplay(projection.source, trustedPin);
    const rebuilt = createLiberoDeepManifestProjection({ taskMapBytes,
      benchmarkBytes, readmeBytes, licenseBytes, sourceTreeBytes,
      sourceByteBundleBytes, source, trustedPin, trustedDeepPin });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(projection)) {
      return { ok: false, error: "LIBERO_DEEP_PROJECTION_REPLAY_INVALID" };
    }
    return { ok: true, projectionHash, sourceBytesReplayed: true,
      admission: projection.authority.admission,
      taskArtifactRecords: projection.denominator.taskArtifactRecords,
      selectedSourceFiles: projection.denominator.selectedSourceFiles,
      selectedSourceBytes: projection.denominator.selectedSourceBytes,
      executionClassification: "NOT_RUN", outcome: "NO_OUTCOME" };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
