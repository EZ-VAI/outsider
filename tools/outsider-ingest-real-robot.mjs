#!/usr/bin/env node
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, openSync,
  readSync, writeFileSync } from "node:fs";
import {
  BRIDGEDATA_V2_DATASET,
  REAL_ROBOT_SOURCE_BYTE_LIMITS,
  createRealRobotObservationProjection,
  verifyRealRobotObservationProjection,
} from "../src/outsider-real-robot-ingress.js";

const INPUTS = Object.freeze({
  "--project-page-input": ["projectPageBytes", "projectPage"],
  "--trajectory-index-input": ["trajectoryIndexBytes", "trajectoryIndex"],
  "--dataset-info-input": ["datasetInfoBytes", "datasetInfo"],
  "--features-input": ["featuresBytes", "features"],
  "--action-proprio-stats-input": ["actionProprioStatsBytes", "actionProprioStats"],
  "--code-readme-input": ["codeReadmeBytes", "codeReadme"],
  "--code-license-input": ["codeLicenseBytes", "codeLicense"],
  "--sample-initial-input": ["sampleInitialBytes", "sampleInitial"],
  "--sample-final-input": ["sampleFinalBytes", "sampleFinal"],
});
const REQUIRED = Object.freeze([...Object.keys(INPUTS), "--revision", "--output"]);

function options(argv) {
  if (argv.length !== REQUIRED.length * 2) {
    throw new Error("REAL_ROBOT_CLI_ARGUMENTS_INVALID");
  }
  const values = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!REQUIRED.includes(key) || Object.hasOwn(values, key)
      || typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error("REAL_ROBOT_CLI_ARGUMENTS_INVALID");
    }
    values[key] = value;
  }
  if (!REQUIRED.every((key) => Object.hasOwn(values, key))) {
    throw new Error("REAL_ROBOT_CLI_ARGUMENTS_INVALID");
  }
  return values;
}

function boundedStableRead(path, key) {
  let descriptor;
  const label = key.replaceAll(/([A-Z])/gu, "_$1").toUpperCase();
  try {
    try {
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      throw new Error(`REAL_ROBOT_${label}_INPUT_FILE_INVALID`);
    }
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(REAL_ROBOT_SOURCE_BYTE_LIMITS[key])) {
      throw new Error(`REAL_ROBOT_${label}_INPUT_FILE_INVALID`);
    }
    const output = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < output.length) {
      const count = readSync(descriptor, output, offset, output.length - offset, null);
      if (count === 0) {
        throw new Error(`REAL_ROBOT_${label}_INPUT_CHANGED_DURING_READ`);
      }
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) {
      throw new Error(`REAL_ROBOT_${label}_INPUT_CHANGED_DURING_READ`);
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs) {
      throw new Error(`REAL_ROBOT_${label}_INPUT_CHANGED_DURING_READ`);
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
      throw new Error("REAL_ROBOT_OUTPUT_CREATE_INVALID");
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
  const input = Object.fromEntries(Object.entries(INPUTS).map(([argument,
    [property, key]]) => [property, boundedStableRead(args[argument], key)]));
  const projection = createRealRobotObservationProjection({
    ...input,
    source: { datasetId: BRIDGEDATA_V2_DATASET,
      repositoryRevision: args["--revision"], datasetVersion: "1.0.0" },
  });
  const verification = verifyRealRobotObservationProjection(projection, input);
  if (!verification.ok) throw new Error(verification.error);
  exclusivePrivateWrite(args["--output"], `${JSON.stringify(projection, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    outputCreated: true,
    projectionHash: projection.projectionHash,
    observationRealityClass:
      projection.evidentiaryWeight.observationRealityClass,
    publisherClaimedTrajectories:
      projection.coverage.publisherPage.claimedTrajectories,
    tfdsMetadataExamples: projection.coverage.tfdsMetadata.totalExamples,
    browserIndexRows: projection.coverage.publicTrajectoryBrowserIndex.rows,
    replayedCameraFrames:
      projection.coverage.replayedObservationSubset.cameraFrames,
    ownOutsiderOutcome: false,
    targetPriorEstablished: false,
    pricingAuthorityEstablished: false,
  })}\n`);
} catch (error) {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exitCode = 2;
}
