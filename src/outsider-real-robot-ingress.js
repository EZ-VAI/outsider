import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { canonicalizeStrict } from "./canonical.js";

export const REAL_ROBOT_SCHEMAS = Object.freeze({
  sourcePin: "outsider/real-robot-source-pin/v1",
  source: "outsider/real-robot-source/v1",
  projection: "outsider/real-robot-observation-projection/v1",
});

export const BRIDGEDATA_V2_DATASET =
  "rail-berkeley/BridgeData-V2/TFDS-1.0.0";

export const REAL_ROBOT_SOURCE_BYTE_LIMITS = Object.freeze({
  projectPage: 256 * 1024,
  trajectoryIndex: 16 * 1024 * 1024,
  datasetInfo: 256 * 1024,
  features: 256 * 1024,
  actionProprioStats: 64 * 1024,
  codeReadme: 256 * 1024,
  codeLicense: 64 * 1024,
  sampleInitial: 512 * 1024,
  sampleFinal: 512 * 1024,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/u;
const SAFE_PATH = /^raw\/[A-Za-z0-9_.+/-]+\.jpg$/u;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const FILE_KEYS = Object.freeze(Object.keys(REAL_ROBOT_SOURCE_BYTE_LIMITS));
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype", "toString"]);

export function hashRealRobotValue(value) {
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

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function sourceBytes(value, label, limit) {
  const bytes = Buffer.isBuffer(value) ? Buffer.from(value)
    : value instanceof Uint8Array ? Buffer.from(value)
      : typeof value === "string" ? Buffer.from(value) : null;
  if (!bytes || bytes.length === 0 || bytes.length > limit) {
    throw new Error(`REAL_ROBOT_${label}_SIZE_INVALID`);
  }
  return bytes;
}

function text(bytes, label) {
  let value;
  try { value = UTF8.decode(bytes); }
  catch { throw new Error(`REAL_ROBOT_${label}_UTF8_INVALID`); }
  if (value.includes("\0")) throw new Error(`REAL_ROBOT_${label}_NUL_INVALID`);
  return value;
}

const DATA_ROOT =
  "https://rail.eecs.berkeley.edu/datasets/bridge_release/";
const TFDS_ROOT = `${DATA_ROOT}data/tfds/bridge_dataset/1.0.0/`;
const REPOSITORY_REVISION = "bc60a35b701a12021c8c95e9d8601274d3acd928";

const OFFICIAL_FILES = Object.freeze({
  projectPage: Object.freeze({
    role: "PUBLISHER_DATASET_DESCRIPTION_AND_DATA_LICENSE",
    url: "https://rail-berkeley.github.io/bridgedata/",
    sha256: "sha256:9be7a758ab24782955a6fa4145bbed80527671939e4f40dff70e22ee9b69c580",
    bytes: 31_252,
    pathDisclosure: "PUBLIC_NON_TRAJECTORY_URL",
  }),
  trajectoryIndex: Object.freeze({
    role: "PUBLISHER_TRAJECTORY_BROWSER_INDEX",
    url: "https://rail-berkeley.github.io/bridgedata/traj_links.csv",
    sha256: "sha256:a9c971ba2dbd3b5f55fa091bf1873f26d1ded6fd06d3808f9497f68bb6729567",
    bytes: 12_303_955,
    pathDisclosure: "PUBLIC_INDEX_URL_RAW_ROWS_REDACTED",
  }),
  datasetInfo: Object.freeze({
    role: "TFDS_1_0_0_DATASET_INFO",
    url: `${TFDS_ROOT}dataset_info.json`,
    sha256: "sha256:977f2efb2a4be1d839b0b67b9cae8f2007568a1da689ad170f1b72846dc54653",
    bytes: 17_009,
    pathDisclosure: "PUBLIC_NON_TRAJECTORY_URL",
  }),
  features: Object.freeze({
    role: "TFDS_1_0_0_FEATURE_SCHEMA",
    url: `${TFDS_ROOT}features.json`,
    sha256: "sha256:b1b139dc3d48bc71b1f01552f6ad267fc35527cb756dbea4b089a44d6d128c4f",
    bytes: 14_194,
    pathDisclosure: "PUBLIC_NON_TRAJECTORY_URL",
  }),
  actionProprioStats: Object.freeze({
    role: "ACTION_PROPRIO_AGGREGATE_STATISTICS_OPAQUE_VARIANT",
    url: `${TFDS_ROOT}action_proprio_stats_7d6a416829d818b733e7342f225f3c522a8265a5224e0175f2ab28e26a932ff1.json`,
    sha256: "sha256:1d22ea6845cea045ba9f09f86b142039a165bf049c7d9578000e464d88ecb860",
    bytes: 1_254,
    pathDisclosure: "PUBLIC_NON_TRAJECTORY_URL",
  }),
  codeReadme: Object.freeze({
    role: "PINNED_CODE_README_DATA_LINKAGE",
    url: `https://raw.githubusercontent.com/rail-berkeley/bridge_data_v2/${REPOSITORY_REVISION}/README.md`,
    sha256: "sha256:495f26dbfea53876db3f470e7b8a04901962e9e86b170d65aa7408536945ff7b",
    bytes: 6_902,
    pathDisclosure: "PUBLIC_NON_TRAJECTORY_URL",
  }),
  codeLicense: Object.freeze({
    role: "PINNED_CODE_LICENSE",
    url: `https://raw.githubusercontent.com/rail-berkeley/bridge_data_v2/${REPOSITORY_REVISION}/LICENSE`,
    sha256: "sha256:8c891a7dd06fdaa873aa011ff0b2773a3ccfe6d123f6b9a9fc589db718aec1d1",
    bytes: 1_091,
    pathDisclosure: "PUBLIC_NON_TRAJECTORY_URL",
  }),
  sampleInitial: Object.freeze({
    role: "DETERMINISTIC_TRAJECTORY_INITIAL_CAMERA_FRAME",
    url: `${DATA_ROOT}raw/rss/toykitchen7/pnp_sweep_target_fixed/00/2023-03-01_11-34-36/raw/traj_group0/traj253/images0/im_0.jpg`,
    sha256: "sha256:36937b5a339a11e3296da928c5a5edff19712ba04a4b93d3ae994665b75d08cb",
    bytes: 120_503,
    pathDisclosure: "RAW_TRAJECTORY_PATH_REDACTED_FROM_PROJECTION",
  }),
  sampleFinal: Object.freeze({
    role: "DETERMINISTIC_TRAJECTORY_FINAL_CAMERA_FRAME",
    url: `${DATA_ROOT}raw/rss/toykitchen7/pnp_sweep_target_fixed/00/2023-03-01_11-34-36/raw/traj_group0/traj253/images0/im_27.jpg`,
    sha256: "sha256:0e01dd9fa8164bf4bb8ec93815f232069fda5eb7d38f5106cd3eb101297e42f1",
    bytes: 120_524,
    pathDisclosure: "RAW_TRAJECTORY_PATH_REDACTED_FROM_PROJECTION",
  }),
});

const OFFICIAL_EXPECTED_COVERAGE = Object.freeze({
  projectPageTrajectories: 60_096,
  projectPageTeleoperated: 50_365,
  projectPageScripted: 9_731,
  projectPageEnvironments: 24,
  projectPageSkills: 13,
  tfdsTrainExamples: 53_192,
  tfdsValExamples: 6_872,
  tfdsTotalExamples: 60_064,
  tfdsTrainBytes: 117_084_911_456,
  tfdsValBytes: 15_401_054_101,
  tfdsTrainShards: 1_024,
  tfdsValShards: 128,
  trajectoryIndexRows: 43_592,
  uniqueTrajectoryPathPairs: 43_592,
  sampleOrdinal: 0,
  imageWidth: 640,
  imageHeight: 480,
  actionDimension: 7,
  proprioDimension: 7,
});

const OFFICIAL_PIN_BODY = Object.freeze({
  schema: REAL_ROBOT_SCHEMAS.sourcePin,
  scope: "BUILT_IN_REVIEWED_PUBLIC_SOURCE",
  datasetId: BRIDGEDATA_V2_DATASET,
  repositoryUrl: "https://github.com/rail-berkeley/bridge_data_v2",
  repositoryRevision: REPOSITORY_REVISION,
  repositoryRevisionUrl:
    `https://github.com/rail-berkeley/bridge_data_v2/commit/${REPOSITORY_REVISION}`,
  datasetVersion: "1.0.0",
  sourceRootUrl: DATA_ROOT,
  files: OFFICIAL_FILES,
  dataLicenseSpdx: "CC-BY-4.0",
  codeLicenseSpdx: "MIT",
  licenseScope: "PINNED_PROJECT_PAGE_DATA_DECLARATION_AND_PINNED_INGESTED_BYTES",
  expectedCoverage: OFFICIAL_EXPECTED_COVERAGE,
});

export const BRIDGEDATA_V2_OFFICIAL_PIN = Object.freeze({
  ...OFFICIAL_PIN_BODY,
  pinHash: hashRealRobotValue(OFFICIAL_PIN_BODY),
});

export const REAL_ROBOT_SOURCE_PINS = Object.freeze({
  [BRIDGEDATA_V2_OFFICIAL_PIN.repositoryRevision]: BRIDGEDATA_V2_OFFICIAL_PIN,
});

function validFileRecord(value, key) {
  return exactKeys(value, ["role", "url", "sha256", "bytes", "pathDisclosure"])
    && /^[A-Z][A-Z0-9_]+$/u.test(String(value.role ?? ""))
    && /^https:\/\//u.test(String(value.url ?? ""))
    && HASH.test(String(value.sha256 ?? ""))
    && positiveInteger(value.bytes)
    && value.bytes <= REAL_ROBOT_SOURCE_BYTE_LIMITS[key]
    && ["PUBLIC_NON_TRAJECTORY_URL", "PUBLIC_INDEX_URL_RAW_ROWS_REDACTED",
      "RAW_TRAJECTORY_PATH_REDACTED_FROM_PROJECTION"].includes(value.pathDisclosure);
}

const COVERAGE_KEYS = Object.freeze(Object.keys(OFFICIAL_EXPECTED_COVERAGE));

function validatePin(pin, { custom = false } = {}) {
  const keys = ["schema", "scope", "datasetId", "repositoryUrl",
    "repositoryRevision", "repositoryRevisionUrl", "datasetVersion",
    "sourceRootUrl", "files", "dataLicenseSpdx", "codeLicenseSpdx",
    "licenseScope", "expectedCoverage", "pinHash"];
  if (!exactKeys(pin, keys)) throw new Error("REAL_ROBOT_SOURCE_PIN_SHAPE_INVALID");
  const { pinHash, ...body } = pin;
  const coverage = pin.expectedCoverage;
  if (pin.schema !== REAL_ROBOT_SCHEMAS.sourcePin
    || pinHash !== hashRealRobotValue(body)
    || typeof pin.datasetId !== "string" || pin.datasetId.length === 0
    || !/^https:\/\//u.test(String(pin.repositoryUrl ?? ""))
    || !COMMIT.test(String(pin.repositoryRevision ?? ""))
    || !/^https:\/\//u.test(String(pin.repositoryRevisionUrl ?? ""))
    || !VERSION.test(String(pin.datasetVersion ?? ""))
    || !/^https:\/\//u.test(String(pin.sourceRootUrl ?? ""))
    || !pin.sourceRootUrl.endsWith("/")
    || !exactKeys(pin.files, FILE_KEYS)
    || !FILE_KEYS.every((key) => validFileRecord(pin.files[key], key))
    || pin.dataLicenseSpdx !== "CC-BY-4.0"
    || pin.codeLicenseSpdx !== "MIT"
    || pin.licenseScope
      !== "PINNED_PROJECT_PAGE_DATA_DECLARATION_AND_PINNED_INGESTED_BYTES"
    || !exactKeys(coverage, COVERAGE_KEYS)
    || !COVERAGE_KEYS.every((key) => nonnegativeInteger(coverage[key]))
    || coverage.projectPageTrajectories
      !== coverage.projectPageTeleoperated + coverage.projectPageScripted
    || coverage.tfdsTotalExamples
      !== coverage.tfdsTrainExamples + coverage.tfdsValExamples
    || coverage.trajectoryIndexRows <= 0
    || coverage.uniqueTrajectoryPathPairs <= 0
    || coverage.sampleOrdinal >= coverage.trajectoryIndexRows
    || coverage.imageWidth <= 0 || coverage.imageHeight <= 0
    || coverage.actionDimension <= 0 || coverage.proprioDimension <= 0) {
    throw new Error("REAL_ROBOT_SOURCE_PIN_INVALID");
  }
  if (custom) {
    if (pin.scope !== "TEST_FIXTURE_ONLY"
      || pin.datasetId === BRIDGEDATA_V2_DATASET) {
      throw new Error("REAL_ROBOT_CUSTOM_PIN_SCOPE_INVALID");
    }
  } else if (pin.scope !== "BUILT_IN_REVIEWED_PUBLIC_SOURCE"
    || pinHash !== BRIDGEDATA_V2_OFFICIAL_PIN.pinHash) {
    throw new Error("REAL_ROBOT_BUILTIN_PIN_INVALID");
  }
  return pin;
}

function normalizeInput(input) {
  const output = Object.create(null);
  for (const key of FILE_KEYS) {
    output[key] = sourceBytes(input[`${key}Bytes`], key.toUpperCase(),
      REAL_ROBOT_SOURCE_BYTE_LIMITS[key]);
  }
  return output;
}

function normalizeSource(source, input, trustedPin = null) {
  if (!exactKeys(source, ["datasetId", "repositoryRevision", "datasetVersion"])) {
    throw new Error("REAL_ROBOT_SOURCE_SHAPE_INVALID");
  }
  const pin = validatePin(trustedPin
    ?? REAL_ROBOT_SOURCE_PINS[source.repositoryRevision],
  { custom: trustedPin != null });
  if (source.datasetId !== pin.datasetId
    || source.repositoryRevision !== pin.repositoryRevision
    || source.datasetVersion !== pin.datasetVersion) {
    throw new Error("REAL_ROBOT_SOURCE_PROVENANCE_INVALID");
  }
  for (const key of FILE_KEYS) {
    const expected = pin.files[key];
    if (input[key].length !== expected.bytes
      || hashRealRobotValue(input[key]) !== expected.sha256) {
      throw new Error(`REAL_ROBOT_${key.toUpperCase()}_PROVENANCE_INVALID`);
    }
  }
  const builtIn = pin.scope === "BUILT_IN_REVIEWED_PUBLIC_SOURCE";
  const projectedFiles = Object.fromEntries(FILE_KEYS.map((key) => {
    const file = pin.files[key];
    const disclose = builtIn && file.pathDisclosure === "PUBLIC_NON_TRAJECTORY_URL";
    return [key, {
      role: file.role,
      evidenceUrl: disclose ? file.url : builtIn
        ? "PINNED_PUBLIC_TRAJECTORY_SOURCE_REDACTED"
        : "TEST_FIXTURE_SOURCE_REDACTED",
      sha256: file.sha256,
      bytes: file.bytes,
      rawTrajectoryPathRetained: false,
    }];
  }));
  return { pin, builtIn, projected: {
    schema: REAL_ROBOT_SCHEMAS.source,
    pinHash: pin.pinHash,
    pinAuthority: builtIn ? "BUILT_IN_REVIEWED_PIN" : "TEST_FIXTURE_PIN",
    datasetId: builtIn ? pin.datasetId
      : `outsider/test-fixture/${hashRealRobotValue(pin.datasetId).slice(7)}`,
    repositoryUrl: builtIn ? pin.repositoryUrl : "TEST_FIXTURE_SOURCE_REDACTED",
    repositoryRevision: pin.repositoryRevision,
    repositoryRevisionEvidenceUrl: builtIn
      ? pin.repositoryRevisionUrl : "TEST_FIXTURE_SOURCE_REDACTED",
    datasetVersion: pin.datasetVersion,
    files: projectedFiles,
  } };
}

function sourceForReplay(projected, trustedPin = null) {
  if (!plain(projected) || projected.schema !== REAL_ROBOT_SCHEMAS.source
    || !COMMIT.test(String(projected.repositoryRevision ?? ""))
    || !VERSION.test(String(projected.datasetVersion ?? ""))) {
    throw new Error("REAL_ROBOT_PROJECTED_SOURCE_INVALID");
  }
  if (projected.pinAuthority === "TEST_FIXTURE_PIN") {
    if (trustedPin == null) throw new Error("REAL_ROBOT_CUSTOM_TRUSTED_PIN_REQUIRED");
    return { datasetId: trustedPin.datasetId,
      repositoryRevision: trustedPin.repositoryRevision,
      datasetVersion: trustedPin.datasetVersion };
  }
  return { datasetId: projected.datasetId,
    repositoryRevision: projected.repositoryRevision,
    datasetVersion: projected.datasetVersion };
}

function integerFromText(value, label) {
  const parsed = Number(value.replaceAll(",", ""));
  if (!positiveInteger(parsed)) throw new Error(`REAL_ROBOT_${label}_INVALID`);
  return parsed;
}

function parseProjectPage(bytes, pin) {
  const html = text(bytes, "PROJECT_PAGE");
  const normalized = html.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ");
  const match = (pattern, label) => {
    const found = pattern.exec(normalized);
    if (!found) throw new Error(`REAL_ROBOT_PROJECT_PAGE_${label}_INVALID`);
    return integerFromText(found[1], `PROJECT_PAGE_${label}`);
  };
  const output = {
    trajectories: match(/([0-9][0-9,]*) trajectories/u, "TRAJECTORIES"),
    teleoperated: match(/([0-9][0-9,]*) teleoperated demonstrations/u,
      "TELEOPERATED"),
    scripted: match(/([0-9][0-9,]*) rollouts from a scripted/u, "SCRIPTED"),
    environments: match(/([0-9][0-9,]*) environments/u, "ENVIRONMENTS"),
    skills: match(/([0-9][0-9,]*) skills/u, "SKILLS"),
    controlFrequencyHz: match(/control frequency is ([0-9]+) Hz/u,
      "CONTROL_FREQUENCY"),
    averageTrajectoryLength: match(/average trajectory length is ([0-9]+) timesteps/u,
      "AVERAGE_TRAJECTORY_LENGTH"),
  };
  const resolution = /images are saved at a ([0-9]+)x([0-9]+) resolution/u
    .exec(normalized);
  if (!normalized.includes("WidowX 250 6DOF robot arm")
    || !normalized.includes("RGBD camera")
    || !normalized.includes("Creative Commons Attribution 4.0 International License")
    || !resolution) {
    throw new Error("REAL_ROBOT_PROJECT_PAGE_EVIDENCE_INVALID");
  }
  output.imageWidth = integerFromText(resolution[1], "PROJECT_PAGE_IMAGE_WIDTH");
  output.imageHeight = integerFromText(resolution[2], "PROJECT_PAGE_IMAGE_HEIGHT");
  const expected = pin.expectedCoverage;
  if (output.trajectories !== expected.projectPageTrajectories
    || output.teleoperated !== expected.projectPageTeleoperated
    || output.scripted !== expected.projectPageScripted
    || output.environments !== expected.projectPageEnvironments
    || output.skills !== expected.projectPageSkills
    || output.imageWidth !== expected.imageWidth
    || output.imageHeight !== expected.imageHeight) {
    throw new Error("REAL_ROBOT_PROJECT_PAGE_COVERAGE_INVALID");
  }
  return output;
}

function parseJson(bytes, label) {
  try { return JSON.parse(text(bytes, label)); }
  catch (error) {
    if (String(error?.message ?? error).startsWith("REAL_ROBOT_")) throw error;
    throw new Error(`REAL_ROBOT_${label}_JSON_INVALID`);
  }
}

function parseDatasetInfo(bytes, pin) {
  const info = parseJson(bytes, "DATASET_INFO");
  const keys = ["citation", "description", "fileFormat", "moduleName", "name",
    "releaseNotes", "splits", "version"];
  if (!exactKeys(info, keys) || info.fileFormat !== "tfrecord"
    || info.name !== "bridge_dataset" || info.version !== pin.datasetVersion
    || !exactKeys(info.releaseNotes, [pin.datasetVersion])
    || !Array.isArray(info.splits) || info.splits.length !== 2) {
    throw new Error("REAL_ROBOT_DATASET_INFO_SHAPE_INVALID");
  }
  const expectedByName = {
    train: { examples: pin.expectedCoverage.tfdsTrainExamples,
      bytes: pin.expectedCoverage.tfdsTrainBytes,
      shards: pin.expectedCoverage.tfdsTrainShards },
    val: { examples: pin.expectedCoverage.tfdsValExamples,
      bytes: pin.expectedCoverage.tfdsValBytes,
      shards: pin.expectedCoverage.tfdsValShards },
  };
  const splits = info.splits.map((split) => {
    if (!exactKeys(split, ["filepathTemplate", "name", "numBytes", "shardLengths"])
      || !Object.hasOwn(expectedByName, split.name)
      || !Array.isArray(split.shardLengths) || split.shardLengths.length === 0
      || !split.shardLengths.every((value) => /^[0-9]+$/u.test(String(value)))) {
      throw new Error("REAL_ROBOT_DATASET_INFO_SPLIT_INVALID");
    }
    const examples = split.shardLengths.reduce((sum, value) => sum + Number(value), 0);
    const numBytes = Number(split.numBytes);
    const expected = expectedByName[split.name];
    if (!Number.isSafeInteger(numBytes) || numBytes <= 0
      || examples !== expected.examples || numBytes !== expected.bytes
      || split.shardLengths.length !== expected.shards) {
      throw new Error("REAL_ROBOT_DATASET_INFO_COVERAGE_INVALID");
    }
    return { name: split.name, examples, numBytes,
      shards: split.shardLengths.length };
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(splits.map(({ name }) => name)).size !== 2
    || splits.reduce((sum, split) => sum + split.examples, 0)
      !== pin.expectedCoverage.tfdsTotalExamples) {
    throw new Error("REAL_ROBOT_DATASET_INFO_TOTAL_INVALID");
  }
  return { version: info.version, splits,
    citationPlaceholderPresent: String(info.citation).includes("TODO(example_dataset)"),
    descriptionPlaceholderPresent: String(info.description).includes("TODO(example_dataset)") };
}

function tensorDimension(feature, label) {
  const dimensions = feature?.tensor?.shape?.dimensions;
  if (!Array.isArray(dimensions) || dimensions.length !== 1
    || !/^[0-9]+$/u.test(String(dimensions[0]))) {
    throw new Error(`REAL_ROBOT_FEATURES_${label}_DIMENSION_INVALID`);
  }
  return Number(dimensions[0]);
}

function parseFeatures(bytes, pin) {
  const root = parseJson(bytes, "FEATURES");
  if (!exactKeys(root, ["pythonClassName", "featuresDict"])
    || !exactKeys(root.featuresDict, ["features"])) {
    throw new Error("REAL_ROBOT_FEATURES_ROOT_INVALID");
  }
  const top = root.featuresDict.features;
  if (!exactKeys(top, ["steps", "episode_metadata"])) {
    throw new Error("REAL_ROBOT_FEATURES_TOP_INVALID");
  }
  const steps = top.steps?.sequence?.feature?.featuresDict?.features;
  const metadata = top.episode_metadata?.featuresDict?.features;
  const stepKeys = ["action", "discount", "is_first", "is_last", "is_terminal",
    "language_embedding", "language_instruction", "observation", "reward"];
  const metadataKeys = ["episode_id", "file_path", "has_image_0", "has_image_1",
    "has_image_2", "has_image_3", "has_language"];
  if (!exactKeys(steps, stepKeys) || !exactKeys(metadata, metadataKeys)) {
    throw new Error("REAL_ROBOT_FEATURES_FIELDS_INVALID");
  }
  const observation = steps.observation?.featuresDict?.features;
  if (!exactKeys(observation, ["image_0", "image_1", "image_2", "image_3", "state"])) {
    throw new Error("REAL_ROBOT_FEATURES_OBSERVATION_INVALID");
  }
  const actionDimension = tensorDimension(steps.action, "ACTION");
  const stateDimension = tensorDimension(observation.state, "STATE");
  const imageShapes = [0, 1, 2, 3].map((index) => {
    const image = observation[`image_${index}`]?.image;
    const shape = image?.shape?.dimensions?.map(Number);
    if (!same(shape, [256, 256, 3]) || image.dtype !== "uint8"
      || image.encodingFormat !== "jpeg") {
      throw new Error("REAL_ROBOT_FEATURES_IMAGE_INVALID");
    }
    return shape;
  });
  if (actionDimension !== pin.expectedCoverage.actionDimension
    || stateDimension !== pin.expectedCoverage.proprioDimension) {
    throw new Error("REAL_ROBOT_FEATURES_VECTOR_COVERAGE_INVALID");
  }
  const describedDimension = (description) =>
    [...String(description ?? "").matchAll(/([0-9]+)x/gu)]
      .reduce((sum, match) => sum + Number(match[1]), 0);
  return { actionDimension, stateDimension, imageShapes,
    imageObservationCount: imageShapes.length,
    languageInstructionPresent: true,
    languageEmbeddingDimension: tensorDimension(steps.language_embedding,
      "LANGUAGE_EMBEDDING"),
    actionDescriptionDimensionConsistent:
      describedDimension(steps.action.description) === actionDimension,
    stateDescriptionDimensionConsistent:
      describedDimension(observation.state.description) === stateDimension };
}

function parseStatistics(bytes, pin) {
  const value = parseJson(bytes, "ACTION_PROPRIO_STATS");
  if (!exactKeys(value, ["action", "proprio"])) {
    throw new Error("REAL_ROBOT_STATS_ROOT_INVALID");
  }
  const output = {};
  for (const [key, expectedDimension] of [["action", pin.expectedCoverage.actionDimension],
    ["proprio", pin.expectedCoverage.proprioDimension]]) {
    const statistic = value[key];
    if (!exactKeys(statistic, ["mean", "std", "max", "min"])) {
      throw new Error("REAL_ROBOT_STATS_SHAPE_INVALID");
    }
    for (const field of ["mean", "std", "max", "min"]) {
      if (!Array.isArray(statistic[field])
        || statistic[field].length !== expectedDimension
        || !statistic[field].every(Number.isFinite)) {
        throw new Error("REAL_ROBOT_STATS_VECTOR_INVALID");
      }
    }
    if (statistic.std.some((number) => number < 0)
      || statistic.mean.some((number, index) => number < statistic.min[index]
        || number > statistic.max[index])) {
      throw new Error("REAL_ROBOT_STATS_ORDER_INVALID");
    }
    output[key] = { dimension: expectedDimension,
      finiteMeanStdMinMax: true, orderedMinMeanMax: true };
  }
  return output;
}

function safeTrajectoryPath(value) {
  return typeof value === "string" && value.length <= 512
    && SAFE_PATH.test(value) && !value.includes("//") && !value.includes("..")
    && value.split("/").every((part) => part.length > 0 && !FORBIDDEN_KEYS.has(part));
}

function parseTrajectoryIndex(bytes, pin) {
  const source = text(bytes, "TRAJECTORY_INDEX");
  const lines = source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].endsWith("\r")) lines[index] = lines[index].slice(0, -1);
  }
  if (lines.length === 0 || lines.length > 100_000
    || lines.some((line) => line.length === 0 || line.length > 1_024
      || line.includes("\r"))) {
    throw new Error("REAL_ROBOT_TRAJECTORY_INDEX_LINE_SET_INVALID");
  }
  const pairs = [];
  const pairSet = new Set();
  const leaves = [];
  for (let ordinal = 0; ordinal < lines.length; ordinal += 1) {
    const line = lines[ordinal];
    const firstComma = line.indexOf(",");
    const secondComma = line.indexOf(",", firstComma + 1);
    if (firstComma <= 0 || secondComma <= firstComma + 1
      || secondComma === line.length - 1) {
      throw new Error("REAL_ROBOT_TRAJECTORY_INDEX_ROW_INVALID");
    }
    const initialPath = line.slice(0, firstComma);
    const finalPath = line.slice(firstComma + 1, secondComma);
    const annotation = line.slice(secondComma + 1);
    const initialParent = initialPath.slice(0, initialPath.lastIndexOf("/"));
    const finalParent = finalPath.slice(0, finalPath.lastIndexOf("/"));
    const finalFrame = /\/im_([0-9]+)\.jpg$/u.exec(finalPath);
    if (!safeTrajectoryPath(initialPath) || !safeTrajectoryPath(finalPath)
      || !initialPath.endsWith("/im_0.jpg") || !finalFrame
      || Number(finalFrame[1]) <= 0 || initialParent !== finalParent
      || annotation.length === 0 || annotation.length > 512) {
      throw new Error("REAL_ROBOT_TRAJECTORY_INDEX_BINDING_INVALID");
    }
    const pairKey = `${initialPath}\0${finalPath}`;
    if (pairSet.has(pairKey)) throw new Error("REAL_ROBOT_TRAJECTORY_INDEX_DUPLICATE");
    pairSet.add(pairKey);
    const entry = { ordinal, initialPath, finalPath, annotation };
    pairs.push(entry);
    leaves.push(hashRealRobotValue({ domain: "bridgedata-v2/browser-index-row/v1",
      ordinal, initialPathHash: hashRealRobotValue(initialPath),
      finalPathHash: hashRealRobotValue(finalPath),
      annotationHash: hashRealRobotValue(annotation) }));
  }
  if (pairs.length !== pin.expectedCoverage.trajectoryIndexRows
    || pairSet.size !== pin.expectedCoverage.uniqueTrajectoryPathPairs) {
    throw new Error("REAL_ROBOT_TRAJECTORY_INDEX_COVERAGE_INVALID");
  }
  const selected = pairs[pin.expectedCoverage.sampleOrdinal];
  if (pin.files.sampleInitial.url !== `${pin.sourceRootUrl}${selected.initialPath}`
    || pin.files.sampleFinal.url !== `${pin.sourceRootUrl}${selected.finalPath}`) {
    throw new Error("REAL_ROBOT_SAMPLE_INDEX_BINDING_INVALID");
  }
  return { rows: pairs.length, uniquePairs: pairSet.size, selected,
    manifestRootHash: hashRealRobotValue({
      domain: "bridgedata-v2/browser-index-root/v1", leaves }) };
}

function jpegMetadata(bytes, label) {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`REAL_ROBOT_${label}_JPEG_INVALID`);
  }
  let offset = 2;
  let dimensions = null;
  let embeddedExifPresent = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error(`REAL_ROBOT_${label}_JPEG_SEGMENT_INVALID`);
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error(`REAL_ROBOT_${label}_JPEG_INVALID`);
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) {
      throw new Error(`REAL_ROBOT_${label}_JPEG_LENGTH_INVALID`);
    }
    if (marker === 0xe1 && bytes.subarray(offset + 2, offset + 8)
      .equals(Buffer.from("Exif\0\0", "binary"))) embeddedExifPresent = true;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) throw new Error(`REAL_ROBOT_${label}_JPEG_SOF_INVALID`);
      dimensions = { height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5), components: bytes[offset + 7] };
    }
    offset += length;
  }
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0
    || dimensions.components !== 3) {
    throw new Error(`REAL_ROBOT_${label}_JPEG_DIMENSIONS_INVALID`);
  }
  return { ...dimensions, embeddedExifPresent };
}

function validateCodeEvidence(readmeBytes, licenseBytes) {
  const readme = text(readmeBytes, "CODE_README");
  const license = text(licenseBytes, "CODE_LICENSE");
  if (!readme.startsWith("# Jax BC/RL Implementations for BridgeData V2")
    || !readme.includes("https://rail-berkeley.github.io/bridgedata/")
    || !readme.includes("The raw dataset (comprised of JPEGs, PNGs, and pkl files)")
    || !readme.includes("trajectories are structured using the [RLDS]")
    || !license.startsWith("MIT License\n")
    || !license.includes("Copyright (c) 2023 Robotic AI & Learning Lab Berkeley")) {
    throw new Error("REAL_ROBOT_CODE_EVIDENCE_INVALID");
  }
}

export function createRealRobotObservationProjection({ projectPageBytes,
  trajectoryIndexBytes, datasetInfoBytes, featuresBytes,
  actionProprioStatsBytes, codeReadmeBytes, codeLicenseBytes,
  sampleInitialBytes, sampleFinalBytes, source, trustedPin = null }) {
  const input = normalizeInput({ projectPageBytes, trajectoryIndexBytes,
    datasetInfoBytes, featuresBytes, actionProprioStatsBytes, codeReadmeBytes,
    codeLicenseBytes, sampleInitialBytes, sampleFinalBytes });
  const { pin, builtIn, projected } = normalizeSource(source, input, trustedPin);
  const page = parseProjectPage(input.projectPage, pin);
  const dataset = parseDatasetInfo(input.datasetInfo, pin);
  const features = parseFeatures(input.features, pin);
  const statistics = parseStatistics(input.actionProprioStats, pin);
  const index = parseTrajectoryIndex(input.trajectoryIndex, pin);
  const initial = jpegMetadata(input.sampleInitial, "SAMPLE_INITIAL");
  const final = jpegMetadata(input.sampleFinal, "SAMPLE_FINAL");
  validateCodeEvidence(input.codeReadme, input.codeLicense);
  if (initial.width !== pin.expectedCoverage.imageWidth
    || initial.height !== pin.expectedCoverage.imageHeight
    || final.width !== pin.expectedCoverage.imageWidth
    || final.height !== pin.expectedCoverage.imageHeight) {
    throw new Error("REAL_ROBOT_SAMPLE_IMAGE_COVERAGE_INVALID");
  }

  const tfdsTotal = pin.expectedCoverage.tfdsTotalExamples;
  const pageTotal = page.trajectories;
  const body = {
    schema: REAL_ROBOT_SCHEMAS.projection,
    source: projected,
    extractionPolicy: {
      id: "outsider/bridgedata-v2-real-observation-minimal-projection",
      version: "1.0.0",
      retained: ["reviewed-source-and-license-commitments",
        "publisher-and-tfds-denominators-kept-separate",
        "trajectory-index-root-and-count", "hashed-sample-frame-commitments",
        "camera-shape", "action-and-proprio-statistics-shape",
        "metadata-quality-discrepancies", "role-and-authority-boundaries"],
      removed: ["raw-trajectory-paths", "raw-language-annotations",
        "raw-images", "pixel-bytes", "raw-statistic-vectors", "local-paths",
        "people-or-collector-identifiers", "full-tfrecord-shards"],
    },
    evidentiaryWeight: {
      observationRealityClass: builtIn
        ? "REAL_PHYSICAL_OBSERVATION_HIGH_WEIGHT" : "TEST_FIXTURE_ONLY",
      physicalWorldCollectionEstablishedByPublisherEvidence: builtIn,
      realRobotSensorBytesReplayed: builtIn,
      realRobotActionAndProprioAggregateBytesReplayed: builtIn,
      numericRealityWeightAssigned: false,
      targetApplicabilityClass: "UNESTABLISHED",
      ownOutsiderOutcome: false,
      ownOutsiderOutcomeWeight: 0,
      targetPriorEstablished: false,
      targetPriorWeight: 0,
      pricingAuthorityWeight: 0,
      executionAuthorityWeight: 0,
    },
    license: {
      status: builtIn ? "ESTABLISHED_FOR_PINNED_INGESTED_BYTES"
        : "CALLER_ASSERTED_TEST_FIXTURE_ONLY",
      evidenceAuthority: builtIn ? "BUILT_IN_REVIEWED_PIN_AND_SOURCE_REPLAY"
        : "CALLER_SUPPLIED_TEST_FIXTURE_PIN",
      dataSpdx: pin.dataLicenseSpdx,
      codeSpdx: pin.codeLicenseSpdx,
      scope: pin.licenseScope,
      exactProjectPageDataLicenseDeclarationHashVerified: builtIn,
      exactPinnedCodeLicenseHashVerified: builtIn,
      rawDatasetRedistributionAuthorizedByOutsider: false,
      expandedUseRequiresIndependentLicenseReview: true,
    },
    coverage: {
      publisherPage: {
        claimedTrajectories: pageTotal,
        claimedTeleoperatedDemonstrations: page.teleoperated,
        claimedScriptedRollouts: page.scripted,
        claimedEnvironments: page.environments,
        claimedSkills: page.skills,
      },
      tfdsMetadata: {
        version: dataset.version,
        trainExamples: pin.expectedCoverage.tfdsTrainExamples,
        validationExamples: pin.expectedCoverage.tfdsValExamples,
        totalExamples: tfdsTotal,
        trainShards: pin.expectedCoverage.tfdsTrainShards,
        validationShards: pin.expectedCoverage.tfdsValShards,
        fullTfrecordShardBytesIngested: 0,
      },
      publicTrajectoryBrowserIndex: {
        rows: index.rows,
        uniquePathPairs: index.uniquePairs,
        exactIndexBytesReplayed: builtIn,
        completeDatasetIndexEstablished: false,
      },
      replayedObservationSubset: {
        selectedTrajectoryRecords: 1,
        cameraFrames: 2,
        completeActionTrajectories: 0,
        completeProprioTrajectories: 0,
        aggregateActionProprioStatisticsDocuments: 1,
      },
      denominatorReconciliation: {
        publisherClaimedTrajectories: pageTotal,
        tfdsMetadataExamples: tfdsTotal,
        publisherMinusTfds: pageTotal - tfdsTotal,
        publisherAndTfdsAgree: pageTotal === tfdsTotal,
        browserIndexRows: index.rows,
        browserIndexEqualsTfds: index.rows === tfdsTotal,
        globallyCompleteTrajectoryCensusEstablished: false,
      },
    },
    observation: {
      sourceClass: "HISTORICAL_REAL_ROBOT_DATASET",
      robotPlatform: "WidowX 250 6DOF",
      collectionMode: "TELEOP_AND_SCRIPTED_MIX_REPORTED_AT_DATASET_LEVEL",
      publisherReportedControlFrequencyHz: page.controlFrequencyHz,
      publisherReportedAverageTrajectoryLength: page.averageTrajectoryLength,
      rawCameraResolution: { width: page.imageWidth, height: page.imageHeight,
        channels: 3 },
      tfdsProcessedCameraResolution: { width: 256, height: 256, channels: 3 },
      tfdsActionDimension: features.actionDimension,
      tfdsStateDimension: features.stateDimension,
      sample: {
        ordinal: pin.expectedCoverage.sampleOrdinal,
        sampleRefHash: hashRealRobotValue({
          domain: "bridgedata-v2/selected-observation/v1",
          indexManifestRootHash: index.manifestRootHash,
          ordinal: pin.expectedCoverage.sampleOrdinal }),
        initialFrameHash: pin.files.sampleInitial.sha256,
        finalFrameHash: pin.files.sampleFinal.sha256,
        framePairHash: hashRealRobotValue({ initial: pin.files.sampleInitial.sha256,
          final: pin.files.sampleFinal.sha256 }),
        framesAreByteDistinct:
          pin.files.sampleInitial.sha256 !== pin.files.sampleFinal.sha256,
        dimensions: { width: initial.width, height: initial.height,
          channels: initial.components },
        embeddedExifPresent: initial.embeddedExifPresent
          || final.embeddedExifPresent,
        completeTrajectoryReplayEstablished: false,
        taskOutcomeEstablished: false,
      },
      trajectoryIndexManifestRootHash: index.manifestRootHash,
      aggregateStatistics: {
        artifactHash: pin.files.actionProprioStats.sha256,
        action: statistics.action,
        proprio: statistics.proprio,
        valuesRetainedInProjection: false,
      },
    },
    outcome: {
      classification: "HISTORICAL_PHYSICAL_OBSERVATION_NO_OUTSIDER_OUTCOME",
      selectedTrajectoryTaskOutcome: "UNKNOWN_NOT_IN_INGESTED_EVIDENCE",
      sourceSuccessClaimAuthorizedForOutsider: false,
      outsiderProspectiveCensusEntry: false,
      outsiderExecutionAttempt: false,
      outsiderOutcomeDenominatorContribution: 0,
      targetFailureRateNumerator: null,
      targetFailureRateDenominator: null,
      targetFailureRate: null,
    },
    quality: {
      publisherAndTfdsTrajectoryCountMismatchObserved: pageTotal !== tfdsTotal,
      publisherAndTfdsTrajectoryCountDifference: pageTotal - tfdsTotal,
      browserIndexIsPartialRelativeToTfdsMetadata: index.rows < tfdsTotal,
      datasetInfoCitationPlaceholderPresent: dataset.citationPlaceholderPresent,
      datasetInfoDescriptionPlaceholderPresent: dataset.descriptionPlaceholderPresent,
      actionDescriptionDimensionConsistent:
        features.actionDescriptionDimensionConsistent,
      stateDescriptionDimensionConsistent:
        features.stateDescriptionDimensionConsistent,
      metadataQualityDoesNotNegatePhysicalObservation: true,
      metadataQualityDoesBlockGlobalCompletenessClaim: true,
    },
    privacy: {
      rawSourceBytesRetainedInProjection: false,
      rawImagesRetainedInProjection: false,
      rawPixelsRetainedInProjection: false,
      rawTrajectoryPathsRetained: false,
      rawLanguageAnnotationsRetained: false,
      localFilesystemPathsRetained: false,
      collectorOrPersonIdentifiersRetained: false,
      embeddedExifRetained: false,
      commitmentsOnlyForSensitiveSourceFields: true,
    },
    authority: {
      mode: builtIn ? "QUARANTINE_HISTORICAL_OBSERVATION_ONLY"
        : "TEST_FIXTURE_ONLY",
      sourcePinAuthority: builtIn ? "BUILT_IN_REVIEWED_PIN"
        : "CALLER_SUPPLIED_TEST_FIXTURE_PIN",
      officialBytesMatchedTrustedPinAndReplayed: builtIn,
      repositoryCommitPinned: builtIn,
      datasetSnapshotContentHashesPinned: builtIn,
      releaseTagEstablished: false,
      commitSignatureVerified: false,
      publisherIdentityCryptographicallyVerified: false,
      fullDatasetDownloaded: false,
      completeTrajectoryExecutedOrReplayed: false,
      physicalSafetyEstablished: false,
      targetDomainTransferEstablished: false,
      targetPriorEstablished: false,
      targetPricingEstablished: false,
      executionAuthorityEstablished: false,
      pricingAuthorityEstablished: false,
      guaranteeAuthorityEstablished: false,
      settlementAuthorityEstablished: false,
      modelTrainingAuthorizedByOutsider: false,
    },
  };
  const serialized = canonicalizeStrict(body);
  for (const forbidden of [index.selected.initialPath, index.selected.finalPath,
    index.selected.annotation, "/private/tmp", "/Users/"]) {
    if (serialized.includes(forbidden)) {
      throw new Error("REAL_ROBOT_PROJECTION_PRIVACY_LEAK");
    }
  }
  return Object.freeze({ ...body, projectionHash: hashRealRobotValue(body) });
}

export function verifyRealRobotObservationProjection(projection, {
  projectPageBytes = null, trajectoryIndexBytes = null, datasetInfoBytes = null,
  featuresBytes = null, actionProprioStatsBytes = null, codeReadmeBytes = null,
  codeLicenseBytes = null, sampleInitialBytes = null, sampleFinalBytes = null,
  trustedPin = null } = {}) {
  try {
    const keys = ["schema", "source", "extractionPolicy", "evidentiaryWeight",
      "license", "coverage", "observation", "outcome", "quality", "privacy",
      "authority", "projectionHash"];
    if (!exactKeys(projection, keys)
      || projection.schema !== REAL_ROBOT_SCHEMAS.projection
      || !HASH.test(String(projection.projectionHash ?? ""))) {
      return { ok: false, error: "REAL_ROBOT_PROJECTION_SHAPE_INVALID" };
    }
    const { projectionHash, ...body } = projection;
    if (projectionHash !== hashRealRobotValue(body)) {
      return { ok: false, error: "REAL_ROBOT_PROJECTION_HASH_INVALID" };
    }
    const replay = { projectPageBytes, trajectoryIndexBytes, datasetInfoBytes,
      featuresBytes, actionProprioStatsBytes, codeReadmeBytes, codeLicenseBytes,
      sampleInitialBytes, sampleFinalBytes };
    if (Object.values(replay).some((value) => value == null)) {
      return { ok: false, error: "REAL_ROBOT_SOURCE_BYTES_REQUIRED" };
    }
    const rebuilt = createRealRobotObservationProjection({ ...replay,
      source: sourceForReplay(projection.source, trustedPin), trustedPin });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(projection)) {
      return { ok: false, error: "REAL_ROBOT_PROJECTION_REPLAY_INVALID" };
    }
    return { ok: true, projectionHash, sourceBytesReplayed: true,
      observationRealityClass: projection.evidentiaryWeight.observationRealityClass,
      ownOutsiderOutcome: false, targetPriorEstablished: false,
      pricingAuthorityEstablished: false };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
