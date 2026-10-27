/*
 * Source-bound AgentHorizon reciprocal sibling pair.
 *
 * Two publisher-positive GUI executions are retained with their complete
 * screenshot directories. Two publisher-negative items reuse those same
 * executions under the opposite sibling instructions. The negative label is
 * an instruction/trajectory alignment classification, not an execution or
 * physical-side-effect observation.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const PathRelative = path.relative;
const PathResolve = path.resolve;

export const AGENTHORIZON_RECIPROCAL_PAIR_SCHEMA =
  "outsider/agenthorizon-reciprocal-sibling-pair/v1";
export const AGENTHORIZON_RECIPROCAL_PAIR_RECEIPT_SCHEMA =
  "outsider/agenthorizon-reciprocal-sibling-pair-receipt/v1";
export const AGENTHORIZON_DATASET_ID = "ServiceNow/AgentHorizon";
export const AGENTHORIZON_REVISION =
  "a16cbf7b4e9f2aa06b0588b0ef917789efe40f7c";
export const AGENTHORIZON_RECIPROCAL_PAIR_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN =
  "outsider/agenthorizon-reciprocal-sibling-pair-report/v1";
const RECEIPT_DOMAIN =
  "outsider/agenthorizon-reciprocal-sibling-pair-receipt/v1";
const MANIFEST_DOMAIN =
  "outsider/agenthorizon-reciprocal-sibling-pair-source-manifest/v1";
const SOURCE_ROOT_DOMAIN =
  "outsider/agenthorizon-reciprocal-sibling-pair-source-root/v1";
const MAX_METADATA_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:28b5f6046e8240f376156f0cda465c9155a5cace545a5b64eb6c148a4e3b653e";

const POSITIVE_A = Object.freeze({
  trajectoryId: "025cd638-e8b0-4d22-a4a7-9e0c2e087752",
  instructionId: "000232524-232524-0000-000000232524",
  stepsId: "000232524-232524-0000-000000232524",
  pairRole: "child", steps: 124, imageFiles: 124,
  imageBytes: 25_099_605,
});
const POSITIVE_B = Object.freeze({
  trajectoryId: "a95a7b6c-0c60-4ffb-b176-366f3ce81a47",
  instructionId: "000233042-233042-0000-000000233042",
  stepsId: "000233042-233042-0000-000000233042",
  pairRole: "parent", steps: 122, imageFiles: 122,
  imageBytes: 25_102_888,
});
const NEGATIVE_AB = Object.freeze({
  trajectoryId: "1c943fde-068b-428d-bc78-97c72dd9d188",
  instructionId: POSITIVE_A.instructionId,
  instructionSource: "child",
  stepsId: POSITIVE_B.stepsId,
  stepsSource: "parent",
});
const NEGATIVE_BA = Object.freeze({
  trajectoryId: "43ef425a-212f-41fb-86fe-aec2a2f8c1a2",
  instructionId: POSITIVE_B.instructionId,
  instructionSource: "parent",
  stepsId: POSITIVE_A.stepsId,
  stepsSource: "child",
});
const SELECTED = Object.freeze([
  POSITIVE_A, POSITIVE_B, NEGATIVE_AB, NEGATIVE_BA,
]);

const SUPPORT_PATHS = Object.freeze([
  ".gitattributes", "AgentHorizon.jsonl", "README.md",
  "sandbox/.gitkeep", "sandbox/AGENTS.md", "sandbox/CLAUDE.md",
]);
const JSON_PATHS = Object.freeze(SELECTED.map((item) =>
  `sandbox/data/jsons/${item.trajectoryId}.json`));
const MARKDOWN_PATHS = Object.freeze(SELECTED.map((item) =>
  `sandbox/data/markdowns/${item.trajectoryId}.md`));
const REQUIRED_RECORD_PATHS = Object.freeze([
  ...SUPPORT_PATHS, ...JSON_PATHS, ...MARKDOWN_PATHS,
]);

const KNOWN_TEXT = Object.freeze({
  "AgentHorizon.jsonl": Object.freeze({ bytes: 163_456,
    sha256: "sha256:66d2d9502180f2120c0833bf93392ba93de03eedb56aeaa901a4fa1628b721a9" }),
  "README.md": Object.freeze({ bytes: 5_829,
    sha256: "sha256:88b71544fd8b090226c3c2195b5f38322db7d5744d44439571979a0e50a90a90" }),
  [JSON_PATHS[0]]: Object.freeze({ bytes: 48_184,
    sha256: "sha256:14d185d20edbc39dd07518b064f5f527ac98a2526ddc3a7b256463de02f550a4" }),
  [JSON_PATHS[1]]: Object.freeze({ bytes: 47_530,
    sha256: "sha256:98a8df89777e9c53bad178d6abf9cc60f9bc79de507d32762764ad72ba491114" }),
  [JSON_PATHS[2]]: Object.freeze({ bytes: 47_534,
    sha256: "sha256:121cffc970400c1eb7a751eeb4dcab36f51b7ab17cd3f72c90387b6ec260dc0c" }),
  [JSON_PATHS[3]]: Object.freeze({ bytes: 48_180,
    sha256: "sha256:c020fa0f2b7da7ca51f828bd13009b532e199a63ce9ecf4c4d82f14c3c8224ec" }),
});

const TREE_PROFILES = Object.freeze({
  [POSITIVE_A.stepsId]: Object.freeze({ entries: 124, bytes: 25_099_605,
    pages: 2, canonicalSha256:
      "sha256:e1cea7c7ff02da1deed6d42cdae8220ded7bec369a7b55db0335842732a08539" }),
  [POSITIVE_B.stepsId]: Object.freeze({ entries: 122, bytes: 25_102_888,
    pages: 2, canonicalSha256:
      "sha256:80b2e83b25c96ca61993e069cefb8d1fa42612c9bae90b00f5be2c76f2ce8954" }),
});
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json",
  ...["after", "before"].flatMap((when) =>
    [POSITIVE_A.stepsId, POSITIVE_B.stepsId].flatMap((stepsId) =>
      [1, 2].map((page) => `selected-tree-${stepsId}-${when}-page${page}.json`))),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTHORIZON_RECIPROCAL_PAIR_${code}`
    : `AGENTHORIZON_RECIPROCAL_PAIR_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseJson(bytes, code) {
  try { return JSONParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code); }
}

function checkedPath(root, relative) {
  if (typeof relative !== "string" || relative.length === 0
    || relative.includes("\0")) fail("PATH_INVALID");
  const base = PathResolve(root);
  const target = PathResolve(base, relative);
  const relation = PathRelative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}

function checkedRegular(root, relative, maximumBytes, exactBytes = null,
  allowEmpty = false) {
  const target = checkedPath(root, relative);
  const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o600
    || !allowEmpty && status.size < 1n || status.size > BigInt(maximumBytes)
    || exactBytes !== null && status.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  return { target, status };
}

function readRegular(root, relative, maximumBytes, exactBytes = null,
  allowEmpty = false) {
  const { target } = checkedRegular(root, relative, maximumBytes, exactBytes,
    allowEmpty);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size) {
      fail("FILE_CHANGED_DURING_READ", relative);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function hashRegular(root, relative, maximumBytes, exactBytes) {
  const { target } = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    let total = 0;
    while (true) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      hash.update(chunk.subarray(0, count));
      total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(total) !== after.size) {
      fail("FILE_CHANGED_DURING_READ", relative);
    }
    return { bytes: total, sha256: `sha256:${hash.digest("hex")}` };
  } finally { closeSync(descriptor); }
}

function walk(root, prefix = "") {
  const directory = prefix === "" ? root : checkedPath(root, prefix);
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) {
    fail("DIRECTORY_UNSAFE", prefix);
  }
  const result = [];
  for (const name of sorted(readdirSync(directory))) {
    const relative = prefix === "" ? name : `${prefix}/${name}`;
    const child = lstatSync(checkedPath(root, relative), { bigint: true });
    if (child.isSymbolicLink()) fail("SYMLINK_FORBIDDEN", relative);
    if (child.isDirectory()) result.push(...walk(root, relative));
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) {
      result.push(relative);
    } else fail("SOURCE_ENTRY_UNSAFE", relative);
  }
  return result;
}

function recordProjection(bytes) {
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const siblings = value.siblings;
  if (!Array.isArray(siblings)) fail("RECORD_SIBLINGS_INVALID");
  const paths = siblings.map((entry) => entry?.rfilename);
  if (paths.some((entry) => typeof entry !== "string" || entry.length === 0)
    || new Set(paths).size !== paths.length) fail("RECORD_SIBLING_PATH_INVALID");
  const pathSet = new Set(paths);
  for (const required of REQUIRED_RECORD_PATHS) {
    if (!pathSet.has(required)) fail("REQUIRED_SIBLING_MISSING", required);
  }
  const licenseFiles = paths.filter((entry) =>
    /(^|\/)(licen[cs]e|copying)(\.|$)/iu.test(entry));
  const licenseTags = (value.tags ?? []).filter((entry) =>
    typeof entry === "string" && entry.startsWith("license:"));
  const ordered = sorted(paths);
  const result = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, siblingCount: paths.length,
    siblingPathRoot: sha256(BufferFrom(canonicalizeStrict(ordered), "utf8")),
    cardLicense: value.cardData?.license ?? null,
    promptPathPresent: pathSet.has("sandbox/prompt.md"),
    licenseTags, licenseFiles,
  };
  if (result.id !== AGENTHORIZON_DATASET_ID || result.author !== "ServiceNow"
    || result.sha !== AGENTHORIZON_REVISION
    || result.lastModified !== "2026-06-09T01:52:11.000Z"
    || result.private !== false || result.gated !== false
    || result.disabled !== false || result.usedStorage !== 42_822_925_824
    || result.siblingCount !== 99_144 || result.cardLicense !== null
    || result.promptPathPresent !== false
    || result.licenseTags.length !== 0 || result.licenseFiles.length !== 0) {
    fail("RECORD_PROFILE_INVALID");
  }
  return result;
}

function treeProjection(pageBytes, stepsId) {
  const profile = TREE_PROFILES[stepsId];
  const values = pageBytes.flatMap((bytes) => {
    const page = parseJson(bytes, "TREE_PAGE_JSON_INVALID");
    if (!Array.isArray(page)) fail("TREE_PAGE_INVALID");
    return page;
  });
  const entries = values.map((entry) => ({
    path: entry?.path, type: entry?.type, size: entry?.size,
    oid: entry?.oid, lfsOid: entry?.lfs?.oid ?? null,
    lfsSize: entry?.lfs?.size ?? null, xetHash: entry?.xetHash ?? null,
  })).sort((left, right) => left.path < right.path ? -1 : 1);
  const prefix = `sandbox/data/media/images/${stepsId}/step_`;
  const numbers = [];
  for (const entry of entries) {
    const match = new RegExp(`^${prefix}([1-9][0-9]*)[.]png$`, "u")
      .exec(entry.path ?? "");
    if (entry.type !== "file" || match === null
      || !Number.isSafeInteger(entry.size) || entry.size < 1
      || entry.lfsSize !== entry.size
      || !/^[a-f0-9]{40}$/u.test(entry.oid ?? "")
      || !/^[a-f0-9]{64}$/u.test(entry.lfsOid ?? "")
      || !/^[a-f0-9]{64}$/u.test(entry.xetHash ?? "")) {
      fail("TREE_ENTRY_INVALID", entry.path);
    }
    numbers.push(Number(match[1]));
  }
  numbers.sort((left, right) => left - right);
  const expectedNumbers = Array.from({ length: profile.entries },
    (_, index) => index + 1);
  if (entries.length !== profile.entries
    || entries.reduce((sum, entry) => sum + entry.size, 0) !== profile.bytes
    || !same(numbers, expectedNumbers)
    || sha256(BufferFrom(canonicalizeStrict(entries), "utf8"))
      !== profile.canonicalSha256) fail("TREE_PROFILE_INVALID", stepsId);
  return { entries };
}

function treeMetadataNames(stepsId, when) {
  return [1, 2].map((page) =>
    `selected-tree-${stepsId}-${when}-page${page}.json`);
}

function parseLabelFile(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("LABEL_UTF8_INVALID"); }
  if (!text.endsWith("\n")) fail("LABEL_FINAL_NEWLINE_MISSING");
  const rows = text.slice(0, -1).split("\n").map((line) => {
    try { return JSONParse(line); } catch { fail("LABEL_ROW_JSON_INVALID"); }
  });
  const keys = ["instruction_id", "instruction_source", "label", "mistake_type",
    "steps_id", "steps_source", "trajectory_id"];
  const identities = new Set();
  let positive = 0;
  let negative = 0;
  const byTrajectory = new Map();
  for (const row of rows) {
    if (!same(Object.keys(row).sort(), keys)
      || typeof row.trajectory_id !== "string" || identities.has(row.trajectory_id)) {
      fail("LABEL_ROW_SCHEMA_INVALID");
    }
    identities.add(row.trajectory_id);
    byTrajectory.set(row.trajectory_id, row);
    if (row.label === "positive") positive += 1;
    else if (row.label === "negative") negative += 1;
    else fail("LABEL_VALUE_INVALID");
  }
  if (rows.length !== 605 || positive !== 287 || negative !== 318) {
    fail("LABEL_CENSUS_INVALID");
  }
  const positiveIds = new Set(rows.filter((row) => row.label === "positive")
    .map((row) => row.steps_id));
  const negativesWithBothPositiveEndpoints = rows.filter((row) =>
    row.label === "negative" && positiveIds.has(row.instruction_id)
      && positiveIds.has(row.steps_id)).length;
  if (negativesWithBothPositiveEndpoints !== 33) {
    fail("LABEL_ENDPOINT_CENSUS_INVALID");
  }
  return { rows, byTrajectory, positive, negative,
    negativesWithBothPositiveEndpoints };
}

function selectedLabelReplay(labels) {
  const positiveRows = [POSITIVE_A, POSITIVE_B].map((expected) => {
    const row = labels.byTrajectory.get(expected.trajectoryId);
    if (!same(row, {
      trajectory_id: expected.trajectoryId, label: "positive",
      instruction_id: expected.instructionId, instruction_source: "",
      steps_id: expected.stepsId, steps_source: "", mistake_type: "",
    })) fail("POSITIVE_LABEL_INVALID", expected.trajectoryId);
    return row;
  });
  const negativeRows = [NEGATIVE_AB, NEGATIVE_BA].map((expected) => {
    const row = labels.byTrajectory.get(expected.trajectoryId);
    if (!same(row, {
      trajectory_id: expected.trajectoryId, label: "negative",
      instruction_id: expected.instructionId,
      instruction_source: expected.instructionSource,
      steps_id: expected.stepsId, steps_source: expected.stepsSource,
      mistake_type: "Bad Side Effect",
    })) fail("NEGATIVE_LABEL_INVALID", expected.trajectoryId);
    return row;
  });
  return { positiveRows, negativeRows };
}

function validateSteps(value, expectedStepsId, expectedCount) {
  if (!Array.isArray(value.steps) || value.steps.length !== expectedCount) {
    fail("STEP_COUNT_INVALID", value.trajectory_id);
  }
  const expectedScreens = [];
  for (let index = 0; index < value.steps.length; index += 1) {
    const step = value.steps[index];
    const screenshot = `../media/images/${expectedStepsId}/step_${index + 1}.png`;
    if (step?.step_id !== index || step?.screenshot !== screenshot
      || typeof step.action !== "object" || step.action === null) {
      fail("STEP_PROFILE_INVALID", value.trajectory_id);
    }
    expectedScreens.push(screenshot);
  }
  return expectedScreens;
}

function markdownScreens(bytes, expectedScreens, code) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(`${code}_UTF8_INVALID`); }
  const found = [...text.matchAll(/\.\.\/media\/images\/[0-9-]+\/step_[0-9]+[.]png/gu)]
    .map((match) => match[0]);
  if (!same(found, expectedScreens)) fail(`${code}_SCREENSHOT_LINKS_INVALID`);
}

function replaySelected(root, labels) {
  const jsons = new Map();
  for (const item of SELECTED) {
    const relative = `files/sandbox/data/jsons/${item.trajectoryId}.json`;
    const value = parseJson(readRegular(root, relative, MAX_TEXT_BYTES),
      "SELECTED_JSON_INVALID");
    if (value.trajectory_id !== item.trajectoryId
      || !value.task || typeof value.task.instruction !== "string"
      || !value.environment || typeof value.environment !== "object") {
      fail("SELECTED_JSON_PROFILE_INVALID", item.trajectoryId);
    }
    jsons.set(item.trajectoryId, value);
  }
  const posA = jsons.get(POSITIVE_A.trajectoryId);
  const posB = jsons.get(POSITIVE_B.trajectoryId);
  const negAB = jsons.get(NEGATIVE_AB.trajectoryId);
  const negBA = jsons.get(NEGATIVE_BA.trajectoryId);
  const screensA = validateSteps(posA, POSITIVE_A.stepsId, POSITIVE_A.steps);
  const screensB = validateSteps(posB, POSITIVE_B.stepsId, POSITIVE_B.steps);
  validateSteps(negAB, POSITIVE_B.stepsId, POSITIVE_B.steps);
  validateSteps(negBA, POSITIVE_A.stepsId, POSITIVE_A.steps);
  if (!same(negAB.task, posA.task) || !same(negAB.environment, posB.environment)
    || !same(negAB.steps, posB.steps)
    || !same(negBA.task, posB.task) || !same(negBA.environment, posA.environment)
    || !same(negBA.steps, posA.steps)) fail("RECIPROCAL_SWAP_INVALID");

  const expectedByTrajectory = new Map([
    [POSITIVE_A.trajectoryId, screensA], [POSITIVE_B.trajectoryId, screensB],
    [NEGATIVE_AB.trajectoryId, screensB], [NEGATIVE_BA.trajectoryId, screensA],
  ]);
  for (const item of SELECTED) {
    const relative = `files/sandbox/data/markdowns/${item.trajectoryId}.md`;
    markdownScreens(readRegular(root, relative, MAX_TEXT_BYTES),
      expectedByTrajectory.get(item.trajectoryId), "MARKDOWN");
  }

  const labelReplay = selectedLabelReplay(labels);
  const identity = (value) => sha256(BufferFrom(value, "utf8"));
  const execution = (positive, json) => ({
    positiveTrajectoryHash: identity(positive.trajectoryId),
    pairRole: positive.pairRole,
    instructionIdHash: identity(positive.instructionId),
    stepsIdHash: identity(positive.stepsId),
    publisherLabel: "positive", publisherSuccessfulExecutionClaim: true,
    steps: positive.steps, screenshotFiles: positive.imageFiles,
    screenshotBytes: positive.imageBytes,
    taskShapeHash: digest("agenthorizon/task-shape/v1", json.task),
    stepsShapeHash: digest("agenthorizon/steps-shape/v1", json.steps),
  });
  const mismatch = (negative, instructionPositive, stepsPositive) => ({
    negativeTrajectoryHash: identity(negative.trajectoryId),
    instructionFromPositiveTrajectoryHash: identity(instructionPositive.trajectoryId),
    stepsFromPositiveTrajectoryHash: identity(stepsPositive.trajectoryId),
    instructionSource: negative.instructionSource,
    stepsSource: negative.stepsSource,
    publisherLabel: "negative", publisherMistakeType: "Bad Side Effect",
    semanticClass: "INSTRUCTION_TRAJECTORY_ALIGNMENT_MISMATCH",
    newUnderlyingExecutionIntroduced: false,
  });
  return {
    mainSplitRows: labels.rows.length,
    mainSplitPublisherLabels: { positive: labels.positive, negative: labels.negative },
    mainNegativeRowsWithBothEndpointPositives:
      labels.negativesWithBothPositiveEndpoints,
    selectedLabelRows: labelReplay.positiveRows.length + labelReplay.negativeRows.length,
    underlyingPublisherPositiveExecutions: 2,
    selectedPublisherPositiveRows: 2, selectedPublisherNegativeRows: 2,
    executions: [execution(POSITIVE_A, posA), execution(POSITIVE_B, posB)],
    reciprocalAlignmentNegatives: [
      mismatch(NEGATIVE_AB, POSITIVE_A, POSITIVE_B),
      mismatch(NEGATIVE_BA, POSITIVE_B, POSITIVE_A),
    ],
    reciprocalCrossSwapByteStructureVerified: true,
    markdownScreenshotClosureVerified: true,
    rawInstructionsActionsScreenshotsProjected: false,
  };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/agenthorizon-reciprocal-sibling-pair-source-manifest/v1",
    datasetId: AGENTHORIZON_DATASET_ID, revision: AGENTHORIZON_REVISION,
    selectedLabelRows: 4, underlyingExecutions: 2,
    completeImageDirectories: [POSITIVE_A.stepsId, POSITIVE_B.stepsId],
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const metadata = new Map();
  const entries = [];
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length,
      sha256: sha256(bytes) });
  }
  const recordBefore = recordProjection(metadata.get("dataset-record-before.json"));
  const recordAfter = recordProjection(metadata.get("dataset-record-after.json"));
  if (!same(recordBefore, recordAfter)) fail("MATERIAL_RECORD_STATE_CHANGED");
  const trees = new Map();
  for (const stepsId of [POSITIVE_A.stepsId, POSITIVE_B.stepsId]) {
    const before = treeProjection(treeMetadataNames(stepsId, "before")
      .map((name) => metadata.get(name)), stepsId);
    const after = treeProjection(treeMetadataNames(stepsId, "after")
      .map((name) => metadata.get(name)), stepsId);
    if (!same(before, after)) fail("MATERIAL_SELECTED_TREE_STATE_CHANGED", stepsId);
    trees.set(stepsId, before);
  }
  const imagePaths = [...trees.values()].flatMap((tree) =>
    tree.entries.map((entry) => entry.path));
  const expected = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    ...SUPPORT_PATHS.map((file) => `files/${file}`),
    ...JSON_PATHS.map((file) => `files/${file}`),
    ...MARKDOWN_PATHS.map((file) => `files/${file}`),
    ...imagePaths.map((file) => `files/${file}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");

  let selectedPayloadBytes = 0;
  for (const relative of [...SUPPORT_PATHS, ...JSON_PATHS, ...MARKDOWN_PATHS]) {
    const bytes = readRegular(root, `files/${relative}`, MAX_TEXT_BYTES, null,
      relative === "sandbox/.gitkeep");
    const known = KNOWN_TEXT[relative];
    if (known && (bytes.length !== known.bytes || sha256(bytes) !== known.sha256)) {
      fail("KNOWN_TEXT_PIN_INVALID", relative);
    }
    selectedPayloadBytes += bytes.length;
    entries.push({ path: `files/${relative}`, bytes: bytes.length,
      sha256: sha256(bytes) });
  }
  const labelBytes = readRegular(root, "files/AgentHorizon.jsonl", MAX_TEXT_BYTES,
    KNOWN_TEXT["AgentHorizon.jsonl"].bytes);
  const labels = parseLabelFile(labelBytes);

  let imageBytes = 0;
  let imageFiles = 0;
  for (const tree of trees.values()) {
    for (const item of tree.entries) {
      const relative = `files/${item.path}`;
      const measured = hashRegular(root, relative, MAX_IMAGE_BYTES, item.size);
      if (measured.sha256 !== `sha256:${item.lfsOid}`) {
        fail("IMAGE_LFS_PIN_INVALID", item.path);
      }
      const header = readRegular(root, relative, item.size, item.size)
        .subarray(0, 8);
      if (!header.equals(BufferFrom([137,80,78,71,13,10,26,10]))) {
        fail("IMAGE_PNG_HEADER_INVALID", item.path);
      }
      imageBytes += measured.bytes;
      imageFiles += 1;
      entries.push({ path: relative, ...measured });
    }
  }
  if (imageBytes !== POSITIVE_A.imageBytes + POSITIVE_B.imageBytes
    || imageFiles !== POSITIVE_A.imageFiles + POSITIVE_B.imageFiles) {
    fail("IMAGE_CENSUS_INVALID");
  }
  selectedPayloadBytes += imageBytes;
  const replay = replaySelected(root, labels);
  return { root, entries, record: recordBefore, trees, replay,
    selectedPayloadBytes, imageBytes, imageFiles };
}

export function createAgentHorizonReciprocalPairSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

export function buildAgentHorizonReciprocalPairArtifactFromSourceDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  if (sourceManifest.sourceManifestHash !== EXPECTED_SOURCE_MANIFEST_HASH) {
    fail("SOURCE_MANIFEST_PIN_INVALID", sourceManifest.sourceManifestHash);
  }
  const stored = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const reportBody = {
    schema: AGENTHORIZON_RECIPROCAL_PAIR_SCHEMA,
    disposition: AGENTHORIZON_RECIPROCAL_PAIR_DISPOSITION,
    source: {
      datasetId: AGENTHORIZON_DATASET_ID, revision: AGENTHORIZON_REVISION,
      lastModified: collected.record.lastModified,
      public: true, gated: false,
      fixedRevisionUsedStorageBytes: collected.record.usedStorage,
      fixedRevisionSiblingPaths: collected.record.siblingCount,
      fixedRevisionSiblingPathRoot: collected.record.siblingPathRoot,
      exactRecordSiblingInventory: true,
      fullTreeMetadataInventoried: false,
      fullRepositoryPayloadAcquired: false,
      selectedImageSubtreesFullyInventoried: true,
      selectedSubtreeTreePagesPerSnapshot: 4,
      selectedSubtreeTreeSnapshots: 2,
      selectedSubtreeEntries: collected.imageFiles,
      selectedSubtreeBytes: collected.imageBytes,
      materialRecordAndSelectedTreeStateStable: true,
      readmePromptPathClaimPresent: true,
      fixedRevisionPromptPathPresent: collected.record.promptPathPresent,
      readmePromptPathClaimMatchesFixedRevisionRecord: false,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    selection: {
      split: "main", completeMainLabelFileAcquired: true,
      mainSplitRows: 605,
      selectedSiblingPairLabelRows: 4,
      selectedPublisherPositiveRows: 2,
      selectedPublisherNegativeRows: 2,
      distinctUnderlyingExecutions: 2,
      completeSelectedJsonFiles: 4, completeSelectedMarkdownFiles: 4,
      completeSelectedImageDirectories: 2,
      completeSelectedScreenshotFiles: collected.imageFiles,
      completeSelectedScreenshotBytes: collected.imageBytes,
      selectedSourcePayloadBytes: collected.selectedPayloadBytes,
      reciprocalCrossSwapClosure: true,
      representativenessEstablished: false,
      fullDatasetExhausted: false,
    },
    replay: collected.replay,
    semantics: {
      positiveMeaning: "PUBLISHER_SUCCESSFUL_EXECUTION_CLAIM",
      negativeMeaning: "INSTRUCTION_TRAJECTORY_ALIGNMENT_FAILURE",
      negativePublisherMistakeType: "Bad Side Effect",
      negativeMistakeTypeIsObservedPhysicalSideEffect: false,
      negativeRowsAreNewExecutions: false,
      negativeRowsReusePublisherPositiveSteps: true,
      reciprocalSiblingInstructionsDiffer: true,
      recoverySequenceEstablished: false,
    },
    denominators: {
      FIXED_REVISION_SIBLING_PATHS: collected.record.siblingCount,
      MAIN_SPLIT_LABEL_ROWS: 605,
      MAIN_SPLIT_PUBLISHER_POSITIVE_ROWS: 287,
      MAIN_SPLIT_PUBLISHER_NEGATIVE_ROWS: 318,
      MAIN_NEGATIVE_ROWS_WITH_BOTH_ENDPOINT_POSITIVES: 33,
      SELECTED_LABEL_ROWS: 4,
      SELECTED_UNDERLYING_EXECUTIONS: 2,
      SELECTED_SCREENSHOT_FILES: collected.imageFiles,
      crossSplitAdditionProhibited: true,
    },
    outcome: {
      publisherSuccessfulExecutionClaimRows: 2,
      publisherAlignmentFailureRows: 2,
      independentOutcomeRows: 0,
      actualExecutionFailureRows: 0,
      observedPhysicalSideEffectRows: 0,
      realWorldOutcomeRows: 0, longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0,
      publisherLabelsIndependentlyRerun: false,
    },
    rights: {
      datasetCardLicenseClaim: null,
      datasetApiLicenseTagPresent: false,
      datasetLicenseFilePresent: false,
      rightsDisposition: "FAIL_CLOSED",
      useSpecificTrainingAuthorizationEstablished: false,
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawScreenshotFiles: collected.imageFiles,
      rawSelectedJsonFiles: 4, rawSelectedMarkdownFiles: 4,
      rawSourcePrivate: true, noPiiGuaranteed: false,
      rawInstructionsActionsScreenshotsProjected: false,
      rawProjectionRows: 0,
      projectedIdentifiersAreOneWaySha256: true,
    },
    boundary: {
      softwareAgentExecutionRows: 2,
      publisherOutcomeRows: 2, publisherAlignmentFailureRows: 2,
      independentOutcomeRows: 0, actualExecutionFailureRows: 0,
      physicalEffectRows: 0, realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0, recoveryEpisodeRows: 0,
      preActionDelegationRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, pricingRows: 0,
      authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createAgentHorizonReciprocalPairReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: AGENTHORIZON_RECIPROCAL_PAIR_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: AGENTHORIZON_RECIPROCAL_PAIR_DISPOSITION,
    selectedLabelRows: 4, underlyingExecutions: 2,
    publisherOutcomeRows: 2, publisherAlignmentFailureRows: 2,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyAgentHorizonReciprocalPairArtifactDirectory(directory) {
  try {
    const root = PathResolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)),
        ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const built = buildAgentHorizonReciprocalPairArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createAgentHorizonReciprocalPairReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) {
      fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    }
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeAgentHorizonReciprocalPairArtifact(value) {
  return serialize(value);
}

export const AGENTHORIZON_SELECTED_TRAJECTORIES = SELECTED;
export const AGENTHORIZON_SELECTED_SUPPORT_PATHS = SUPPORT_PATHS;
