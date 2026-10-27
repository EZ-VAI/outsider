#!/usr/bin/env node
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, openSync,
  lstatSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import {
  PUBLIC_REALITY_SOURCE_BYTE_LIMITS,
  createPublicRealityEvidenceRegistry,
  verifyPublicRealityEvidenceRegistry,
} from "../src/outsider-public-reality-evidence.js";

const INPUTS = Object.freeze({
  "--bridge-project-page-input": ["bridgeData", "projectPageBytes",
    "bridgeProjectPage"],
  "--bridge-trajectory-index-input": ["bridgeData", "trajectoryIndexBytes",
    "bridgeTrajectoryIndex"],
  "--bridge-dataset-info-input": ["bridgeData", "datasetInfoBytes",
    "bridgeDatasetInfo"],
  "--bridge-features-input": ["bridgeData", "featuresBytes",
    "bridgeFeatures"],
  "--bridge-action-proprio-stats-input": ["bridgeData",
    "actionProprioStatsBytes", "bridgeActionProprioStats"],
  "--bridge-code-readme-input": ["bridgeData", "codeReadmeBytes",
    "bridgeCodeReadme"],
  "--bridge-code-license-input": ["bridgeData", "codeLicenseBytes",
    "bridgeCodeLicense"],
  "--bridge-sample-initial-input": ["bridgeData", "sampleInitialBytes",
    "bridgeSampleInitial"],
  "--bridge-sample-final-input": ["bridgeData", "sampleFinalBytes",
    "bridgeSampleFinal"],
  "--libero-task-map-input": ["libero", "taskMapBytes", "liberoTaskMap"],
  "--libero-benchmark-input": ["libero", "benchmarkBytes", "liberoBenchmark"],
  "--libero-readme-input": ["libero", "readmeBytes", "liberoReadme"],
  "--libero-license-input": ["libero", "licenseBytes", "liberoLicense"],
  "--libero-source-tree-input": ["libero", "sourceTreeBytes",
    "liberoSourceTree"],
  "--libero-source-byte-bundle-input": ["libero", "sourceByteBundleBytes",
    "liberoSourceByteBundle"],
});

const REQUIRED = Object.freeze([...Object.keys(INPUTS), "--output"]);

function options(argv) {
  if (argv.length !== REQUIRED.length * 2) {
    throw new Error("PUBLIC_REALITY_CLI_ARGUMENTS_INVALID");
  }
  const values = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!REQUIRED.includes(key) || Object.hasOwn(values, key)
      || typeof value !== "string" || value.length === 0
      || value.startsWith("--")) {
      throw new Error("PUBLIC_REALITY_CLI_ARGUMENTS_INVALID");
    }
    values[key] = value;
  }
  if (!REQUIRED.every((key) => Object.hasOwn(values, key))) {
    throw new Error("PUBLIC_REALITY_CLI_ARGUMENTS_INVALID");
  }
  if (!REQUIRED.every((key) => isAbsolute(values[key]))) {
    throw new Error("PUBLIC_REALITY_CLI_PATH_NOT_ABSOLUTE");
  }
  const paths = Object.keys(INPUTS).map((key) => values[key]);
  if (new Set([...paths, values["--output"]]).size !== paths.length + 1) {
    throw new Error("PUBLIC_REALITY_CLI_INPUT_PATH_DUPLICATE");
  }
  return values;
}

function boundedStableRead(path, key) {
  let descriptor;
  const limit = PUBLIC_REALITY_SOURCE_BYTE_LIMITS[key];
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("PUBLIC_REALITY_INTERNAL_INPUT_LIMIT_INVALID");
  }
  try {
    try {
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      throw new Error(`PUBLIC_REALITY_${key.toUpperCase()}_INPUT_FILE_INVALID`);
    }
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(limit)) {
      throw new Error(`PUBLIC_REALITY_${key.toUpperCase()}_INPUT_FILE_INVALID`);
    }
    const output = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < output.length) {
      const count = readSync(descriptor, output, offset, output.length - offset, null);
      if (count === 0) {
        throw new Error(`PUBLIC_REALITY_${key.toUpperCase()}_INPUT_CHANGED_DURING_READ`);
      }
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) {
      throw new Error(`PUBLIC_REALITY_${key.toUpperCase()}_INPUT_CHANGED_DURING_READ`);
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs) {
      throw new Error(`PUBLIC_REALITY_${key.toUpperCase()}_INPUT_CHANGED_DURING_READ`);
    }
    return output;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exclusivePrivateWrite(path, value) {
  let descriptor;
  let parentDescriptor;
  const parent = dirname(path);
  let parentStat;
  try { parentStat = lstatSync(parent); }
  catch { throw new Error("PUBLIC_REALITY_OUTPUT_PARENT_INVALID"); }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error("PUBLIC_REALITY_OUTPUT_PARENT_INVALID");
  }
  const resolvedParent = realpathSync(parent);
  const resolvedPath = join(resolvedParent, basename(path));
  try {
    try {
      descriptor = openSync(resolvedPath, constants.O_WRONLY | constants.O_CREAT
        | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    } catch {
      throw new Error("PUBLIC_REALITY_OUTPUT_CREATE_INVALID");
    }
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, value);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    parentDescriptor = openSync(resolvedParent,
      constants.O_RDONLY | constants.O_NOFOLLOW);
    fsyncSync(parentDescriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (parentDescriptor !== undefined) closeSync(parentDescriptor);
  }
}

try {
  const args = options(process.argv.slice(2));
  const input = { bridgeData: {}, libero: {} };
  for (const [argument, [group, property, limitKey]] of Object.entries(INPUTS)) {
    input[group][property] = boundedStableRead(args[argument], limitKey);
  }
  const registry = createPublicRealityEvidenceRegistry(input);
  const verification = verifyPublicRealityEvidenceRegistry(registry, input);
  if (!verification.ok) throw new Error(verification.error);
  exclusivePrivateWrite(args["--output"], `${JSON.stringify(registry, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    outputCreated: true,
    registryHash: registry.registryHash,
    definitionHash: registry.definition.definitionHash,
    sourceCount: registry.summary.sourceCount,
    receiptCount: registry.summary.receiptCount,
    highWeightReceiptCount: registry.summary.highWeightReceiptCount,
    highWeightClaimsBySource: registry.summary.highWeightClaimsBySource,
    sourceBytesReplayedThisInvocation: true,
    scalarScore: null,
    authority: "none",
  })}\n`);
} catch (error) {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exitCode = 2;
}
