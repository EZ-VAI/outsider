import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  MCP_TRAJECTORY_ID, MCP_TRAJECTORY_PROFILE, MCP_TRAJECTORY_REVISION,
  acquirePinnedMcpTrajectorySource, buildMcpTrajectoryArtifactFromSource,
  mcpTrajectoryArtifactHash, verifyMcpTrajectoryArtifact,
  verifyMcpTrajectorySourceDirectory,
} from "../src/outsider-mcp-agent-trajectory-benchmark.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-mcp-agent-trajectory-benchmark-20260829-v3");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "mcp-agent-trajectory-benchmark.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:c9a7a9f56559345ee5baf2b335988e46c3acf823f3d04fd1b9f9c085f3015d29";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:eb2ad2786fc8d4e5d3573bf9c9a9ef562988da031bfe1a87d6cb6782601fe91d";
const EXPECTED_SOURCE_ROOT =
  "sha256:f1e23b684af638d97d6c4bb4982e83c1008c5fca225afc5cf7f4bfa8e0fadc1e";
const EXPECTED_MANIFEST_HASH =
  "sha256:98d7c4b5ae6ccac7897fa935b2d7d20404ff0a13a6aadd5e23211cc3b5bdd0cc";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function artifact() {
  assert.equal(existsSync(REPORT_PATH), true);
  return readJson(REPORT_PATH);
}

function walk(root) {
  const files = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    for (const entry of readdirSync(directories[index], { withFileTypes: true })) {
      const child = path.join(directories[index], entry.name);
      assert.equal(entry.isSymbolicLink(), false, child);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) files.push(child);
      else assert.fail(`special file refused: ${child}`);
    }
  }
  return { files, directories };
}

test("the public MCP benchmark revision and full repository profile are fixed", () => {
  assert.equal(MCP_TRAJECTORY_ID, "obaydata/mcp-agent-trajectory-benchmark");
  assert.equal(MCP_TRAJECTORY_REVISION,
    "f4f449d65271abc1e4ccd5157d121a59a1dd38c4");
  assert.deepEqual(MCP_TRAJECTORY_PROFILE, {
    usedStorage: 13_507, treeEntries: 501, treeDirectories: 88,
    treeFiles: 413, treeBytes: 3_605_902,
    publisherClaimedTrajectories: 49,
    publisherClaimedSinglePass: 38,
    publisherClaimedMultiConversation: 11,
  });
});

test("the acquirer refuses an existing directory before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "mcp-trajectory-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedMcpTrajectorySource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /MCP_TRAJECTORY_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("record, tree and every one of 413 files bind before and after", () => {
  const verified = verifyMcpTrajectorySourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel, "PINNED_FULL_413_FILE_REPOSITORY_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 413);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 3_605_902);
  assert.deepEqual(verified.manifest.closure, {
    completePublishedFileCensus: true,
    executablePayloadsExecuted: 0,
    extensionBytes: {
      ".gitattributes": 2_504, ".json": 2_735_933, ".jsonl": 37_564,
      ".md": 206_211, ".py": 623_690,
    },
    extensionCounts: {
      ".gitattributes": 1, ".json": 50, ".jsonl": 42,
      ".md": 279, ".py": 41,
    },
    fullFixedRepository: true, globallyExhaustive: false,
    licenseFilesPresent: 0, licensePaths: [],
    multiConversationTrajectoryFiles: 11,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreeDirectories: 88, recursiveTreeEntries: 501,
    recursiveTreeFiles: 413,
    recursiveTreeHash:
      "sha256:62c20c986a01d135748d4d9080dbbe2c252027b751791d2681b0046127b04064",
    recursiveTreePagesPerPhase: 1,
    selectedBytes: 3_605_902, selectedObjects: 413,
    standardTrajectoryFiles: 38, trajectoryFiles: 49,
  });
});

test("all valid ATIF, JSONL, tool calls, results and train crosswalks replay", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(value.replay.allRepositoryBytesRead, true);
  assert.equal(value.replay.filesRead, 413);
  assert.equal(value.replay.bytesRead, 3_605_902);
  assert.deepEqual({ ...value.replay.trajectories,
    aggregateStandardToolNames: undefined, fileReplay: undefined }, {
    aggregateStandardToolNames: undefined, fileReplay: undefined,
    files: 49, standardFiles: 38, multiConversationFiles: 11,
    parsedTrajectoryFiles: 48, malformedJsonFiles: 1,
    sessionLikeRootUnits: 54, standardSteps: 519,
    standardToolCalls: 282, standardToolResults: 282,
    standardMatchedResults: 282, standardUnmatchedCalls: 0,
    standardUnmatchedResults: 0, standardLastStepComplete: 38,
    multiObservedToolCalls: 36, multiObservedToolResults: 41,
    publisherSuccessTrue: 18, publisherSuccessFalse: 3,
    filesWithPublisherSuccessLabels: 4,
    filesWithRecoveryLinkFields: 0, filesWithJudgeLikeFields: 0,
  });
  const standard = value.replay.trajectories.fileReplay.filter((entry) =>
    entry.classification === "STANDARD_ATIF_V1_2");
  assert.equal(standard.length, 38);
  assert.equal(standard.every((entry) => entry.jsonParsed
    && entry.atif.schemaVersion === "ATIF-v1.2"
    && entry.atif.sequentialStepIds
    && entry.atif.toolCalls === entry.atif.toolResults
    && entry.atif.matchedResults === entry.atif.toolCalls
    && entry.atif.unmatchedCalls === 0 && entry.atif.unmatchedResults === 0
    && entry.atif.lastStepTurnComplete), true);
  assert.deepEqual({ ...value.replay.jsonl, filesReplay: undefined,
    trainCrosswalk: undefined }, {
    files: 42, conversationFiles: 41, conversationRecords: 205,
    trainRows: 38, filesReplay: undefined, trainCrosswalk: undefined,
  });
  assert.deepEqual({ ...value.replay.jsonl.trainCrosswalk, domains: undefined }, {
    rows: 38, summaryJsonParsed: 38, embeddedConversationJsonlParsed: 38,
    exactTopLevelTrajectoryFound: 38, sessionIdMatches: 38,
    modelMatches: 38, stepCountMatches: 38, toolCallCountMatches: 38,
    exactConversationMatches: 38, domains: undefined,
  });
  assert.deepEqual({ ...value.replay.python, filesReplay: undefined }, {
    files: 41, bytes: 623_690, totalDefinitions: 433,
    totalToolDecorators: 0, executedFiles: 0, filesReplay: undefined,
  });
  assert.deepEqual(value.replay.markdown,
    { files: 279, bytes: 206_211, workspaceConfigs: 274 });
});

test("publisher 49 means files, while malformed JSON and labels retain missingness", () => {
  const value = artifact();
  assert.deepEqual(value.countAdjudication, {
    denominator: "PUBLISHED_TRAJECTORY_FILES",
    multiConversationFiles: 11, publishedTrajectoryFiles: 49,
    publisher49IsNotSessionLikeRootUnitCount: true,
    publisher49MatchesTrajectoryFileCount: true,
    publisherClaimedTrajectories: 49, sessionLikeRootUnits: 54,
    standardAtifFiles: 38,
  });
  const malformed = value.replay.trajectories.fileReplay.filter((entry) =>
    !entry.jsonParsed);
  assert.equal(malformed.length, 1);
  assert.equal(malformed[0].path, "multi_conv/finclaw_export/trajectory.json");
  assert.equal(malformed[0].classification, "PUBLISHER_MULTI_CONV_MALFORMED_JSON");
  assert.equal(malformed[0].byteHash,
    "sha256:fee1baee3463d314dd1cf4dad30acebd8c7e6d9634e5aacd1a14460d76c91bee");
  assert.match(malformed[0].parseError, /Bad control character/u);
  assert.deepEqual(value.replay.otherJson[0].publisherProjection, {
    absoluteSourceDirectoryPresent: true, absoluteTargetDirectoryPresent: true,
    archivedFileNames: 13, privacyCleanedClaim: true,
    successCount: 13, totalFiles: 13,
  });
  assert.equal(value.missingness.malformedTrajectoryJsonFiles, 1);
  assert.equal(value.missingness.publisherSuccessTrueLabels, 18);
  assert.equal(value.missingness.publisherSuccessFalseLabels, 3);
  assert.equal(value.missingness.publisherSuccessLabelsAreIndependentOutcomes, false);
  assert.equal(value.missingness.publisherArchiveSuccessCountIsIndependentOutcome,
    false);
  assert.equal(value.missingness.publisherArchivePrivacyCleanedClaimResolvesPrivacy,
    false);
});

test("code stays inert and rights, privacy, outcome and authority remain bounded", () => {
  const value = artifact();
  assert.deepEqual(value.executionSafety, {
    commandsExecuted: 0, mcpServersStarted: 0, networkActionsReplayed: 0,
    parseMode: "INERT_BYTES_JSON_JSONL_AND_LEXICAL_SOURCE_ONLY",
    pythonFilesExecuted: 0, pythonFilesPresent: 41, toolPayloadsExecuted: 0,
  });
  assert.deepEqual(value.rights, {
    datasetCardLicenseClaim: "Apache-2.0",
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    productionTrainingAuthorized: false,
    readmeYamlLicenseClaim: "Apache-2.0",
    repositoryLicenseFilePresent: false,
    rightsFinallyAdjudicatedForTraining: false,
  });
  assert.equal(value.privacy.rawArtifactPrivate, true);
  assert.equal(value.privacy.userConversationContentPresent, true);
  assert.equal(value.privacy.financialContentPresent, true);
  assert.equal(value.privacy.healthContentPresent, true);
  assert.equal(value.privacy.absoluteFilesystemPathsPresentInPublisherArchiveReport,
    true);
  assert.equal(value.privacy.privacyReviewComplete, false);
  assert.equal(value.privacy.noPiiEstablished, false);
  assert.equal(value.privacy.rawConversationTextRepublishedInReport, false);
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 0, authority: 0, delegation: 0, externalEffect: 0,
    independentOutcome: 0, network: 0, privacy: 0, recovery: 0,
    reliableOutcome: 0, training: 0,
  });
});

test("self-resealing cannot execute payloads or promote outcome, privacy or rights", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.executionSafety.pythonFilesExecuted = 1; },
    (value) => { value.executionSafety.toolPayloadsExecuted = 1; },
    (value) => { value.missingness.independentOutcome = 1; },
    (value) => { value.missingness.pairedFailureRecovery = 1; },
    (value) => { value.missingness.publisherSuccessLabelsAreIndependentOutcomes = true; },
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.network = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.rights.productionTrainingAuthorized = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = mcpTrajectoryArtifactHash(body);
    assert.equal(verifyMcpTrajectoryArtifact(changed).ok, false);
  }
});

test("the artifact rebuilds exactly and all raw files remain private", () => {
  const original = artifact();
  const rebuilt = buildMcpTrajectoryArtifactFromSource(SOURCE_DIRECTORY);
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyMcpTrajectoryArtifact(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.verification.verificationLevel,
    "FULL_413_FILE_INERT_SCHEMA_AND_TRACE_REPLAY");
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.files.length, 420);
  assert.equal(tree.directories.every((entry) => (statSync(entry).mode & 0o077) === 0),
    true);
  assert.equal(tree.files.every((entry) => (statSync(entry).mode & 0o077) === 0), true);
});
