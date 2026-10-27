/*
 * Frozen adapters for two public real-robot corpora.
 *
 * The projection is deliberately descriptive.  BotFails labels are preserved
 * as manual per-frame anomaly annotations and UR5-Fail execution_reward is
 * preserved as a manual subtask label.  Neither source creates causal
 * experience, loss evidence, detector output, or deployment authority.
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const PUBLIC_ROBOTICS_SCHEMAS = Object.freeze({
  manifest: "outsider/public-robotics-acquisition-manifest/v2",
  record: "outsider/public-robotics-record/v1",
  summary: "outsider/public-robotics-effect-summary/v1",
});

export const BOTFAILS_REVISION = "3478e49d91e1737eb76dfee2d81bb22617039c13";
export const UR5FAIL_REVISION = "bd2b24224e4da833a8d42ca694d839622e54bb48";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ADAPTER_VERSION = "1.1.0";

const BOTFAILS_REPOSITORY_METADATA = Object.freeze(sourceObject(
  `https://huggingface.co/api/datasets/kantine/BotFails/revision/${BOTFAILS_REVISION}?expand[]=sha&expand[]=private&expand[]=gated&expand[]=cardData`,
  "hf-repo-metadata.json", 351,
  "83f150c4ec0ebe9849cd38753b91d0547977f856f7ae1b56c92d63c316af9ad1",
));
const BOTFAILS_README = Object.freeze(sourceObject(
  `https://huggingface.co/datasets/kantine/BotFails/resolve/${BOTFAILS_REVISION}/README.md`,
  "README.md", 5886,
  "a4d7034727720ac73f6a30b64f5849fbb24dd0164477621473f1e3ac305feb7c",
));
const BOTFAILS_TREE_OBJECTS = Object.freeze([
  sourceObject(
    `https://huggingface.co/api/datasets/kantine/BotFails/tree/${BOTFAILS_REVISION}/BotFails/test/industrial_screws_sorting_anomaly?recursive=true`,
    "hf-tree-test-task.json", 13239,
    "caad4fec30a1744aec8470280642e33e9ed58c07400bfd72ee0406d8e91298d2",
  ),
  sourceObject(
    `https://huggingface.co/api/datasets/kantine/BotFails/tree/${BOTFAILS_REVISION}/BotFails/normal_train/industrial_screws_sorting_expert?recursive=true`,
    "hf-tree-normal-task.json", 25275,
    "35a70e6e977829dd6cb4b8f177ab6698083549d4da9966218764bcdd8f2398ab",
  ),
  sourceObject(
    `https://huggingface.co/api/datasets/kantine/BotFails/tree/${BOTFAILS_REVISION}/BotFails/labels/industrial_screws_sorting_anomaly?recursive=true`,
    "hf-tree-label-task.json", 1621,
    "5ebd1b72109a99d918e338942fe74265278b6ec04af6435f55a5604ae691df71",
  ),
]);
const UR5FAIL_REPOSITORY_METADATA = Object.freeze(sourceObject(
  `https://huggingface.co/api/datasets/paulpacaud/Guardian-FailCoT-OOD-datasets/revision/${UR5FAIL_REVISION}?expand[]=sha&expand[]=private&expand[]=gated&expand[]=cardData`,
  "hf-repo-metadata.json", 2046,
  "1f6d55b16a3d711f625be224704a9f00a3a094aa1f386742f63c93bd7a0bb9b2",
));
const UR5FAIL_README = Object.freeze(sourceObject(
  `https://huggingface.co/datasets/paulpacaud/Guardian-FailCoT-OOD-datasets/resolve/${UR5FAIL_REVISION}/README.md`,
  "README.md", 9874,
  "8e5b628460e67902e3801d315e1400f55e1fa18ccb1a1d5a33e6a32af6731ded",
));
const UR5FAIL_TREE_OBJECTS = Object.freeze([
  sourceObject(
    `https://huggingface.co/api/datasets/paulpacaud/Guardian-FailCoT-OOD-datasets/tree/${UR5FAIL_REVISION}?recursive=true`,
    "hf-tree-root.json", 3421,
    "dd8387f40a0f4d276696fada22246b310dc17ec2f33dbae7cb9e98b0a4f005c2",
  ),
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && canonicalizeStrict(Object.keys(value).sort()) === canonicalizeStrict([...keys].sort());
}

function digestBytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digestDomain(domain, value) {
  return digestBytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function sourceObject(remotePath, localPath, sizeBytes, sha256) {
  return Object.freeze({ remotePath, localPath, sizeBytes, sha256: `sha256:${sha256}` });
}

const BOTFAILS_TEST_PARQUET = Object.freeze([
  [72250, "16db53da90f5b9a1f6bba8177ffeecfa4504b06e78671fedebde0ab472ff261b"],
  [72637, "b3e42ef9ae02c9394ab7f5e5bc94eab371ffdfcf053546a3f6b46025242863dd"],
  [75817, "01bb31ca96ccf2d5ddf58bb6cfce0981cd3146e2074f1ce82104b1b3780a4b3d"],
  [66072, "298410720a469093bb8d61d0ef05e01ab126e12b3c1c236fe3921f8beb91a249"],
  [69619, "b5462e2be9515fc87d9c0e2c8ae21b5a3e1ecc6dc45a5790789c9c48577b52c7"],
  [75553, "be1e6777975ef1e9e5fb20ede1c04819cb7736176f67115d8d016eae93c27744"],
  [58698, "0cc83b2bc9034f85224d9d038416e42813c04d6758b8a0c2ed5c60116eaaaad7"],
  [68082, "eeac81d79a8b3ab7bb5c1d53b6509176a5475edc79ba412e86591894badceb04"],
  [58879, "f77dccd7aaba83533efb93c468cd5cc4a5345e86fdd4ba4e4e9390815991896f"],
  [66860, "1f04694e5b588d4b2b8eabf3424534d3645d3946f25e82c5c7ee8f39092926c3"],
]);

const BOTFAILS_TEST_LABELS = Object.freeze([
  [2986, "ae73c2903afe76cdbcf5cf1fc589e2e4a7b6b278deb7eb277ebcd1898af0b876"],
  [2986, "3fe959366597048d1a3a7b5d196d4ec46fb5eb00f4147c03d0a0a42afa6e3534"],
  [2986, "48cb5a7644a71b46eba3f58799b96fa55aae1451e92eb2eb38ae0b29f524cc52"],
  [2984, "af1e4700a1086fd48d14d24611303874cda8fa5ed5a7103cc33c2b9a2c383709"],
  [2984, "34cf775cfbeaf90b144c83eeee4c70dc08219b696c38de8b343dac8d31ff169a"],
  [2986, "10857ce318e18817f708dab9098431135a4176454a12044dd678f3f797886960"],
  [2986, "b01441698dfd43213a2f8381070a8174734f1b1f5cdbc588815ac6dc124f93e7"],
  [2982, "f3f5596d7e171e5f7589862250d72dafebcf338a9676665096f60cc654d73d8b"],
  [2984, "9a5d8c2b2534fdf77cf322360793b25874b8a00572483ae97443a7396f94ee41"],
  [2986, "2b8dfead479d8c8b4543f006351c28b47eb4486ba47d405f29d7a7c5c077b4fa"],
]);

const BOTFAILS_NORMAL_PARQUET = Object.freeze([
  [70094, "16fc46fc17493ec246a07f802460d03ed4e6893f9a37d1bbc79ef1389788ab86"],
  [74715, "565764268592c22f07f995a54858992594cdeafabe4894f73a5f7f517ff0cfc9"],
  [76114, "e9387c4db58cd03bab5f661463bde3a0ff8ad1d2beb5817e73056b1a17519dcf"],
  [75592, "499fbc4941a4600676d8773ced05227b8fd785057934a4744b491767c372ba08"],
  [75788, "e005b18e589684c760f7097fa5a2708f11ef633655ef9355700e1cc56c8ed4a2"],
  [70932, "671410a09ff4e8c301863f488e45edb7ee220529c54552a9590401df95d1885c"],
  [69357, "f44b2d9b88061d5302a14229009dc2a0a4b7b3561da955289673ce06971afe3d"],
  [72365, "9054aed459eabd8e2da5b138eae1e6c7f0d5dcce048e7191cb350bc7f1dd9a81"],
  [65761, "6ff5c600180750f70db704162c68b42143b49761ff0933c934b9ae0ee4148635"],
  [70491, "6e7fc3e3f0ec7a1734d96711c41fd0e6c40b792d56a82ac8c6b149769693efa6"],
]);

function indexedObjects(entries, { remotePrefix, localPrefix, suffix }) {
  return entries.map(([size, hash], index) => {
    const episode = String(index).padStart(6, "0");
    const name = `episode_${episode}${suffix}`;
    return sourceObject(`${remotePrefix}/${name}`, `${localPrefix}/${name}`, size, hash);
  });
}

function botFailsObjects() {
  const testPrefix = "BotFails/test/industrial_screws_sorting_anomaly";
  const normalPrefix = "BotFails/normal_train/industrial_screws_sorting_expert";
  return [
    BOTFAILS_REPOSITORY_METADATA,
    BOTFAILS_README,
    ...BOTFAILS_TREE_OBJECTS,
    ...indexedObjects(BOTFAILS_TEST_PARQUET, {
      remotePrefix: `${testPrefix}/data/chunk-000`,
      localPrefix: "test-industrial_screws_sorting_anomaly/data", suffix: ".parquet",
    }),
    ...indexedObjects(BOTFAILS_TEST_LABELS, {
      remotePrefix: "BotFails/labels/industrial_screws_sorting_anomaly",
      localPrefix: "test-industrial_screws_sorting_anomaly/labels", suffix: "_labels.csv",
    }),
    ...indexedObjects(BOTFAILS_NORMAL_PARQUET, {
      remotePrefix: `${normalPrefix}/data/chunk-000`,
      localPrefix: "normal_train-industrial_screws_sorting_expert/data", suffix: ".parquet",
    }),
    sourceObject(`${testPrefix}/meta/episodes.jsonl`, "test-industrial_screws_sorting_anomaly/meta/episodes.jsonl", 1600, "a640d468b15ade5edf7690962c170a2db78159461b2064d8e0a9a3a543e70f5e"),
    sourceObject(`${testPrefix}/meta/info.json`, "test-industrial_screws_sorting_anomaly/meta/info.json", 3241, "9631e823cd4717d1c2c42b23eaf552887369645d30f04f9d485638ea9510cb19"),
    sourceObject(`${testPrefix}/meta/stats.json`, "test-industrial_screws_sorting_anomaly/meta/stats.json", 5442, "68615f502ba93e7a9ce5d1cf5a1d8ce8e8a5f2b8624ba60ea69419f2370fa86d"),
    sourceObject(`${testPrefix}/meta/tasks.jsonl`, "test-industrial_screws_sorting_anomaly/meta/tasks.jsonl", 138, "f729e6eaacd700c4b19b202eda6b0a2d12d36f53ac193a5f4c29dd18dc9dabc7"),
    sourceObject(`${normalPrefix}/meta/episodes.jsonl`, "normal_train-industrial_screws_sorting_expert/meta/episodes.jsonl", 1570, "b4890967ac4f05ae00a11df70096c5f675174feb10311945ae41707179514195"),
    sourceObject(`${normalPrefix}/meta/info.json`, "normal_train-industrial_screws_sorting_expert/meta/info.json", 3241, "919e3a24dca9f4f8c776d8eb3fba4eb9046c9e943619f406e6d9f47d23dbbd5a"),
    sourceObject(`${normalPrefix}/meta/stats.json`, "normal_train-industrial_screws_sorting_expert/meta/stats.json", 5439, "5d6870a548bb8f83523808c02eb0e24ae84811e10c46776c3366e9eacfd3ae69"),
    sourceObject(`${normalPrefix}/meta/tasks.jsonl`, "normal_train-industrial_screws_sorting_expert/meta/tasks.jsonl", 56, "1a1df701dc9ded730b0fea1d29b8ab4f5b0d619045f98e44a8f6b322689918ec"),
  ].sort((left, right) => left.remotePath.localeCompare(right.remotePath));
}

function fixedBoundary() {
  return {
    causalExperienceUnits: 0,
    lossEvidenceUnits: 0,
    establishesLossOrLiability: false,
    automaticTraining: false,
    pricingEligible: false,
    authority: "none",
  };
}

function sealManifest(body) {
  return Object.freeze({ ...body, manifestHash: digestDomain(PUBLIC_ROBOTICS_SCHEMAS.manifest, body) });
}

export function buildBotFailsPilotManifest() {
  const objects = botFailsObjects();
  return sealManifest({
    schema: PUBLIC_ROBOTICS_SCHEMAS.manifest,
    adapterVersion: ADAPTER_VERSION,
    dataset: {
      id: "kantine/BotFails", revision: BOTFAILS_REVISION,
      repositoryUrl: "https://huggingface.co/datasets/kantine/BotFails",
      public: true, gated: false, requiresToken: false,
      licenseId: "Apache-2.0",
      licenseDeclaration: "HF_API_CARD_DATA_AND_PINNED_README_FRONT_MATTER_AGREE",
      sourceClass: "REAL_ROBOT_TELEOPERATION",
    },
    repositoryProvenance: {
      metadataLocalPath: BOTFAILS_REPOSITORY_METADATA.localPath,
      readmeLocalPath: BOTFAILS_README.localPath,
      revisionSourceField: "hf-repo-metadata.json.sha",
      licenseSourceFields: ["hf-repo-metadata.json.cardData.license",
        "README.md YAML front matter license"],
      accessSourceFields: ["hf-repo-metadata.json.private", "hf-repo-metadata.json.gated"],
      treeLocalPaths: BOTFAILS_TREE_OBJECTS.map((object) => object.localPath).sort(),
      selectedObjectBinding: "HF_PINNED_TREE_PATH_SIZE_AND_GIT_BLOB_OR_LFS_OID",
      derivationRequiredForFullSourceVerification: true,
    },
    selection: {
      rule: "lexicographically first 10 episode indices from one matched task family in anomaly test and nominal train splits",
      taskFamily: "industrial_screws_sorting", anomalyEpisodes: 10,
      nominalTrainEpisodes: 10, videoDownloaded: false,
      bias: "single-task convenience sample; nominal_train membership is not a success adjudication; all episodes share robot, task family, and teleoperation collection process",
    },
    objects,
    integrity: {
      objectCount: objects.length,
      selectedBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
      algorithm: "SHA-256 over exact downloaded bytes at frozen revision",
    },
    labelSemantics: {
      anomaly: "manual binary per-frame anomaly labels from CSV",
      nominal: "normal_train directory membership only; not relabelled as autonomous success",
    },
    correlationGrouping: ["datasetRoot", "taskRoot", "robotRoot", "policyRoot", "episodeRoot"],
    evidenceBoundary: fixedBoundary(),
  });
}

export function buildUr5FailExecutionManifest() {
  const objects = [
    UR5FAIL_REPOSITORY_METADATA,
    UR5FAIL_README,
    ...UR5FAIL_TREE_OBJECTS,
    sourceObject(
      "ur5fail_test/metadata_execution.jsonl", "metadata_execution.jsonl", 140467,
      "ac3f128c7d4b42787bee3d3fe3d6a0e7e4ffc25289d3bd92ec072a4aee1df08d",
    ),
  ].sort((left, right) => left.remotePath.localeCompare(right.remotePath));
  return sealManifest({
    schema: PUBLIC_ROBOTICS_SCHEMAS.manifest,
    adapterVersion: ADAPTER_VERSION,
    dataset: {
      id: "paulpacaud/Guardian-FailCoT-OOD-datasets", revision: UR5FAIL_REVISION,
      distribution: "ur5fail_test/metadata_execution.jsonl",
      repositoryUrl: "https://huggingface.co/datasets/paulpacaud/Guardian-FailCoT-OOD-datasets",
      public: true, gated: false, requiresToken: false,
      licenseId: "Apache-2.0",
      licenseDeclaration: "HF_API_CARD_DATA_AND_PINNED_README_FRONT_MATTER_AGREE",
      sourceClass: "REAL_ROBOT_AUTONOMOUS_POLICY_EXECUTION",
    },
    repositoryProvenance: {
      metadataLocalPath: UR5FAIL_REPOSITORY_METADATA.localPath,
      readmeLocalPath: UR5FAIL_README.localPath,
      revisionSourceField: "hf-repo-metadata.json.sha",
      licenseSourceFields: ["hf-repo-metadata.json.cardData.license",
        "README.md YAML front matter license"],
      accessSourceFields: ["hf-repo-metadata.json.private", "hf-repo-metadata.json.gated"],
      treeLocalPaths: UR5FAIL_TREE_OBJECTS.map((object) => object.localPath).sort(),
      selectedObjectBinding: "HF_PINNED_TREE_PATH_SIZE_AND_GIT_BLOB_OR_LFS_OID",
      derivationRequiredForFullSourceVerification: true,
    },
    selection: {
      rule: "all 140 rows in metadata_execution.jsonl at frozen revision",
      executionRows: 140, planningRows: 0, imageArchiveDownloaded: false,
      bias: "benchmark subtask rows are correlated within physical episodes, tasks, robot, and one policy; referenced images are committed by path hash only and were not fetched",
    },
    objects,
    integrity: { objectCount: objects.length,
      selectedBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
      algorithm: "SHA-256 over exact downloaded bytes at frozen revision" },
    labelSemantics: {
      executionReward: "manual binary subtask success/failure label",
      failureMode: "source string preserved verbatim as a benchmark category",
      planningExcluded: true,
    },
    correlationGrouping: ["datasetRoot", "taskRoot", "robotRoot", "policyRoot", "episodeRoot"],
    evidenceBoundary: fixedBoundary(),
  });
}

export function verifyPublicRoboticsManifest(manifest) {
  try {
    const rebuilt = manifest?.dataset?.id === "kantine/BotFails"
      ? buildBotFailsPilotManifest()
      : manifest?.dataset?.id === "paulpacaud/Guardian-FailCoT-OOD-datasets"
        ? buildUr5FailExecutionManifest() : fail("PUBLIC_ROBOTICS_DATASET_UNSUPPORTED");
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(manifest)) {
      fail("PUBLIC_ROBOTICS_MANIFEST_MISMATCH");
    }
    return { ok: true, manifestHash: manifest.manifestHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function readmeLicense(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  if (frontMatter === undefined) fail("PUBLIC_ROBOTICS_README_FRONT_MATTER_MISSING");
  const declarations = frontMatter.split(/\r?\n/)
    .map((line) => /^license:\s*([^#\s]+)\s*$/.exec(line)?.[1] ?? null)
    .filter((value) => value !== null);
  if (declarations.length !== 1) {
    fail("PUBLIC_ROBOTICS_README_LICENSE_DECLARATION_INVALID");
  }
  return declarations[0];
}

function normalizedLicenseId(value) {
  if (value === "apache-2.0") return "Apache-2.0";
  fail("PUBLIC_ROBOTICS_LICENSE_UNSUPPORTED", String(value));
}

function gitBlobOid(bytes) {
  const value = Buffer.from(bytes);
  return createHash("sha1").update(`blob ${value.length}\0`).update(value).digest("hex");
}

function pinnedTreeFiles(manifest, bytes) {
  const files = new Map();
  for (const localPath of manifest.repositoryProvenance.treeLocalPaths) {
    let tree;
    try { tree = JSON.parse(Buffer.from(bytes.get(localPath)).toString("utf8")); }
    catch { fail("PUBLIC_ROBOTICS_PINNED_TREE_INVALID_JSON", localPath); }
    if (!Array.isArray(tree)) fail("PUBLIC_ROBOTICS_PINNED_TREE_SHAPE_INVALID", localPath);
    for (const entry of tree) {
      if (entry?.type !== "file") continue;
      if (typeof entry.path !== "string" || !Number.isSafeInteger(entry.size) || entry.size < 0
        || !/^[a-f0-9]{40}$/.test(entry.oid ?? "")) {
        fail("PUBLIC_ROBOTICS_PINNED_TREE_FILE_INVALID", localPath);
      }
      if (entry.lfs !== undefined && (!entry.lfs || typeof entry.lfs !== "object"
        || !/^[a-f0-9]{64}$/.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size
        || !Number.isSafeInteger(entry.lfs.pointerSize) || entry.lfs.pointerSize < 1)) {
        fail("PUBLIC_ROBOTICS_PINNED_TREE_LFS_INVALID", entry.path);
      }
      if (files.has(entry.path)) fail("PUBLIC_ROBOTICS_PINNED_TREE_PATH_DUPLICATED", entry.path);
      files.set(entry.path, entry);
    }
  }
  return files;
}

function deriveRepositoryProvenance(manifest, bytes) {
  const metadataPath = manifest.repositoryProvenance.metadataLocalPath;
  const readmePath = manifest.repositoryProvenance.readmeLocalPath;
  let metadata;
  try { metadata = JSON.parse(Buffer.from(bytes.get(metadataPath)).toString("utf8")); }
  catch { fail("PUBLIC_ROBOTICS_REPOSITORY_METADATA_INVALID_JSON"); }
  const apiLicense = metadata?.cardData?.license;
  const declaredReadmeLicense = readmeLicense(bytes.get(readmePath));
  if (typeof apiLicense !== "string" || apiLicense !== declaredReadmeLicense) {
    fail("PUBLIC_ROBOTICS_LICENSE_DECLARATIONS_DISAGREE");
  }
  const licenseId = normalizedLicenseId(apiLicense);
  if (!exactKeys(metadata, ["_id", "id", "sha", "private", "gated", "cardData"])
    || !/^[a-f0-9]{24}$/.test(metadata?._id ?? "")
    || typeof metadata?.id !== "string" || !/^[a-f0-9]{40}$/.test(metadata?.sha ?? "")
    || metadata.private !== false || metadata.gated !== false
    || !metadata.cardData || typeof metadata.cardData !== "object"
    || Array.isArray(metadata.cardData)) {
    fail("PUBLIC_ROBOTICS_REPOSITORY_METADATA_SHAPE_INVALID");
  }
  const provenancePaths = new Set([metadataPath, readmePath,
    ...manifest.repositoryProvenance.treeLocalPaths]);
  const selectedObjects = manifest.objects
    .filter((object) => !provenancePaths.has(object.localPath));
  const treeFiles = pinnedTreeFiles(manifest, bytes);
  for (const object of selectedObjects) {
    const entry = treeFiles.get(object.remotePath);
    if (!entry || entry.size !== object.sizeBytes) {
      fail("PUBLIC_ROBOTICS_SELECTED_OBJECT_TREE_BINDING_MISSING", object.remotePath);
    }
    if (entry.lfs !== undefined) {
      if (`sha256:${entry.lfs.oid}` !== object.sha256) {
        fail("PUBLIC_ROBOTICS_SELECTED_LFS_OID_MISMATCH", object.remotePath);
      }
    } else if (gitBlobOid(bytes.get(object.localPath)) !== entry.oid) {
      fail("PUBLIC_ROBOTICS_SELECTED_GIT_BLOB_OID_MISMATCH", object.remotePath);
    }
  }
  const derived = {
    id: metadata.id,
    revision: metadata.sha,
    licenseId,
    public: !metadata.private,
    gated: metadata.gated,
    requiresToken: metadata.private || metadata.gated !== false,
    metadataObjectHash: objectByLocalPath(manifest, metadataPath).sha256,
    readmeObjectHash: objectByLocalPath(manifest, readmePath).sha256,
    pinnedTreeObjectHashes: manifest.repositoryProvenance.treeLocalPaths
      .map((localPath) => objectByLocalPath(manifest, localPath).sha256).sort(),
    selectedObjectsBoundToPinnedTree: selectedObjects.length,
    derivation: "EXACT_PINNED_HF_API_METADATA_README_AND_TREE_OBJECT_BINDING",
  };
  for (const field of ["id", "revision", "licenseId", "public", "gated", "requiresToken"]) {
    if (manifest.dataset[field] !== derived[field]) {
      fail("PUBLIC_ROBOTICS_REPOSITORY_PROVENANCE_MISMATCH", field);
    }
  }
  return Object.freeze(derived);
}

function verifiedSourceBundle(manifest, sourceDir) {
  const check = verifyPublicRoboticsManifest(manifest);
  if (!check.ok) fail("PUBLIC_ROBOTICS_MANIFEST_INVALID", check.error);
  const output = new Map();
  for (const object of manifest.objects) {
    const file = path.resolve(sourceDir, object.localPath);
    const stat = statSync(file);
    if (!stat.isFile() || stat.size !== object.sizeBytes) {
      fail("PUBLIC_ROBOTICS_SOURCE_SIZE_MISMATCH", object.localPath);
    }
    const bytes = readFileSync(file);
    if (digestBytes(bytes) !== object.sha256) {
      fail("PUBLIC_ROBOTICS_SOURCE_HASH_MISMATCH", object.localPath);
    }
    output.set(object.localPath, bytes);
  }
  return { bytes: output, repositoryProvenance: deriveRepositoryProvenance(manifest, output) };
}

export function verifyPublicRoboticsSourceDirectory(manifest, sourceDir) {
  try {
    const verified = verifiedSourceBundle(manifest, sourceDir);
    return { ok: true, manifestHash: manifest.manifestHash,
      verifiedObjects: verified.bytes.size, verifiedBytes: manifest.integrity.selectedBytes,
      repositoryProvenanceVerified: true,
      derivedDataset: verified.repositoryProvenance };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function parseJsonLines(bytes, code) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!text.endsWith("\n")) fail(`${code}_FINAL_NEWLINE_REQUIRED`);
  try { return text.trimEnd().split("\n").map((line) => JSON.parse(line)); }
  catch { return fail(`${code}_INVALID_JSONL`); }
}

export function parseBotFailsFrameLabels(bytes, expectedLength = null) {
  const text = Buffer.from(bytes).toString("utf8");
  if (!text.endsWith("\n")) fail("BOTFAILS_LABEL_FINAL_NEWLINE_REQUIRED");
  const labels = text.trimEnd().split("\n").map((line) => {
    if (line !== "0" && line !== "1") fail("BOTFAILS_LABEL_VALUE_INVALID");
    return Number(line);
  });
  if (expectedLength !== null && labels.length !== expectedLength) {
    fail("BOTFAILS_LABEL_LENGTH_MISMATCH", `${labels.length}/${expectedLength}`);
  }
  const positiveCount = labels.reduce((sum, value) => sum + value, 0);
  const firstPositiveIndex = labels.indexOf(1);
  let positiveRuns = 0;
  labels.forEach((value, index) => { if (value === 1 && labels[index - 1] !== 1) positiveRuns += 1; });
  return {
    frameCount: labels.length,
    negativeCount: labels.length - positiveCount,
    positiveCount,
    firstPositiveIndex: firstPositiveIndex < 0 ? null : firstPositiveIndex,
    positiveRuns,
    sequenceHash: digestDomain("outsider/botfails/manual-frame-label-sequence/v1", labels),
  };
}

function correlationRoots({ dataset, task, robot, policy, episode }) {
  const root = (kind, value) => digestDomain(`outsider/public-robotics/${kind}-root/v1`, value);
  return {
    datasetRoot: root("dataset", dataset), taskRoot: root("task", { dataset, task }),
    robotRoot: root("robot", { dataset, robot }), policyRoot: root("policy", { dataset, policy }),
    episodeRoot: root("episode", { dataset, task, episode }),
  };
}

function sealRecord(body) {
  return Object.freeze({ ...body, recordHash: digestDomain(PUBLIC_ROBOTICS_SCHEMAS.record, body) });
}

function recordDataset(manifest, repositoryProvenance = null) {
  const source = repositoryProvenance ?? manifest.dataset;
  return {
    id: source.id, revision: source.revision,
    licenseId: source.licenseId, sourceClass: manifest.dataset.sourceClass,
    manifestHash: manifest.manifestHash,
  };
}

function commonRecord({ manifest, rowOrdinal, sourceObjectHash, task, robot, policy, episode,
  collection, truth, commitments, repositoryProvenance = null }) {
  const body = {
    schema: PUBLIC_ROBOTICS_SCHEMAS.record,
    dataset: recordDataset(manifest, repositoryProvenance),
    sourceRowOrdinal: rowOrdinal,
    sourceObjectHash,
    recordIdHash: digestDomain("outsider/public-robotics/record-id/v1", {
      dataset: manifest.dataset.id, revision: manifest.dataset.revision, task, episode, rowOrdinal,
    }),
    correlation: correlationRoots({ dataset: manifest.dataset.id, task, robot, policy, episode }),
    collection,
    truth,
    commitments,
    detectorOutputs: null,
    evidenceBoundary: fixedBoundary(),
  };
  return sealRecord(body);
}

function objectByLocalPath(manifest, localPath) {
  const object = manifest.objects.find((candidate) => candidate.localPath === localPath);
  if (!object) fail("PUBLIC_ROBOTICS_MANIFEST_OBJECT_MISSING", localPath);
  return object;
}

export function convertBotFailsPilot(sourceDir) {
  const manifest = buildBotFailsPilotManifest();
  const verified = verifiedSourceBundle(manifest, sourceDir);
  const { bytes, repositoryProvenance } = verified;
  const records = [];
  for (const split of ["test-industrial_screws_sorting_anomaly",
    "normal_train-industrial_screws_sorting_expert"]) {
    const metaPath = `${split}/meta/episodes.jsonl`;
    const episodeMeta = parseJsonLines(bytes.get(metaPath), "BOTFAILS_EPISODES");
    if (episodeMeta.length < 10) fail("BOTFAILS_EPISODE_META_COUNT_INVALID");
    for (let episodeIndex = 0; episodeIndex < 10; episodeIndex += 1) {
      const episodeName = `episode_${String(episodeIndex).padStart(6, "0")}`;
      const meta = episodeMeta[episodeIndex];
      if (meta?.episode_index !== episodeIndex || !Number.isSafeInteger(meta.length)
        || meta.length < 2) fail("BOTFAILS_EPISODE_META_INVALID", episodeName);
      const parquetPath = `${split}/data/${episodeName}.parquet`;
      const parquet = objectByLocalPath(manifest, parquetPath);
      const anomaly = split.startsWith("test-");
      let frameLabels = null;
      let labelObjectHash = null;
      if (anomaly) {
        const labelPath = `${split}/labels/${episodeName}_labels.csv`;
        const labelObject = objectByLocalPath(manifest, labelPath);
        frameLabels = parseBotFailsFrameLabels(bytes.get(labelPath));
        const missingLabelFrames = meta.length - frameLabels.frameCount;
        if (missingLabelFrames < 0 || missingLabelFrames > 1) {
          fail("BOTFAILS_LABEL_LENGTH_MISMATCH",
            `${frameLabels.frameCount}/${meta.length}`);
        }
        frameLabels = {
          ...frameLabels,
          declaredFrameCount: meta.length,
          missingLabelFrames,
          coverage: missingLabelFrames === 0 ? "FULL_DECLARED_FRAME_COVERAGE"
            : "SOURCE_CSV_ONE_FRAME_SHORT",
        };
        labelObjectHash = labelObject.sha256;
      }
      records.push(commonRecord({
        manifest, rowOrdinal: null, sourceObjectHash: parquet.sha256,
        task: "industrial_screws_sorting", robot: "SO100",
        policy: "MASTER_ARM_TELEOPERATION", episode: `${split}/${episodeIndex}`,
        collection: {
          executionMode: "TELEOPERATION", robot: "SO100",
          policy: "MASTER_ARM_TELEOPERATION", fps: 30,
          split: anomaly ? "test/industrial_screws_sorting_anomaly"
            : "normal_train/industrial_screws_sorting_expert",
        },
        truth: anomaly ? {
          provenance: "MANUAL_FRAME_ANOMALY_LABEL", manual: true,
          labelScope: "FRAME_SEQUENCE",
          value: frameLabels.positiveCount > 0 ? "ANOMALY_LABEL_PRESENT" : "NO_ANOMALY_LABEL_PRESENT",
          sourceField: "one binary integer per CSV line", labelObjectHash, frameLabels,
          failureMode: null,
        } : {
          provenance: "DIRECTORY_SPLIT_MEMBERSHIP", manual: false,
          labelScope: "EPISODE", value: "NOMINAL_TRAIN_DEMONSTRATION",
          sourceField: "BotFails/normal_train", labelObjectHash: null,
          frameLabels: null, failureMode: null,
        },
        commitments: {
          sourceParquetHash: parquet.sha256, declaredFrameCount: meta.length,
          taskTextHash: digestDomain("outsider/public-robotics/task-text/v1", meta.tasks),
          sensorPayloadDecoded: false, videoDownloaded: false,
        },
        repositoryProvenance,
      }));
    }
  }
  return { manifest, records, summary: buildPublicRoboticsSummary(manifest, records) };
}

function exactUr5Row(row) {
  const keys = ["taskvar", "task_instruction", "episode_id", "images", "failure_mode",
    "detailed_subtask_name", "failure_reason", "plan", "reward", "execution_reward",
    "planning_reward"].sort();
  return row && typeof row === "object" && !Array.isArray(row)
    && canonicalizeStrict(Object.keys(row).sort()) === canonicalizeStrict(keys)
    && typeof row.taskvar === "string" && typeof row.task_instruction === "string"
    && (typeof row.episode_id === "string" || Number.isSafeInteger(row.episode_id))
    && Array.isArray(row.images) && row.images.every((item) => typeof item === "string")
    && typeof row.failure_mode === "string" && typeof row.detailed_subtask_name === "string"
    && (typeof row.failure_reason === "string" || row.failure_reason === null)
    && Array.isArray(row.plan)
    && [row.reward, row.execution_reward, row.planning_reward]
      .every((value) => value === 0 || value === 1);
}

export function convertUr5FailExecution(sourceDir) {
  const manifest = buildUr5FailExecutionManifest();
  const verified = verifiedSourceBundle(manifest, sourceDir);
  const { bytes, repositoryProvenance } = verified;
  const source = objectByLocalPath(manifest, "metadata_execution.jsonl");
  const rows = parseJsonLines(bytes.get(source.localPath), "UR5FAIL_EXECUTION");
  if (rows.length !== 140) fail("UR5FAIL_EXECUTION_ROW_COUNT_INVALID", rows.length);
  const records = rows.map((row, rowOrdinal) => {
    if (!exactUr5Row(row) || row.reward !== row.execution_reward) {
      fail("UR5FAIL_EXECUTION_ROW_INVALID", rowOrdinal);
    }
    return commonRecord({
      manifest, rowOrdinal, sourceObjectHash: source.sha256, task: row.taskvar,
      robot: "UR5_PARALLEL_GRIPPER_3X_REALSENSE_D435", policy: "3D-LOTUS++",
      episode: `${row.taskvar}/${String(row.episode_id)}`,
      collection: {
        executionMode: "AUTONOMOUS_POLICY_EXECUTION",
        robot: "UR5_PARALLEL_GRIPPER_3X_REALSENSE_D435", policy: "3D-LOTUS++",
        split: "ur5fail_test/metadata_execution.jsonl",
      },
      truth: {
        provenance: "MANUAL_SUBTASK_SUCCESS_LABEL", manual: true,
        labelScope: "SUBTASK", value: row.execution_reward === 1
          ? "SUBTASK_SUCCESS" : "SUBTASK_FAILURE",
        sourceField: "execution_reward", executionReward: row.execution_reward,
        reward: row.reward, planningReward: row.planning_reward,
        failureMode: row.failure_mode,
      },
      commitments: {
        taskInstructionHash: digestDomain("outsider/public-robotics/task-instruction/v1", row.task_instruction),
        detailedSubtaskHash: digestDomain("outsider/public-robotics/detailed-subtask/v1", row.detailed_subtask_name),
        failureReasonHash: digestDomain("outsider/public-robotics/failure-reason/v1", row.failure_reason),
        imageReferenceSetHash: digestDomain("outsider/public-robotics/image-reference-set/v1", row.images),
        imageReferenceCount: row.images.length, imageBytesDownloaded: false,
      },
      repositoryProvenance,
    });
  });
  return { manifest, records, summary: buildPublicRoboticsSummary(manifest, records) };
}

function integer(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function expectedDatasetForRecord(record) {
  if (record?.dataset?.id === "kantine/BotFails") {
    return { manifest: buildBotFailsPilotManifest(), kind: "BOTFAILS" };
  }
  if (record?.dataset?.id === "paulpacaud/Guardian-FailCoT-OOD-datasets") {
    return { manifest: buildUr5FailExecutionManifest(), kind: "UR5FAIL_EXECUTION" };
  }
  fail("PUBLIC_ROBOTICS_RECORD_DATASET_UNSUPPORTED");
}

function fixedCorrelationMatches(record, { task, robot, policy }) {
  const expected = correlationRoots({ dataset: record.dataset.id, task, robot, policy,
    episode: "not-used-for-fixed-roots" });
  return record.correlation.datasetRoot === expected.datasetRoot
    && record.correlation.taskRoot === expected.taskRoot
    && record.correlation.robotRoot === expected.robotRoot
    && record.correlation.policyRoot === expected.policyRoot;
}

function validBotFailsFrameLabels(labels, declaredFrameCount) {
  if (!exactKeys(labels, ["frameCount", "negativeCount", "positiveCount",
    "firstPositiveIndex", "positiveRuns", "sequenceHash", "declaredFrameCount",
    "missingLabelFrames", "coverage"])
    || !integer(labels.frameCount, { minimum: 1 })
    || !integer(labels.negativeCount) || !integer(labels.positiveCount)
    || labels.negativeCount + labels.positiveCount !== labels.frameCount
    || !(labels.firstPositiveIndex === null
      || integer(labels.firstPositiveIndex, { maximum: labels.frameCount - 1 }))
    || labels.firstPositiveIndex === null && labels.positiveCount !== 0
    || labels.firstPositiveIndex !== null && labels.positiveCount === 0
    || !integer(labels.positiveRuns, { maximum: labels.positiveCount })
    || !SHA256.test(labels.sequenceHash ?? "")
    || labels.declaredFrameCount !== declaredFrameCount
    || !integer(labels.missingLabelFrames, { maximum: 1 })
    || labels.frameCount + labels.missingLabelFrames !== declaredFrameCount
    || labels.coverage !== (labels.missingLabelFrames === 0
      ? "FULL_DECLARED_FRAME_COVERAGE" : "SOURCE_CSV_ONE_FRAME_SHORT")) return false;
  return true;
}

function validBotFailsSemantics(record, manifest) {
  if (record.sourceRowOrdinal !== null
    || canonicalizeStrict(record.dataset) !== canonicalizeStrict(recordDataset(manifest))
    || !exactKeys(record.collection, ["executionMode", "robot", "policy", "fps", "split"])
    || record.collection.executionMode !== "TELEOPERATION"
    || record.collection.robot !== "SO100"
    || record.collection.policy !== "MASTER_ARM_TELEOPERATION"
    || record.collection.fps !== 30
    || !["test/industrial_screws_sorting_anomaly",
      "normal_train/industrial_screws_sorting_expert"].includes(record.collection.split)
    || !fixedCorrelationMatches(record, { task: "industrial_screws_sorting", robot: "SO100",
      policy: "MASTER_ARM_TELEOPERATION" })
    || !exactKeys(record.commitments, ["sourceParquetHash", "declaredFrameCount",
      "taskTextHash", "sensorPayloadDecoded", "videoDownloaded"])
    || record.commitments.sourceParquetHash !== record.sourceObjectHash
    || !integer(record.commitments.declaredFrameCount, { minimum: 2 })
    || !SHA256.test(record.commitments.taskTextHash ?? "")
    || record.commitments.sensorPayloadDecoded !== false
    || record.commitments.videoDownloaded !== false
    || !manifest.objects.some((object) => object.sha256 === record.sourceObjectHash
      && object.localPath.endsWith(".parquet"))) return false;
  const anomaly = record.collection.split === "test/industrial_screws_sorting_anomaly";
  if (!exactKeys(record.truth, ["provenance", "manual", "labelScope", "value",
    "sourceField", "labelObjectHash", "frameLabels", "failureMode"])
    || record.truth.failureMode !== null) return false;
  if (!anomaly) {
    return record.truth.provenance === "DIRECTORY_SPLIT_MEMBERSHIP"
      && record.truth.manual === false && record.truth.labelScope === "EPISODE"
      && record.truth.value === "NOMINAL_TRAIN_DEMONSTRATION"
      && record.truth.sourceField === "BotFails/normal_train"
      && record.truth.labelObjectHash === null && record.truth.frameLabels === null;
  }
  return record.truth.provenance === "MANUAL_FRAME_ANOMALY_LABEL"
    && record.truth.manual === true && record.truth.labelScope === "FRAME_SEQUENCE"
    && record.truth.sourceField === "one binary integer per CSV line"
    && SHA256.test(record.truth.labelObjectHash ?? "")
    && manifest.objects.some((object) => object.sha256 === record.truth.labelObjectHash
      && object.localPath.endsWith("_labels.csv"))
    && validBotFailsFrameLabels(
      record.truth.frameLabels, record.commitments.declaredFrameCount,
    )
    && record.truth.value === (record.truth.frameLabels.positiveCount > 0
      ? "ANOMALY_LABEL_PRESENT" : "NO_ANOMALY_LABEL_PRESENT");
}

function validUr5FailSemantics(record, manifest) {
  const executionMetadata = objectByLocalPath(manifest, "metadata_execution.jsonl");
  if (!integer(record.sourceRowOrdinal, { maximum: 139 })
    || canonicalizeStrict(record.dataset) !== canonicalizeStrict(recordDataset(manifest))
    || record.sourceObjectHash !== executionMetadata.sha256
    || !exactKeys(record.collection, ["executionMode", "robot", "policy", "split"])
    || record.collection.executionMode !== "AUTONOMOUS_POLICY_EXECUTION"
    || record.collection.robot !== "UR5_PARALLEL_GRIPPER_3X_REALSENSE_D435"
    || record.collection.policy !== "3D-LOTUS++"
    || record.collection.split !== "ur5fail_test/metadata_execution.jsonl"
    || record.correlation.datasetRoot !== correlationRoots({ dataset: record.dataset.id,
      task: "not-used", robot: "UR5_PARALLEL_GRIPPER_3X_REALSENSE_D435",
      policy: "3D-LOTUS++", episode: "not-used" }).datasetRoot
    || record.correlation.robotRoot !== correlationRoots({ dataset: record.dataset.id,
      task: "not-used", robot: "UR5_PARALLEL_GRIPPER_3X_REALSENSE_D435",
      policy: "3D-LOTUS++", episode: "not-used" }).robotRoot
    || record.correlation.policyRoot !== correlationRoots({ dataset: record.dataset.id,
      task: "not-used", robot: "UR5_PARALLEL_GRIPPER_3X_REALSENSE_D435",
      policy: "3D-LOTUS++", episode: "not-used" }).policyRoot
    || !exactKeys(record.truth, ["provenance", "manual", "labelScope", "value",
      "sourceField", "executionReward", "reward", "planningReward", "failureMode"])
    || record.truth.provenance !== "MANUAL_SUBTASK_SUCCESS_LABEL"
    || record.truth.manual !== true || record.truth.labelScope !== "SUBTASK"
    || record.truth.sourceField !== "execution_reward"
    || ![0, 1].includes(record.truth.executionReward)
    || record.truth.reward !== record.truth.executionReward
    || record.truth.planningReward !== 1
    || record.truth.value !== (record.truth.executionReward === 1
      ? "SUBTASK_SUCCESS" : "SUBTASK_FAILURE")
    || typeof record.truth.failureMode !== "string" || record.truth.failureMode.length === 0
    || !exactKeys(record.commitments, ["taskInstructionHash", "detailedSubtaskHash",
      "failureReasonHash", "imageReferenceSetHash", "imageReferenceCount",
      "imageBytesDownloaded"])
    || [record.commitments.taskInstructionHash, record.commitments.detailedSubtaskHash,
      record.commitments.failureReasonHash, record.commitments.imageReferenceSetHash]
      .some((value) => !SHA256.test(value ?? ""))
    || !integer(record.commitments.imageReferenceCount, { maximum: 6 })
    || record.commitments.imageBytesDownloaded !== false) return false;
  return true;
}

export function verifyPublicRoboticsRecord(record) {
  try {
    if (!exactKeys(record, ["schema", "dataset", "sourceRowOrdinal", "sourceObjectHash",
      "recordIdHash", "correlation", "collection", "truth", "commitments",
      "detectorOutputs", "evidenceBoundary", "recordHash"])
      || record.schema !== PUBLIC_ROBOTICS_SCHEMAS.record
      || !SHA256.test(record.recordHash ?? "") || !SHA256.test(record.recordIdHash ?? "")
      || !SHA256.test(record.sourceObjectHash ?? "") || record.detectorOutputs !== null
      || !(record.sourceRowOrdinal === null || Number.isSafeInteger(record.sourceRowOrdinal)
        && record.sourceRowOrdinal >= 0)
      || !exactKeys(record.dataset,
        ["id", "revision", "licenseId", "sourceClass", "manifestHash"])
      || !SHA256.test(record.dataset.manifestHash ?? "")
      || !exactKeys(record.correlation,
        ["datasetRoot", "taskRoot", "robotRoot", "policyRoot", "episodeRoot"])
      || canonicalizeStrict(record.evidenceBoundary) !== canonicalizeStrict(fixedBoundary())
      || Object.values(record.correlation).some((value) => !SHA256.test(value))
      || !record.collection || typeof record.collection !== "object"
      || !record.truth || typeof record.truth !== "object"
      || !record.commitments || typeof record.commitments !== "object") {
      fail("PUBLIC_ROBOTICS_RECORD_INVALID");
    }
    const expected = expectedDatasetForRecord(record);
    if (!(expected.kind === "BOTFAILS"
      ? validBotFailsSemantics(record, expected.manifest)
      : validUr5FailSemantics(record, expected.manifest))) {
      fail("PUBLIC_ROBOTICS_RECORD_SOURCE_SEMANTICS_INVALID");
    }
    const { recordHash, ...body } = record;
    if (recordHash !== digestDomain(PUBLIC_ROBOTICS_SCHEMAS.record, body)) {
      fail("PUBLIC_ROBOTICS_RECORD_HASH_MISMATCH");
    }
    return {
      ok: true, recordHash,
      verificationLevel: "SELF_CHECK_ONLY",
      sourceBytesVerified: false,
      truthVerified: false,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function collapseRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    fail("PUBLIC_ROBOTICS_RECORD_SET_INVALID");
  }
  const byId = new Map();
  let exactDuplicatesCollapsed = 0;
  for (const record of records) {
    const checked = verifyPublicRoboticsRecord(record);
    if (!checked.ok) fail("PUBLIC_ROBOTICS_RECORD_SET_MEMBER_INVALID", checked.error);
    const previous = byId.get(record.recordIdHash);
    if (!previous) byId.set(record.recordIdHash, record);
    else if (previous.recordHash === record.recordHash
      && canonicalizeStrict(previous) === canonicalizeStrict(record)) exactDuplicatesCollapsed += 1;
    else fail("PUBLIC_ROBOTICS_RECORD_ID_CONFLICT", record.recordIdHash);
  }
  return {
    records: [...byId.values()].sort((left, right) =>
      left.recordIdHash.localeCompare(right.recordIdHash)),
    candidateRecords: records.length,
    exactDuplicatesCollapsed,
  };
}

function expectedRecordsFromSource(manifest, sourceDir) {
  const checked = verifyPublicRoboticsManifest(manifest);
  if (!checked.ok) fail("PUBLIC_ROBOTICS_FULL_SOURCE_MANIFEST_INVALID", checked.error);
  return manifest.dataset.id === "kantine/BotFails"
    ? convertBotFailsPilot(sourceDir).records
    : manifest.dataset.id === "paulpacaud/Guardian-FailCoT-OOD-datasets"
      ? convertUr5FailExecution(sourceDir).records
      : fail("PUBLIC_ROBOTICS_FULL_SOURCE_DATASET_UNSUPPORTED");
}

export function verifyPublicRoboticsRecordAgainstSource(record, { manifest, sourceDir }) {
  try {
    const sourceCheck = verifyPublicRoboticsSourceDirectory(manifest, sourceDir);
    if (!sourceCheck.ok || sourceCheck.repositoryProvenanceVerified !== true) {
      fail("PUBLIC_ROBOTICS_FULL_SOURCE_PROVENANCE_INVALID", sourceCheck.error);
    }
    const checked = verifyPublicRoboticsRecord(record);
    if (!checked.ok) fail("PUBLIC_ROBOTICS_FULL_SOURCE_RECORD_INVALID", checked.error);
    if (canonicalizeStrict(record.dataset) !== canonicalizeStrict(recordDataset(manifest))) {
      fail("PUBLIC_ROBOTICS_FULL_SOURCE_DATASET_MISMATCH");
    }
    const expected = expectedRecordsFromSource(manifest, sourceDir)
      .find((candidate) => candidate.recordIdHash === record.recordIdHash);
    if (!expected || canonicalizeStrict(expected) !== canonicalizeStrict(record)) {
      fail("PUBLIC_ROBOTICS_FULL_SOURCE_DERIVATION_MISMATCH");
    }
    return {
      ok: true, recordHash: record.recordHash,
      verificationLevel: "FULL_SOURCE_REDERIVED",
      sourceBytesVerified: true,
      truthVerified: true,
      repositoryProvenanceVerified: true,
      derivedDataset: sourceCheck.derivedDataset,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyPublicRoboticsRecordSetAgainstSource(records, { manifest, sourceDir,
  requireComplete = true } = {}) {
  try {
    const sourceCheck = verifyPublicRoboticsSourceDirectory(manifest, sourceDir);
    if (!sourceCheck.ok || sourceCheck.repositoryProvenanceVerified !== true) {
      fail("PUBLIC_ROBOTICS_FULL_SOURCE_PROVENANCE_INVALID", sourceCheck.error);
    }
    const collapsed = collapseRecords(records);
    if (collapsed.records.some((record) => canonicalizeStrict(record.dataset)
      !== canonicalizeStrict(recordDataset(manifest)))) {
      fail("PUBLIC_ROBOTICS_FULL_SOURCE_DATASET_MISMATCH");
    }
    const expected = expectedRecordsFromSource(manifest, sourceDir);
    const expectedById = new Map(expected.map((record) => [record.recordIdHash, record]));
    for (const record of collapsed.records) {
      const sourceRecord = expectedById.get(record.recordIdHash);
      if (!sourceRecord || canonicalizeStrict(sourceRecord) !== canonicalizeStrict(record)) {
        fail("PUBLIC_ROBOTICS_FULL_SOURCE_DERIVATION_MISMATCH");
      }
    }
    if (requireComplete && collapsed.records.length !== expected.length) {
      fail("PUBLIC_ROBOTICS_FULL_SOURCE_RECORD_SET_INCOMPLETE");
    }
    return {
      ok: true,
      verificationLevel: "FULL_SOURCE_REDERIVED",
      sourceBytesVerified: true,
      truthVerified: true,
      repositoryProvenanceVerified: true,
      derivedDataset: sourceCheck.derivedDataset,
      recordsVerified: collapsed.records.length,
      expectedRecords: expected.length,
      exactDuplicatesCollapsed: collapsed.exactDuplicatesCollapsed,
      complete: collapsed.records.length === expected.length,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildPublicRoboticsSummary(manifest, records) {
  if (!verifyPublicRoboticsManifest(manifest).ok) fail("PUBLIC_ROBOTICS_SUMMARY_INPUT_INVALID");
  const collapsed = collapseRecords(records);
  const accepted = collapsed.records;
  if (accepted.some((record) => canonicalizeStrict(record.dataset)
    !== canonicalizeStrict(recordDataset(manifest)))) {
    fail("PUBLIC_ROBOTICS_SUMMARY_DATASET_BINDING_INVALID");
  }
  const countBy = (selector) => Object.fromEntries([...accepted.reduce((map, record) => {
    const key = selector(record); map.set(key, (map.get(key) ?? 0) + 1); return map;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
  const frameSequences = accepted.filter((record) => record.truth.frameLabels !== null
    && record.truth.frameLabels !== undefined).map((record) => record.truth.frameLabels);
  const subtaskRecords = accepted.filter((record) => record.truth.labelScope === "SUBTASK");
  const failedSubtasks = subtaskRecords.filter((record) => record.truth.value === "SUBTASK_FAILURE");
  const sourceLabelObservations = {
    frameSequences: frameSequences.length === 0 ? null : {
      sequences: frameSequences.length,
      declaredFrames: frameSequences.reduce((sum, labels) => sum + labels.declaredFrameCount, 0),
      labeledFrames: frameSequences.reduce((sum, labels) => sum + labels.frameCount, 0),
      unlabeledDeclaredFrames: frameSequences.reduce(
        (sum, labels) => sum + labels.missingLabelFrames, 0),
      positiveFrameLabels: frameSequences.reduce((sum, labels) => sum + labels.positiveCount, 0),
      negativeFrameLabels: frameSequences.reduce((sum, labels) => sum + labels.negativeCount, 0),
      positiveRuns: frameSequences.reduce((sum, labels) => sum + labels.positiveRuns, 0),
    },
    subtasks: subtaskRecords.length === 0 ? null : {
      manuallyLabelledSubtasks: subtaskRecords.length,
      sourceLabelSuccesses: subtaskRecords.filter(
        (record) => record.truth.value === "SUBTASK_SUCCESS").length,
      sourceLabelFailures: failedSubtasks.length,
      descriptiveSuccessFraction: subtaskRecords.filter(
        (record) => record.truth.value === "SUBTASK_SUCCESS").length / subtaskRecords.length,
      bySourceFailureMode: countBy((record) => record.truth.failureMode),
      failedLabelsBySourceFailureMode: Object.fromEntries([...failedSubtasks.reduce(
        (map, record) => {
          const key = record.truth.failureMode;
          map.set(key, (map.get(key) ?? 0) + 1);
          return map;
        }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right))),
    },
  };
  const body = {
    schema: PUBLIC_ROBOTICS_SCHEMAS.summary,
    dataset: recordDataset(manifest),
    inputAccounting: {
      candidateRecords: collapsed.candidateRecords,
      exactDuplicatesCollapsed: collapsed.exactDuplicatesCollapsed,
      uniqueRecords: accepted.length,
      conflictingRecordIdsAccepted: 0,
    },
    verification: {
      level: "SELF_CHECK_ONLY",
      sourceBytesVerified: false,
      truthVerified: false,
      fullSourceVerificationRequiredForTruthClaims: true,
    },
    counts: {
      records: accepted.length,
      uniqueEpisodeRoots: new Set(accepted.map((record) => record.correlation.episodeRoot)).size,
      uniqueTaskRoots: new Set(accepted.map((record) => record.correlation.taskRoot)).size,
      uniqueRobotRoots: new Set(accepted.map((record) => record.correlation.robotRoot)).size,
      uniquePolicyRoots: new Set(accepted.map((record) => record.correlation.policyRoot)).size,
      byTruthValue: countBy((record) => record.truth.value),
      byCollectionMode: countBy((record) => record.collection.executionMode),
    },
    manualLabelCoverage: accepted.filter((record) => record.truth.manual === true).length,
    sourceLabelObservations,
    detectorEvaluation: {
      performed: false, detectorOutputsPresent: 0,
      reason: "adapter preserves source labels and commitments; it does not run a detector",
    },
    independence: {
      rowCountIsIndependentTrialCount: false,
      groupingRequired: manifest.correlationGrouping,
      conservativeUpperBound: "uniqueEpisodeRoots; task/robot/policy roots remain shared",
    },
    samplingBias: manifest.selection.bias,
    evidenceBoundary: fixedBoundary(),
  };
  return { ...body, summaryHash: digestDomain(PUBLIC_ROBOTICS_SCHEMAS.summary, body) };
}
