/*
 * Terminal, metadata-only ledger for three exact Hugging Face dataset
 * searches related to robot intervention/correction. Search JSON is untrusted:
 * descriptions stay in private source files, no dataset payload is acquired,
 * and no command, code, action, or media is executed.
 *
 * "Exhausted" below means only that every record in the three fixed search
 * responses has one terminal discovery disposition. It is not payload, robot-
 * data, Hugging Face, or global source-universe exhaustion.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const HF_ROBOT_INTERVENTION_LEDGER_SCHEMA =
  "outsider/hf-robot-intervention-declared-scope-ledger/v1";
export const HF_ROBOT_INTERVENTION_SOURCE_SCHEMA =
  "outsider/hf-robot-intervention-declared-scope-source/v1";
export const HF_ROBOT_INTERVENTION_RECEIPT_SCHEMA =
  "outsider/hf-robot-intervention-declared-scope-receipt/v1";
export const HF_ROBOT_INTERVENTION_SCOPE =
  "THREE_EXACT_HF_FULL_SEARCH_QUERIES_TERMINAL_LEDGER";
export const HF_ROBOT_INTERVENTION_DISPOSITION =
  "METADATA_ONLY_QUARANTINE_DISCOVERY_LEDGER";

const REPORT_DOMAIN = `${HF_ROBOT_INTERVENTION_LEDGER_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${HF_ROBOT_INTERVENTION_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${HF_ROBOT_INTERVENTION_SOURCE_SCHEMA}/manifest`;
const SOURCE_ROOT_DOMAIN = `${HF_ROBOT_INTERVENTION_SOURCE_SCHEMA}/root`;
const COVERAGE_DOMAIN = `${HF_ROBOT_INTERVENTION_SOURCE_SCHEMA}/coverage`;
const LEDGER_DOMAIN = `${HF_ROBOT_INTERVENTION_LEDGER_SCHEMA}/candidate-ledger`;
const MAX_CONTROL_BYTES = 2 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const HF_ROBOT_INTERVENTION_QUERIES = Object.freeze([
  Object.freeze({ key: "intervention", term: "intervention", full: true,
    limit: 1_000, expectedRecords: 231, expectedBytes: 357_893,
    expectedSha256:
      "sha256:107c290f057772a14e00556a32659d13197d7269ba42b779852d386dbbee2cd4" }),
  Object.freeze({ key: "corrective", term: "corrective", full: true,
    limit: 1_000, expectedRecords: 18, expectedBytes: 26_012,
    expectedSha256:
      "sha256:9ceec3d7a7fd0ad7e414e778f37cf66546c37242bfbccf018a3020a52c6c91c6" }),
  Object.freeze({ key: "human-in-loop", term: "human-in-loop", full: true,
    limit: 1_000, expectedRecords: 9, expectedBytes: 6_272,
    expectedSha256:
      "sha256:7f4b230b09079cd9e903ffbba60e1831a4b754e500a46baee6b61f4ea7dbb936" }),
]);

const JIA_IDS = Object.freeze([
  "Jiacheng0603/handover_lerobot_dataset_208trajs_pi05_task_cmd_crop_intervention",
  "Jiacheng0603/handover_208trajs_dataset_lerobot_pi05_task_camd_crop_intervention_delta",
  "Jiacheng0603/handover_208trajs_lerobot_dataset_pi05_task_cmd_crop_no_intervention",
]);
const KEWANG_ID = "KeWangRobotics/peg_intervention";
const KELIN_IDS = Object.freeze([
  "KelinLiIC/intervention_1", "KelinLiIC/intervention_2",
]);
const AJAY_ID =
  "ajaysri/route_subtasks_dual_overhead_pi05_448_dagger_interventions_balanced";

export const HF_ROBOT_INTERVENTION_ALREADY_ACQUIRED_IDS = Object.freeze([
  ...JIA_IDS, KEWANG_ID,
].sort((left, right) => left.localeCompare(right)));
export const HF_ROBOT_INTERVENTION_ADMITTED_QUEUE_IDS = Object.freeze(
  [...KELIN_IDS].sort((left, right) => left.localeCompare(right)));

const COVERAGE_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "jia-handover-linked-lineage", scopeRelation: "IN_SCOPE",
    datasetIds: JIA_IDS,
    state: "COMPLETE_LINKED_THREE_REPOSITORY_NO_VIDEO_BYTES_REPLAYED",
    paths: Object.freeze([
      "src/outsider-handover-linked-intervention-lineage.js",
      "artifacts/outsider-handover-linked-intervention-lineage-20260830-v1/report.json",
    ]) }),
  Object.freeze({ key: "kewang-peg-intervention", scopeRelation: "IN_SCOPE",
    datasetIds: Object.freeze([KEWANG_ID]),
    state: "COMPLETE_FIXED_REVISION_SELECTED_MODALITY_BYTES_REPLAYED",
    paths: Object.freeze([
      "src/outsider-peg-intervention.js",
      "artifacts/outsider-peg-intervention-20260830-v1/peg-intervention.json",
    ]) }),
  Object.freeze({ key: "kelin-kewang-linked-lineage", scopeRelation: "IN_SCOPE",
    datasetIds: KELIN_IDS,
    state: "ADMITTED_MODULE_PRESENT_ARTIFACT_NOT_YET_PUBLISHED",
    paths: Object.freeze([
      "src/outsider-kelin-kewang-intervention-lineage.js",
    ]) }),
  Object.freeze({ key: "apaszynska-recap", scopeRelation: "OUTSIDE_SCOPE",
    datasetIds: Object.freeze(["apaszynska/so101-cup-recap-20ep"]),
    state: "EXISTING_DISTINCT_PRODUCER_RECAP_LINEAGE",
    paths: Object.freeze([
      "src/outsider-recap-so101-linked-lineage.js",
      "artifacts/outsider-recap-so101-linked-lineage-20260829-v1/recap-so101-linked-lineage.json",
    ]) }),
  Object.freeze({ key: "takuya-so101-hil-rl", scopeRelation: "OUTSIDE_SCOPE",
    datasetIds: Object.freeze([
      "TakuyaHiraoka/so101_pick_diverse_objects_hil_round1",
      "TakuyaHiraoka/so101_pick_diverse_objects_rl_round1",
    ]),
    state: "EXISTING_LINKED_HIL_RL_LINEAGE",
    paths: Object.freeze([
      "src/outsider-so101-hil-rl-lineage.js",
      "artifacts/outsider-so101-hil-rl-linked-lineage-20260829-v1/so101-hil-rl-linked-lineage.json",
    ]) }),
  Object.freeze({ key: "habit", scopeRelation: "OUTSIDE_SCOPE",
    datasetIds: Object.freeze(["configinc/HABIT"]),
    state: "EXISTING_HABIT_SAMPLE_AUDIT",
    paths: Object.freeze([
      "src/outsider-habit-sample-audit.js",
      "artifacts/outsider-habit-sample-audit-20260829-v1/habit-sample-audit.json",
    ]) }),
  Object.freeze({ key: "rby1", scopeRelation: "OUTSIDE_SCOPE",
    datasetIds: Object.freeze(["RB3159/rby1-fold-v1.1"]),
    state: "EXISTING_RBY1_NO_VIDEO_HIL_CORRECTION_SLICE",
    paths: Object.freeze([
      "src/outsider-rby1-fold-hil-correction-slice.js",
      "artifacts/outsider-rby1-fold-hil-correction-slice-20260829-v1/report.json",
    ]) }),
  Object.freeze({ key: "plug93", scopeRelation: "OUTSIDE_SCOPE",
    datasetIds: Object.freeze(["tliangucl/realrobot-plug93-recovery-v2"]),
    state: "EXISTING_RECOVERY_NUMERIC_TACTILE_RANGE_SLICE",
    paths: Object.freeze([
      "src/outsider-realrobot-plug93-recovery-numeric-slice.js",
      "artifacts/outsider-realrobot-plug93-recovery-numeric-slice-20260830-v1/report.json",
    ]) }),
]);

const CURATED_ROBOT_IDS = new Set([
  "Zasha01/eval_cube_stacking_intervention8",
  "thewisp/intervention_cylinder_socket_feb_3",
  "thewisp/intervention_cylinder_socket_feb_7",
  ...JIA_IDS,
  "JennyWWW/eval_splatsim_approach_lever_benchmark_1000_intervention",
  "jinhe1234/human_intervention_three_pos_pickup_9-rosbag",
  "jinhe1234/three_pos_pickup_39_include_risk_intervention",
  "pokeandwiggle/sample_rollout_with_intervention_build_cardboard_box",
  "Mechanichris/shirt_fold_core_plus_no_intervention_20260517_170115",
  "sarahnator/genesis-physical-interventions",
  "nuffnuff/yam-pour-direct-intervention-2",
  "mt-prox/recap_intervention0625",
  "rourou622/eval_s1_mix_plug_unplug_cable_round5_intervention",
  "YHRG/s1_mix_plug_cable_round5_intervention_add_unplug",
  "YHRG/s1_mix_plug_cable_round5_intervention_add_unplug_v2",
  "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round2_intervention",
  "YHRG/s1_mix_plug_cable_round3_intervention",
  "YHRG/s1_mix_plug_cable_round4_intervention",
  "YHRG/s1_mix_plug_cable_round5_intervention",
  "YHRG/s1_mix_plug_cable_round5_intervention_final",
  "YHRG/s1_mix_plug_cable_round6_intervention",
  "tanyz27/dobot_guadu_intervention_balanced",
  ...KELIN_IDS, KEWANG_ID, AJAY_ID,
  "borueihuang/pusht_intervention_rl_merged",
  "lsnu/simpler-sim-oracle-action-interventions",
  "aliy98/meta-quest-hil-dataset-intervention",
  "aliy98/vr_plus_hil_intervention_merged",
  "zaringleb/pick_single_cube_so101_with_corrective_actions",
  "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/noisier-corrective-sweep-cubes",
  "rdoshi21/ur5-noisier-corrective-sweep-cubes",
  "rdoshi21/noisiermore-corrective-sweep-cubes",
  "rdoshi21/easier-corrective-sweep-cubes",
  "rdoshi21/ur5-corrective-sweep-cubes",
  "rdoshi21/panda-corrective-sweep-cubes",
  "rdoshi21/final-corrective-sweep",
  "rdoshi21/panda-final-corrective",
  "rdoshi21/ur5-final-corrective",
  "rdoshi21/sim-handover-corrective-0819",
  "rdoshi21/sim-handover-corrective-1000-0820",
  "ashms1995/aic_joystick_teleop_corrective",
  "Dicomsky/human_inloop_grasp",
  "zhang-tian-yi/so101_human_in_loop_demo_online_dataset",
  "zhang-tian-yi/so101_human_in_loop_demo_offline_dataset",
  "zhang-tian-yi/so101_human_in_loop_demo_online_dataset_new",
  "zhang-tian-yi/so101_human_in_loop_demo_offline_dataset_new",
  "AnonymousMouse404/chess_human_in_the_loop",
]);

const FAMILY_OF = Object.freeze({
  "thewisp/intervention_cylinder_socket_feb_7":
    "thewisp/intervention_cylinder_socket_feb_3",
  "YHRG/s1_mix_plug_cable_round2_intervention":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round3_intervention":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round4_intervention":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round5_intervention":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round5_intervention_final":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round6_intervention":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round5_intervention_add_unplug":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "YHRG/s1_mix_plug_cable_round5_intervention_add_unplug_v2":
    "YHRG/s1_mix_plug_cable_round1_intervention",
  "rdoshi21/noisier-corrective-sweep-cubes":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/ur5-noisier-corrective-sweep-cubes":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/noisiermore-corrective-sweep-cubes":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/easier-corrective-sweep-cubes":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/ur5-corrective-sweep-cubes":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/panda-corrective-sweep-cubes":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/final-corrective-sweep":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/panda-final-corrective":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/ur5-final-corrective":
    "rdoshi21/corrective-sweep-cubes",
  "rdoshi21/sim-handover-corrective-1000-0820":
    "rdoshi21/sim-handover-corrective-0819",
  "zhang-tian-yi/so101_human_in_loop_demo_online_dataset_new":
    "zhang-tian-yi/so101_human_in_loop_demo_online_dataset",
  "zhang-tian-yi/so101_human_in_loop_demo_offline_dataset_new":
    "zhang-tian-yi/so101_human_in_loop_demo_offline_dataset",
  "aliy98/vr_plus_hil_intervention_merged":
    "aliy98/meta-quest-hil-dataset-intervention",
});

const OBVIOUS_NON_ROBOT_ID = /(?:parliament|congress|clinical|sepsis|malaria|education|counsel|reasoning-proj|sounique|french-open-data|data-gouv|electricsheep|aact|ctgov|substance-use|owid|premier-league|genetics|climate|aviation|quantum|energy-grid|alphafold|euv|jablonkagroup|collusion-paper|mo13_|mechanistic-unwinding|breaking-the-chain|budgeted-guardrails|anima-style|axobench|module-intervention-credit|dungeon|transcribe|sec-contracts|teacher-corrective|lemonseed|lilm1|chess-intervention-addition|humaninloopseg)/iu;

function fail(code, detail = null) {
  throw new Error(detail === null ? `HF_ROBOT_INTERVENTION_LEDGER_${code}`
    : `HF_ROBOT_INTERVENTION_LEDGER_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail(code); }
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((part) =>
      ["", ".", ".."].includes(part)) || path.posix.normalize(value) !== value) {
    fail("PATH_INVALID", String(value));
  }
  return value;
}

function checkedPath(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_ESCAPE", relative);
  return target;
}

function readPrivate(root, relative, expectedBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600
    || link.size > BigInt(MAX_CONTROL_BYTES)
    || expectedBytes !== null && link.size !== BigInt(expectedBytes)) {
    fail("PRIVATE_FILE_INVALID", relative);
  }
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    return bytes;
  } finally { closeSync(descriptor); }
}

function listPrivateFiles(root, prefix = "") {
  const directory = prefix === "" ? path.resolve(root) : checkedPath(root, prefix);
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_INVALID", prefix);
  const result = [];
  for (const name of sorted(readdirSync(directory))) {
    const relative = prefix === "" ? name : `${prefix}/${name}`;
    const child = lstatSync(checkedPath(root, relative), { bigint: true });
    if (child.isSymbolicLink()) fail("SYMLINK_FORBIDDEN", relative);
    if (child.isDirectory()) result.push(...listPrivateFiles(root, relative));
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) {
      result.push(relative);
    } else fail("ENTRY_INVALID", relative);
  }
  return result;
}

function licenseProjection(record, tags) {
  const raw = record.cardData?.license;
  const cardClaims = typeof raw === "string" ? [raw]
    : Array.isArray(raw) && raw.every((item) => typeof item === "string")
      ? raw : [];
  const tagClaims = tags.filter((tag) => tag.startsWith("license:"))
    .map((tag) => tag.slice("license:".length)).filter(Boolean);
  return sorted(new Set([...cardClaims, ...tagClaims]));
}

function identifierSignals(datasetId) {
  const lower = datasetId.toLowerCase();
  const signals = [];
  if (CURATED_ROBOT_IDS.has(datasetId)) signals.push("CURATED_ROBOT_CANDIDATE_ID");
  if (lower.includes("so101")) signals.push("IDENTIFIER_SO101");
  if (lower.includes("lerobot")) signals.push("IDENTIFIER_LEROBOT");
  if (lower.includes("dobot")) signals.push("IDENTIFIER_DOBOT");
  if (lower.includes("robot")) signals.push("IDENTIFIER_ROBOT_TOKEN");
  if (lower.includes("handover")) signals.push("IDENTIFIER_HANDOVER");
  if (lower.includes("plug") || lower.includes("cable")) {
    signals.push("IDENTIFIER_PLUG_OR_CABLE");
  }
  if (lower.includes("teleop")) signals.push("IDENTIFIER_TELEOP");
  if (lower.includes("grasp") || lower.includes("pickup")) {
    signals.push("IDENTIFIER_GRASP_OR_PICKUP");
  }
  return sorted(signals);
}

function projectRecord(record, queryKey) {
  if (!record || typeof record !== "object" || Array.isArray(record)
    || typeof record.id !== "string" || record.id.length === 0
    || !SHA1.test(record.sha ?? "") || typeof record.author !== "string"
    || record.private !== false || record.disabled !== false
    || ![false, "auto", "manual"].includes(record.gated)
    || !(record.description === undefined || record.description === null
      || typeof record.description === "string")
    || !Array.isArray(record.tags)
    || record.tags.some((tag) => typeof tag !== "string")) {
    fail("SEARCH_RECORD_INVALID", record?.id ?? queryKey);
  }
  const tags = sorted(record.tags);
  const description = typeof record.description === "string"
    ? record.description : "";
  const taskCategories = sorted(tags.filter((tag) =>
    tag.startsWith("task_categories:"))
    .map((tag) => tag.slice("task_categories:".length)));
  const modalities = sorted(tags.filter((tag) => tag.startsWith("modality:"))
    .map((tag) => tag.slice("modality:".length)));
  const formatClaims = sorted(tags.filter((tag) => tag.startsWith("format:"))
    .map((tag) => tag.slice("format:".length)));
  const signals = identifierSignals(record.id);
  const projectionCore = {
    taskCategories, modalities, formatClaims,
    librarySignals: tags.filter((tag) => ["lerobot", "datasets"].includes(tag)),
    publisherLicenseClaims: licenseProjection(record, tags),
    allTagsSha256: sha256(Buffer.from(tags.join("\n"), "utf8")),
    allTagsCount: tags.length,
    rawDescriptionPresent: description.length > 0,
    rawDescriptionBytes: Buffer.byteLength(description, "utf8"),
    rawDescriptionSha256: sha256(Buffer.from(description, "utf8")),
    identifierSignals: signals,
    roboticsTaskCategory: taskCategories.includes("robotics"),
    curatedRobotCandidateId: CURATED_ROBOT_IDS.has(record.id),
    obviousNonRobotIdentifierSignal: OBVIOUS_NON_ROBOT_ID.test(record.id),
  };
  return {
    datasetId: record.id, observedRevision: record.sha, author: record.author,
    queryMemberships: [queryKey],
    access: { publicRecord: true, private: false, gated: record.gated,
      disabled: false, publicUngated: record.gated === false },
    recordProjection: { ...projectionCore,
      stableProjectionHash: digest(
        `${HF_ROBOT_INTERVENTION_SOURCE_SCHEMA}/record-projection`, projectionCore),
    },
  };
}

function replayQueries(root) {
  const union = new Map();
  const querySummaries = [];
  const descriptors = [];
  for (const query of HF_ROBOT_INTERVENTION_QUERIES) {
    const beforePath = `queries/${query.key}-before.json`;
    const afterPath = `queries/${query.key}-after.json`;
    const before = readPrivate(root, beforePath, query.expectedBytes);
    const after = readPrivate(root, afterPath, query.expectedBytes);
    if (sha256(before) !== query.expectedSha256
      || sha256(after) !== query.expectedSha256 || !before.equals(after)) {
      fail("QUERY_BRACKET_INVALID", query.key);
    }
    const beforeRecords = parseJson(before, "QUERY_JSON_INVALID");
    const afterRecords = parseJson(after, "QUERY_JSON_INVALID");
    if (!Array.isArray(beforeRecords) || !Array.isArray(afterRecords)
      || beforeRecords.length !== query.expectedRecords
      || afterRecords.length !== query.expectedRecords) {
      fail("QUERY_COUNT_INVALID", query.key);
    }
    const beforeProjection = beforeRecords.map((record) =>
      projectRecord(record, query.key));
    const afterProjection = afterRecords.map((record) =>
      projectRecord(record, query.key));
    if (!same(beforeProjection, afterProjection)) {
      fail("QUERY_STABLE_PROJECTION_DRIFT", query.key);
    }
    for (const projected of beforeProjection) {
      const current = union.get(projected.datasetId);
      if (current) {
        if (current.observedRevision !== projected.observedRevision
          || !same(current.recordProjection, projected.recordProjection)
          || !same(current.access, projected.access)) {
          fail("CROSS_QUERY_RECORD_MISMATCH", projected.datasetId);
        }
        current.queryMemberships.push(query.key);
      } else union.set(projected.datasetId, projected);
    }
    querySummaries.push({ key: query.key, term: query.term, full: true,
      limit: 1_000, records: beforeRecords.length,
      beforeAfterExactBytes: before.equals(after), stableProjectionExact: true,
      bytes: before.length, sha256: sha256(before) });
    descriptors.push({ path: beforePath, bytes: before.length,
      sha256: sha256(before) }, { path: afterPath, bytes: after.length,
      sha256: sha256(after) });
  }
  const records = [...union.values()].sort((left, right) =>
    left.datasetId.localeCompare(right.datasetId));
  for (const record of records) record.queryMemberships.sort();
  if (records.length !== 258
    || records.some((record) => record.access.private || record.access.disabled)
    || records.filter((record) => record.access.gated !== false).length !== 2
    || new Set(records.map((record) => record.datasetId)).size !== 258) {
    fail("DECLARED_UNION_PROFILE_INVALID");
  }
  return { records, querySummaries, descriptors };
}

export function createHfRobotInterventionCoverageSnapshot(workspace) {
  const root = path.resolve(workspace);
  const evidence = COVERAGE_DEFINITIONS.map((definition) => ({
    key: definition.key, scopeRelation: definition.scopeRelation,
    datasetIds: sorted(definition.datasetIds), state: definition.state,
    files: definition.paths.map((relative) => {
      safeRelative(relative);
      const target = path.resolve(root, relative);
      const relation = path.relative(root, target);
      if (relation === "" || relation === ".."
        || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
        fail("WORKTREE_PATH_INVALID", relative);
      }
      const status = lstatSync(target);
      if (!status.isFile() || status.isSymbolicLink()) {
        fail("WORKTREE_EVIDENCE_NOT_REGULAR", relative);
      }
      const bytes = readFileSync(target);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!definition.datasetIds.some((datasetId) => text.includes(datasetId))) {
        fail("WORKTREE_EVIDENCE_ID_MISSING", relative);
      }
      return { path: relative, bytes: bytes.length, sha256: sha256(bytes),
        mode: status.mode & 0o777, containsDatasetAnchor: true };
    }),
  }));
  const body = {
    schema: "outsider/hf-robot-intervention-worktree-coverage-snapshot/v1",
    scanScope: "EXACT_DECLARED_CROSSWALK_EVIDENCE_PATHS", evidence,
  };
  return deepFreeze({ ...body,
    snapshotHash: digest(COVERAGE_DOMAIN, body) });
}

function validateCoverageSnapshot(value) {
  if (!value || value.schema !==
      "outsider/hf-robot-intervention-worktree-coverage-snapshot/v1"
    || value.scanScope !== "EXACT_DECLARED_CROSSWALK_EVIDENCE_PATHS"
    || !Array.isArray(value.evidence) || value.evidence.length !== 8
    || value.snapshotHash !== digest(COVERAGE_DOMAIN, {
      schema: value.schema, scanScope: value.scanScope, evidence: value.evidence,
    })) fail("COVERAGE_SNAPSHOT_INVALID");
  const expected = new Map(COVERAGE_DEFINITIONS.map((item) => [item.key, item]));
  for (const evidence of value.evidence) {
    const definition = expected.get(evidence.key);
    if (!definition || evidence.scopeRelation !== definition.scopeRelation
      || evidence.state !== definition.state
      || !same(evidence.datasetIds, sorted(definition.datasetIds))
      || evidence.files.length !== definition.paths.length
      || evidence.files.some((file, index) =>
        file.path !== definition.paths[index] || !HASH.test(file.sha256 ?? "")
        || !Number.isSafeInteger(file.bytes) || file.bytes < 1
        || ![0o600, 0o644].includes(file.mode)
        || file.containsDatasetAnchor !== true)) {
      fail("COVERAGE_EVIDENCE_INVALID", evidence?.key);
    }
  }
  return value;
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const replay = replayQueries(root);
  const coverageBytes = readPrivate(root, "worktree-coverage-snapshot.json");
  const coverage = validateCoverageSnapshot(parseJson(coverageBytes,
    "COVERAGE_JSON_INVALID"));
  const descriptors = [...replay.descriptors,
    { path: "worktree-coverage-snapshot.json", bytes: coverageBytes.length,
      sha256: sha256(coverageBytes) }].sort((left, right) =>
    left.path.localeCompare(right.path));
  const expectedFiles = [...descriptors.map((entry) => entry.path),
    ...(withManifest ? ["source-manifest.json"] : [])].sort();
  if (!same(listPrivateFiles(root), expectedFiles)) fail("SOURCE_LAYOUT_INVALID");
  return { root, ...replay, coverage, descriptors };
}

function manifestBody(collected) {
  return {
    schema: HF_ROBOT_INTERVENTION_SOURCE_SCHEMA,
    scope: HF_ROBOT_INTERVENTION_SCOPE,
    provider: "Hugging Face official datasets search API",
    queryParameters: collected.querySummaries.map((query) => ({
      key: query.key, term: query.term, full: true, limit: 1_000,
    })),
    queryBeforeAfterExactBytes: true, stableProjectionExact: true,
    querySummaries: collected.querySummaries,
    queryResultRows: 258, declaredUnionRecords: 258,
    incompleteDaggerReconnaissanceIncluded: false,
    sourceObjects: collected.descriptors,
    coverageSnapshotHash: collected.coverage.snapshotHash,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createHfRobotInterventionSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

function coverageByDataset(coverage) {
  const result = new Map();
  for (const group of coverage.evidence) {
    for (const datasetId of group.datasetIds) result.set(datasetId, {
      key: group.key, scopeRelation: group.scopeRelation, state: group.state,
      evidenceFileCount: group.files.length,
      evidenceRoot: digest(`${COVERAGE_DOMAIN}/dataset`, {
        datasetId, key: group.key, state: group.state, files: group.files,
      }),
    });
  }
  return result;
}

function dispositionFor(record, coverageMap) {
  if (HF_ROBOT_INTERVENTION_ALREADY_ACQUIRED_IDS.includes(record.datasetId)) {
    if (!coverageMap.has(record.datasetId)) {
      fail("ACQUIRED_COVERAGE_MISSING", record.datasetId);
    }
    return { code: "ALREADY_ACQUIRED_CURRENT_WORKTREE", terminal: true,
      reasonCode: coverageMap.get(record.datasetId).state,
      familyRepresentative: null, priorityRank: null };
  }
  if (record.access.gated !== false) {
    return { code: "GATED_NO_BYPASS", terminal: true,
      reasonCode: record.access.gated === "manual"
        ? "PUBLIC_RECORD_MANUAL_GATED_NO_BYPASS"
        : "PUBLIC_RECORD_AUTO_GATED_NO_BYPASS",
      familyRepresentative: null, priorityRank: null };
  }
  if (HF_ROBOT_INTERVENTION_ADMITTED_QUEUE_IDS.includes(record.datasetId)) {
    if (!coverageMap.has(record.datasetId)) {
      fail("QUEUE_COVERAGE_MISSING", record.datasetId);
    }
    return { code: "ADMITTED_CURRENT_QUEUE", terminal: true,
      reasonCode: "WORKTREE_MODULE_PRESENT_ARTIFACT_NOT_YET_PUBLISHED",
      familyRepresentative: null, priorityRank: null };
  }
  if (record.datasetId === AJAY_ID) {
    return { code: "PUBLIC_ROBOT_PRIORITY_CANDIDATE", terminal: true,
      reasonCode: "ROBOTICS_LEROBOT_DAGGER_INTERVENTION_SEARCH_PROJECTION",
      familyRepresentative: null, priorityRank: 1 };
  }
  if (Object.hasOwn(FAMILY_OF, record.datasetId)) {
    return { code: "DUPLICATE_OR_FAMILY", terminal: true,
      reasonCode: "PUBLISHER_IDENTIFIER_FAMILY_ONLY_NO_BYTE_IDENTITY_CLAIM",
      familyRepresentative: FAMILY_OF[record.datasetId], priorityRank: null };
  }
  const projectedRobotSignal = record.recordProjection.roboticsTaskCategory
    || record.recordProjection.curatedRobotCandidateId;
  if (projectedRobotSignal) {
    return { code: "PUBLIC_ROBOT_LOW_PRIORITY", terminal: true,
      reasonCode: record.recordProjection.roboticsTaskCategory
        ? "PUBLISHER_ROBOTICS_TASK_CATEGORY_NO_PAYLOAD_REPLAY"
        : "CURATED_IDENTIFIER_AND_MODALITY_SIGNAL_NO_PAYLOAD_REPLAY",
      familyRepresentative: null, priorityRank: null };
  }
  if (record.recordProjection.taskCategories.length > 0
    || record.recordProjection.obviousNonRobotIdentifierSignal) {
    return { code: "NOT_ROBOTIC_FALSE_POSITIVE", terminal: true,
      reasonCode: record.recordProjection.taskCategories.length > 0
        ? "EXPLICIT_NON_ROBOT_TASK_CATEGORY_IN_SEARCH_PROJECTION"
        : "EXPLICIT_NON_ROBOT_IDENTIFIER_DOMAIN_SIGNAL",
      familyRepresentative: null, priorityRank: null };
  }
  return { code: "METADATA_ONLY", terminal: true,
    reasonCode: "AMBIGUOUS_SEARCH_RECORD_NO_PAYLOAD_REPLAY",
    familyRepresentative: null, priorityRank: null };
}

function buildCandidateLedger(records, coverage) {
  const coverageMap = coverageByDataset(coverage);
  const entries = records.map((record) => {
    const disposition = dispositionFor(record, coverageMap);
    const familyRepresentative = disposition.familyRepresentative;
    return {
      ...record, disposition,
      worktreeCoverage: coverageMap.get(record.datasetId) ?? {
        key: null, scopeRelation: null, state: "NONE",
        evidenceFileCount: 0, evidenceRoot: null,
      },
      familyBoundary: familyRepresentative === null ? null : {
        representativeDatasetId: familyRepresentative,
        groupingBasis: "PUBLISHER_AND_IDENTIFIER_LINEAGE_ONLY",
        payloadByteIdentityEstablished: false,
        executionIdentityEstablished: false,
        duplicatePopulationClaimed: false,
      },
      rights: {
        publisherLicenseClaims:
          record.recordProjection.publisherLicenseClaims,
        publicAvailabilityTreatedAsUseAuthorization: false,
        rightsIndependentlyAdjudicated: false,
        redistributionAuthorizedByThisLedger: false,
        commercialUseAuthorizedByThisLedger: false,
        authorizedTrainingRows: 0,
      },
      privacy: {
        rawDescriptionStoredPrivate: true,
        rawDescriptionProjected: false,
        noPiiOrSensitiveDataGuaranteed: false,
        independentPrivacyReviewPerformed: false,
        rawPayloadBytesAcquiredByThisLedger: 0,
        rawVisualBytesAcquiredByThisLedger: 0,
      },
      activeContent: {
        candidatePayloadTreatedAsPotentiallyActiveOrAdversarial: true,
        payloadExecuted: false, commandExecuted: false,
        safeToExecuteEstablished: false,
      },
      semanticBoundary: {
        publisherNativeInterventionRowsReplayed: 0,
        humanAuthorizedInterventionRows: 0,
        publisherNativeOutcomeRowsReplayed: 0,
        independentlyVerifiedOutcomeRows: 0,
        publisherNativeRecoveryRowsReplayed: 0,
        independentlyVerifiedRecoveryRows: 0,
        physicalExecutionRowsEstablished: 0,
        completeAttemptCensusEstablished: false,
        searchMetadataPromotedToPayloadFacts: false,
      },
      useBoundary: {
        authorizedTrainingRows: 0, offlineTrainingRows: 0,
        productionTrainingRows: 0, networkAdmissionRows: 0,
        authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
      },
    };
  });
  for (const entry of entries.filter((item) => item.familyBoundary)) {
    if (!entries.some((candidate) => candidate.datasetId
      === entry.familyBoundary.representativeDatasetId)) {
      fail("FAMILY_REPRESENTATIVE_MISSING", entry.datasetId);
    }
  }
  const counts = Object.fromEntries(sorted(new Set(entries.map((entry) =>
    entry.disposition.code))).map((code) => [code,
    entries.filter((entry) => entry.disposition.code === code).length]));
  if (entries.length !== 258
    || new Set(entries.map((entry) => entry.datasetId)).size !== 258
    || entries.some((entry) => entry.disposition.terminal !== true)
    || Object.values(counts).reduce((sum, count) => sum + count, 0) !== 258) {
    fail("DISPOSITION_PROFILE_INVALID", JSON.stringify(counts));
  }
  return { entries, counts, ledgerHash: digest(LEDGER_DOMAIN, entries) };
}

function buildCrosswalk(records, coverage) {
  const inScope = new Set(records.map((record) => record.datasetId));
  const byKey = new Map(coverage.evidence.map((item) => [item.key, item]));
  return [
    { subject: "KeWang peg", datasetIds: [KEWANG_ID],
      scopeRelation: "IN_DECLARED_QUERY_UNION",
      terminalState: "ALREADY_ACQUIRED_CURRENT_WORKTREE",
      evidenceGroup: "kewang-peg-intervention" },
    { subject: "Jia handover", datasetIds: [...JIA_IDS],
      scopeRelation: "IN_DECLARED_QUERY_UNION",
      terminalState: "ALREADY_ACQUIRED_CURRENT_WORKTREE",
      evidenceGroup: "jia-handover-linked-lineage" },
    { subject: "Kelin lineage", datasetIds: [...KELIN_IDS],
      scopeRelation: "IN_DECLARED_QUERY_UNION",
      terminalState: "ADMITTED_CURRENT_QUEUE",
      evidenceGroup: "kelin-kewang-linked-lineage" },
    { subject: "Ajay dagger interventions", datasetIds: [AJAY_ID],
      scopeRelation: "IN_DECLARED_QUERY_UNION",
      terminalState: "PUBLIC_ROBOT_PRIORITY_CANDIDATE",
      evidenceGroup: null },
    { subject: "mt-prox RECAP token", datasetIds: [
      "mt-prox/recap_intervention0625"],
      scopeRelation: "IN_DECLARED_QUERY_UNION",
      terminalState: "PUBLIC_ROBOT_LOW_PRIORITY",
      evidenceGroup: null,
      producerBoundary:
        "DISTINCT_FROM_APASZYNSKA_RECAP; SHARED_RECAP_TOKEN_IS_NOT_SOURCE_IDENTITY" },
    { subject: "apaszynska RECAP", datasetIds: [
      "apaszynska/so101-cup-recap-20ep"],
      scopeRelation: "OUTSIDE_DECLARED_QUERY_UNION_EXISTING_WORKTREE_ARTIFACT",
      terminalState: "NOT_COUNTED_IN_258_RECORD_LEDGER",
      evidenceGroup: "apaszynska-recap" },
    { subject: "Takuya HIL/RL", datasetIds: [
      "TakuyaHiraoka/so101_pick_diverse_objects_hil_round1",
      "TakuyaHiraoka/so101_pick_diverse_objects_rl_round1"],
      scopeRelation: "OUTSIDE_DECLARED_QUERY_UNION_EXISTING_WORKTREE_ARTIFACT",
      terminalState: "NOT_COUNTED_IN_258_RECORD_LEDGER",
      evidenceGroup: "takuya-so101-hil-rl" },
    { subject: "HABIT", datasetIds: ["configinc/HABIT"],
      scopeRelation: "OUTSIDE_DECLARED_QUERY_UNION_EXISTING_WORKTREE_ARTIFACT",
      terminalState: "NOT_COUNTED_IN_258_RECORD_LEDGER",
      evidenceGroup: "habit" },
    { subject: "RBY1", datasetIds: ["RB3159/rby1-fold-v1.1"],
      scopeRelation: "OUTSIDE_DECLARED_QUERY_UNION_EXISTING_WORKTREE_ARTIFACT",
      terminalState: "NOT_COUNTED_IN_258_RECORD_LEDGER",
      evidenceGroup: "rby1" },
    { subject: "Plug93", datasetIds: [
      "tliangucl/realrobot-plug93-recovery-v2"],
      scopeRelation: "OUTSIDE_DECLARED_QUERY_UNION_EXISTING_WORKTREE_ARTIFACT",
      terminalState: "NOT_COUNTED_IN_258_RECORD_LEDGER",
      evidenceGroup: "plug93" },
  ].map((entry) => {
    const expectedInScope = entry.scopeRelation === "IN_DECLARED_QUERY_UNION";
    if (entry.datasetIds.some((id) => inScope.has(id)) !== expectedInScope) {
      fail("CROSSWALK_SCOPE_INVALID", entry.subject);
    }
    if (entry.evidenceGroup !== null && !byKey.has(entry.evidenceGroup)) {
      fail("CROSSWALK_EVIDENCE_MISSING", entry.subject);
    }
    return entry;
  });
}

export function buildHfRobotInterventionArtifactFromSourceDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, true);
  const manifestCore = manifestBody(collected);
  const sourceManifest = deepFreeze({ ...manifestCore,
    manifestHash: digest(MANIFEST_DOMAIN, manifestCore) });
  const storedManifest = readPrivate(collected.root, "source-manifest.json");
  if (!serialize(sourceManifest).equals(storedManifest)) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const ledger = buildCandidateLedger(collected.records, collected.coverage);
  const crosswalk = buildCrosswalk(collected.records, collected.coverage);
  const licenseClaimCounts = {};
  for (const entry of ledger.entries) {
    const claims = entry.rights.publisherLicenseClaims.length === 0
      ? ["UNDECLARED"] : entry.rights.publisherLicenseClaims;
    for (const claim of claims) licenseClaimCounts[claim] =
      (licenseClaimCounts[claim] ?? 0) + 1;
  }
  const priorityQueue = ledger.entries
    .filter((entry) => entry.disposition.code
      === "PUBLIC_ROBOT_PRIORITY_CANDIDATE")
    .sort((left, right) => left.disposition.priorityRank
      - right.disposition.priorityRank)
    .map((entry) => ({ rank: entry.disposition.priorityRank,
      datasetId: entry.datasetId, revision: entry.observedRevision,
      reasonCode: entry.disposition.reasonCode,
      payloadBytesAcquiredByThisLedger: 0 }));
  const reportBody = {
    schema: HF_ROBOT_INTERVENTION_LEDGER_SCHEMA,
    disposition: HF_ROBOT_INTERVENTION_DISPOSITION,
    scope: {
      kind: HF_ROBOT_INTERVENTION_SCOPE,
      provider: "Hugging Face official datasets search API",
      exactQueries: collected.querySummaries.map((query) => ({
        key: query.key, term: query.term, full: true, limit: 1_000,
        records: query.records,
      })),
      queryResultRows: 258, unionDatasetRecords: 258,
      priorHumanInLoopReconnaissanceCountFromTaskContext: 3,
      formalHumanInLoopCount: 9,
      priorReconnaissanceIsNotFormalSourceEvidence: true,
      incompleteDaggerThousandResultReconnaissanceIncluded: false,
      payloadFilesAcquiredByThisLedger: 0,
      payloadBytesAcquiredByThisLedger: 0,
      terminalMeansSearchRecordDispositionNotPayloadExhaustion: true,
    },
    source: {
      queryBeforeAfterExactBytes: true, stableProjectionExact: true,
      querySummaries: collected.querySummaries,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: sha256(storedManifest),
      sourceRoot: sourceManifest.sourceRoot,
      coverageSnapshotHash: collected.coverage.snapshotHash,
      rawSearchJsonPrivate: true, rawDescriptionsProjectedIntoReport: false,
      rawDescriptionsOrPayloadsExecuted: false,
    },
    discovery: {
      declaredScopeExhausted: true, globalExhaustion: false,
      sourceUniverseExhausted: false,
      unionDatasetRecords: 258, terminalDatasetRecords: 258,
      publicRecords: 258, publicUngatedRecords: 256,
      gatedRecords: 2, gatedManualRecords: 2, gatedAutoRecords: 0,
      privateRecords: 0, disabledRecords: 0,
      dispositionCounts: ledger.counts,
      terminalDefinition:
        "ONE TERMINAL DISCOVERY DISPOSITION PER FORMAL SEARCH RECORD; FAMILY IS IDENTIFIER LINEAGE ONLY AND PRIORITY DOES NOT ACQUIRE PAYLOAD",
    },
    worktreeCoverage: {
      snapshotKind: collected.coverage.scanScope,
      evidenceGroups: collected.coverage.evidence.length,
      inScopeExistingAcquiredRecords:
        HF_ROBOT_INTERVENTION_ALREADY_ACQUIRED_IDS.length,
      admittedCurrentQueueRecords:
        HF_ROBOT_INTERVENTION_ADMITTED_QUEUE_IDS.length,
      existingAdaptersModifiedByThisLedger: false,
      coverageSnapshotHash: collected.coverage.snapshotHash,
    },
    crosswalk: { entries: crosswalk,
      inScopeEntries: crosswalk.filter((entry) =>
        entry.scopeRelation === "IN_DECLARED_QUERY_UNION").length,
      outsideScopeExistingEntries: crosswalk.filter((entry) =>
        entry.scopeRelation.startsWith("OUTSIDE_DECLARED_QUERY_UNION")).length,
      outsideScopeEntriesNotCountedInLedger: true },
    candidateLedger: { entries: ledger.entries, ledgerHash: ledger.ledgerHash,
      rawDescriptionProjectionRows: 0, rawPayloadProjectionRows: 0 },
    priorityQueue: { entries: priorityQueue,
      queuedDatasetRecords: priorityQueue.length,
      payloadDownloadsPerformedByThisLedger: 0 },
    rights: {
      publisherLicenseClaimCounts: Object.fromEntries(Object.entries(
        licenseClaimCounts).sort(([left], [right]) => left.localeCompare(right))),
      publisherClaimsAreNotLegalConclusions: true,
      rightsIndependentlyAdjudicatedRows: 0,
      authorizedTrainingRows: 0, redistributionAuthorizedRows: 0,
      commercialUseAuthorizedRows: 0,
    },
    privacy: {
      rawDescriptionsPrivate: true,
      noPiiOrSensitiveDataGuaranteedRows: 0,
      independentPrivacyReviewRows: 0,
      rawPayloadBytesAcquired: 0, rawVisualBytesAcquired: 0,
    },
    activeContent: {
      candidatesTreatedAsPotentiallyActiveOrAdversarial: 258,
      payloadsExecuted: 0, commandsExecuted: 0, networkActionsReplayed: 0,
    },
    semanticBoundary: {
      publisherNativeInterventionRowsReplayed: 0,
      humanAuthorizedInterventionRows: 0,
      physicalExecutionRowsEstablished: 0,
      publisherNativeOutcomeRowsReplayed: 0,
      independentlyVerifiedOutcomeRows: 0,
      publisherNativeRecoveryRowsReplayed: 0,
      independentlyVerifiedRecoveryRows: 0,
      completeAttemptCensusEstablished: false,
      searchMetadataSignalsPromotedToPayloadFacts: false,
    },
    boundary: {
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createHfRobotInterventionReceipt(report, reportBytes,
  manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: HF_ROBOT_INTERVENTION_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: HF_ROBOT_INTERVENTION_SCOPE,
    unionDatasetRecords: 258, terminalDatasetRecords: 258,
    declaredScopeExhausted: true, globalExhaustion: false,
    sourceUniverseExhausted: false,
    payloadBytesAcquiredByThisLedger: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyHfRobotInterventionArtifactDirectory(directory) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)),
        ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readPrivate(root, "report.json");
    const receiptBytes = readPrivate(root, "run-receipt.json");
    const built = buildHfRobotInterventionArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!reportBytes.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestBytes = readPrivate(root, "source/source-manifest.json");
    const receipt = createHfRobotInterventionReceipt(
      built.report, expectedReport, manifestBytes);
    if (!receiptBytes.equals(serialize(receipt))) fail("RECEIPT_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeHfRobotInterventionArtifact(value) {
  return serialize(value);
}
