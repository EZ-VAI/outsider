#!/usr/bin/env node
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, openSync,
  readSync, writeFileSync } from "node:fs";
import {
  LIBERO_DATASET,
  LIBERO_MAX_DEEP_BUNDLE_BYTES,
  LIBERO_MAX_DEEP_TREE_BYTES,
  LIBERO_MAX_SOURCE_BYTES,
  createLiberoDeepManifestProjection,
  createLiberoManifestProjection,
  verifyLiberoDeepManifestProjection,
  verifyLiberoManifestProjection,
} from "../src/outsider-libero-ingress.js";

const BASE_REQUIRED = Object.freeze([
  "--task-map-input", "--benchmark-input", "--readme-input", "--license-input",
  "--revision", "--output",
]);
const DEEP = Object.freeze(["--source-tree-input", "--source-byte-bundle-input"]);
const ALLOWED = Object.freeze([...BASE_REQUIRED, ...DEEP]);

function options(argv) {
  if (argv.length % 2 !== 0) throw new Error("LIBERO_CLI_ARGUMENTS_INVALID");
  const values = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED.includes(key) || Object.hasOwn(values, key)
      || typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error("LIBERO_CLI_ARGUMENTS_INVALID");
    }
    values[key] = value;
  }
  if (!BASE_REQUIRED.every((key) => Object.hasOwn(values, key))
    || DEEP.some((key) => Object.hasOwn(values, key))
      !== DEEP.every((key) => Object.hasOwn(values, key))) {
    throw new Error("LIBERO_CLI_ARGUMENTS_INVALID");
  }
  return values;
}

function boundedStableRead(path, label, maximum = LIBERO_MAX_SOURCE_BYTES) {
  let descriptor;
  try {
    try {
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      throw new Error(`LIBERO_${label}_INPUT_FILE_INVALID`);
    }
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(maximum)) {
      throw new Error(`LIBERO_${label}_INPUT_FILE_INVALID`);
    }
    const output = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < output.length) {
      const count = readSync(descriptor, output, offset, output.length - offset, null);
      if (count === 0) throw new Error(`LIBERO_${label}_INPUT_CHANGED_DURING_READ`);
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) {
      throw new Error(`LIBERO_${label}_INPUT_CHANGED_DURING_READ`);
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs) {
      throw new Error(`LIBERO_${label}_INPUT_CHANGED_DURING_READ`);
    }
    return output;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exclusivePrivateWrite(path, value) {
  let descriptor;
  try {
    try {
      descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT
        | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    } catch {
      throw new Error("LIBERO_OUTPUT_CREATE_INVALID");
    }
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, value);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

try {
  const args = options(process.argv.slice(2));
  const input = {
    taskMapBytes: boundedStableRead(args["--task-map-input"], "TASK_MAP"),
    benchmarkBytes: boundedStableRead(args["--benchmark-input"], "BENCHMARK"),
    readmeBytes: boundedStableRead(args["--readme-input"], "README"),
    licenseBytes: boundedStableRead(args["--license-input"], "LICENSE"),
  };
  const deep = DEEP.every((key) => Object.hasOwn(args, key));
  if (deep) {
    input.sourceTreeBytes = boundedStableRead(args["--source-tree-input"],
      "DEEP_TREE", LIBERO_MAX_DEEP_TREE_BYTES);
    input.sourceByteBundleBytes = boundedStableRead(
      args["--source-byte-bundle-input"], "DEEP_BUNDLE",
      LIBERO_MAX_DEEP_BUNDLE_BYTES);
  }
  const source = { datasetId: LIBERO_DATASET, revision: args["--revision"] };
  const projection = deep
    ? createLiberoDeepManifestProjection({ ...input, source })
    : createLiberoManifestProjection({ ...input, source });
  const verification = deep
    ? verifyLiberoDeepManifestProjection(projection, input)
    : verifyLiberoManifestProjection(projection, input);
  if (!verification.ok) throw new Error(verification.error);
  exclusivePrivateWrite(args["--output"], `${JSON.stringify(projection, null, 2)}\n`);
  const summary = {
    outputCreated: true, projectionHash: projection.projectionHash,
    admission: projection.authority.admission,
    manifestOnlyNotRun: projection.denominator.manifestOnlyNotRun,
    executionClassification: projection.executionEvidence.classification,
    outcome: projection.executionEvidence.outcome,
  };
  if (deep) {
    summary.artifactClass = projection.evidenceRoleWeighting.classification;
    summary.taskArtifactRecords = projection.denominator.taskArtifactRecords;
    summary.selectedSourceFiles = projection.denominator.selectedSourceFiles;
    summary.selectedSourceBytes = projection.denominator.selectedSourceBytes;
  } else {
    summary.sourceTaskEntries = projection.denominator.sourceTaskEntries;
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exitCode = 2;
}
