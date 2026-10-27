/*
 * Fixed-revision, source-first replay of fastwalker1118/B1k_Recovery task5.
 *
 * The selected payload is the complete metadata closure plus the first complete
 * episode (data Parquet and all three MP4s) from each publisher source family.
 * Publisher family names, rewards, and termination flags are not promoted to
 * independent outcomes or recovery effects.  task31 metadata is retained only
 * as a terminal, non-additive sibling disposition.  No downloaded code exists
 * in this slice and no source payload is executed.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants, existsSync, lstatSync, openSync, closeSync, readFileSync,
  readSync, readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const B1K_RECOVERY_DATASET_ID = "fastwalker1118/B1k_Recovery";
export const B1K_RECOVERY_REVISION =
  "eb0bd72d33e2bcde836a5bd8ad78d369e48337da";
export const B1K_RECOVERY_SCOPE =
  "COMPLETE_METADATA_PLUS_FOUR_SOURCE_FAMILY_EPISODES";
export const B1K_RECOVERY_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";
export const B1K_RECOVERY_REPORT_SCHEMA =
  "outsider/b1k-task5-recovery-family-slice/v1";
export const B1K_RECOVERY_RECEIPT_SCHEMA =
  "outsider/b1k-task5-recovery-family-slice-receipt/v1";

const SOURCE_SCHEMA = "outsider/b1k-task5-recovery-family-source/v1";
const MANIFEST_DOMAIN = "outsider/b1k-task5-recovery-family-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/b1k-task5-recovery-family-source-root/v1";
const TREE_ROOT_DOMAIN = "outsider/b1k-task5-recovery-family-tree-root/v1";
const REPORT_DOMAIN = "outsider/b1k-task5-recovery-family-report/v1";
const RECEIPT_DOMAIN = "outsider/b1k-task5-recovery-family-receipt/v1";
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{64}$/u;
const GIT_OID = /^[a-f0-9]{40}$/u;
const MAX_SMALL_BYTES = 12 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const INVENTORY_PAGES = 24;
const SELECTED_CAP_BYTES = 300_000_000;

const EXPECTED = Object.freeze({
  recordSha256: "sha256:2b66e1b23a66aab7ddde4c6c1c8eed201b520014ab217608a236e25634d6bf39",
  rootTreeSha256: "sha256:90c0e44086310e0cd92c5bd3f3ad429a8a68ad7b31fe551569c4277f76889e49",
  task5TreeSha256: "sha256:dd906f5cf55955b07f096fdf12639be7714e590ad62e077aa9e94c0aa1bc4fa5",
  task5GroupTreeSha256: "sha256:54a4079b5202a916db69fb0d61611f2e8be6cde0fdf39ae9b1980dd9fe43f9ed",
  task5MetaTreeSha256: "sha256:4363f4dbce94889abbb532101948540a028d86c4ce41832a7e52366ee18e65dc",
  task31TreeSha256: "sha256:9b7c3aa263425986bb2570ada14b61631b83916535adb38d91b41fb8408b46bd",
  task31SegmentedMetaTreeSha256:
    "sha256:876efb4f77c11b592527a3c54cf462e6162058c2e3107cddbe165f5472da03eb",
  task31SuccessMetaTreeSha256:
    "sha256:5226d1ea6df8f40d4b3b6c4af4aa6d961ac5293d2bdb1d9b815a14d9e51cf720",
  task5InventoryRoot:
    "sha256:d1c044a937a95f95c0c27107f6d3dfb462dd8b11bb25f951f83fcd533f44b1aa",
  repositorySiblingFiles: 29_432,
  task5Entries: 23_227,
  task5Files: 23_190,
  task5Directories: 37,
  task5Bytes: 7_770_678_832,
  task5DataFiles: 5_795,
  task5DataBytes: 1_456_211_193,
  task5VideoFiles: 17_385,
  task5VideoBytes: 6_282_342_523,
  task5MetaFiles: 10,
  task5MetaBytes: 32_125_116,
  task5LfsFiles: 23_187,
  selectedPayloadFiles: 16,
  selectedPayloadBytes: 45_457_994,
  completeTask5MetadataFiles: 10,
  completeTask5MetadataBytes: 32_125_116,
  acquiredRepositoryPayloadFiles: 34,
  acquiredRepositoryPayloadBytes: 77_747_115,
});

function payload(pathValue, bytes, oid, lfsOid, xetHash, sha256) {
  return Object.freeze({ path: pathValue, bytes, oid,
    lfs: lfsOid === null ? null : Object.freeze({ oid: lfsOid, size: bytes }),
    xetHash, sha256: `sha256:${sha256}` });
}

const PAYLOADS = Object.freeze([
  payload(".gitattributes", 2504, "bed0738c7eeb449bca98b5d2f33c89a1ee56349a", null, null, "9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb"),
  payload("README.md", 7237, "628b6888cd9e5658a4fb0909fd84c4cf0212b2c1", null, null, "e6d97330c0dec2bcc0416587b05dc8297380e5e65c4595ecd4c293df3c8572d1"),
  payload("task31/b1k_task31_human+segmented_success/meta/episodes/chunk-000/file-000.parquet", 103282, "e2b7ca8e84fd6f0cc05f790668a21db8e9c35e6f", "f0306fbb225ddf17a9d88b236c2ef58437a467ff2f3a4715428a58c3f1776d30", "df990917aee27246f8d095d2075e30bc4bc910757e4ca0d7a3a90ec6e1b1d7b5", "f0306fbb225ddf17a9d88b236c2ef58437a467ff2f3a4715428a58c3f1776d30"),
  payload("task31/b1k_task31_human+segmented_success/meta/info.json", 3096, "905b22e629528f133283ac87cb340521ce0af167", null, null, "4b78e285e9b1c65312e92a1b707695b1b85010c6da881f04c37a05972788fcf0"),
  payload("task31/b1k_task31_human+segmented_success/meta/tasks.parquet", 2078, "126e1622288526c835e74442ee004ac04138d2c6", "593e162e20af1b01bdbc19e341dbb6475cf9d00973c7d64c9cf997c4519b50bf", "fa2429024fe232d51e8a9acfc6dcbe0df4ac6294f3115c517f28d45fd66e0b53", "593e162e20af1b01bdbc19e341dbb6475cf9d00973c7d64c9cf997c4519b50bf"),
  payload("task31/b1k_task31_human+success/meta/episodes/chunk-000/file-000.parquet", 40636, "03c6420e4d8c02fc3b0df27fe9b35bbfa90bbec8", "21463c4ff138a37e560f800feaf5644d101248ce5a9fa09c13fe4d870a79f951", "6ca3d00fcb38a8c8f34d0276523323b2c949a18250005ee73a1572c3d71bd55b", "21463c4ff138a37e560f800feaf5644d101248ce5a9fa09c13fe4d870a79f951"),
  payload("task31/b1k_task31_human+success/meta/info.json", 3094, "8473bdc378818bd9ec32aef5b5b8c5e0c0422512", null, null, "4c8ee5e04c8e616e2571fabb759cf2c26be94b9f1de162c4317ce38003f2f5de"),
  payload("task31/b1k_task31_human+success/meta/tasks.parquet", 2078, "126e1622288526c835e74442ee004ac04138d2c6", "593e162e20af1b01bdbc19e341dbb6475cf9d00973c7d64c9cf997c4519b50bf", "fa2429024fe232d51e8a9acfc6dcbe0df4ac6294f3115c517f28d45fd66e0b53", "593e162e20af1b01bdbc19e341dbb6475cf9d00973c7d64c9cf997c4519b50bf"),
  payload("task5/Demo+Recovery+Success/data/chunk-000/file-000.parquet", 5034050, "4f34a3cfd3a3aac00c33e996d179f28236a3e98c", "84dd2a667be484375b5d0888d9cf9ed97287f210f190c57ac256a9115f52d12f", "8143a38bc9d9a6cf932efd54d2a4834686fa4d1802c68fa06b024488ea2d1dc2", "84dd2a667be484375b5d0888d9cf9ed97287f210f190c57ac256a9115f52d12f"),
  payload("task5/Demo+Recovery+Success/data/chunk-000/file-200.parquet", 258915, "fe2b6fa685c37215d630228f39f32be66d44d083", "fdc1338bb2335b06ae583e11e1cc3d2ea6392a71226f28bfcf504a60b71ce716", "ff2e1b958a4840c35b3fb06326ba26f35222ffa14cb2337fbf376c7e76b98d4e", "fdc1338bb2335b06ae583e11e1cc3d2ea6392a71226f28bfcf504a60b71ce716"),
  payload("task5/Demo+Recovery+Success/data/chunk-001/file-370.parquet", 4125969, "d4f6823b5d81f0fa342f216e8c5e70cfba0a213d", "5c69e83ef75110db4e53ce15fea5f8ca707c86a01be629e34a768d59a961758b", "48a3eef8f4aa1ddfd01c5bf60c2ff84aa08dd227b1b19e38469b6d58638bd2bb", "5c69e83ef75110db4e53ce15fea5f8ca707c86a01be629e34a768d59a961758b"),
  payload("task5/Demo+Recovery+Success/data/chunk-001/file-407.parquet", 77280, "54bf54d0ce0b8aa52f5e98c2601d3c8f70f3a7bb", "72ca02954110a6b222bd82f29a2597956d78ce97860919fd171080a39ca4f78e", "d1548265a69b4bacddd357bbecef3a9fc4b8780931f1114514c35607d1ede473", "72ca02954110a6b222bd82f29a2597956d78ce97860919fd171080a39ca4f78e"),
  payload("task5/Demo+Recovery+Success/meta/conversion_manifest.jsonl", 1473736, "5d7016fe3725a2c66187c580dce720384a2e82e4", null, null, "e5884f9188f9bfb9362b7b4e67edda0b982467584bc6f656e044c2bca7581465"),
  payload("task5/Demo+Recovery+Success/meta/episodes/chunk-000/file-000.parquet", 5347418, "ef253413315d823430686b8aa7acb2c0282fce49", "bc33c8b7a079f5b71c3698dce0ffb1bea64d389a07cb12195d482522720fa872", "1509b831a9855f617cf0542309dd7e27d65cc108f07bab41f52be19ef5bf2731", "bc33c8b7a079f5b71c3698dce0ffb1bea64d389a07cb12195d482522720fa872"),
  payload("task5/Demo+Recovery+Success/meta/episodes/chunk-001/file-000.parquet", 5766333, "890ae43d3dc3f3f0bda1c91c75b9ed663e4ef8e4", "853827a1ff163f7c8959873e11cb528cbf6e4279183f756de7a0f5307679c7c9", "e1c992e3d16d77a95cd1a460c703f55760d2f574ce8f185580eeccf0f1fdaee0", "853827a1ff163f7c8959873e11cb528cbf6e4279183f756de7a0f5307679c7c9"),
  payload("task5/Demo+Recovery+Success/meta/episodes/chunk-002/file-000.parquet", 5096847, "3ec5d581d61f45252baf5e374ac4f46254dcd5c5", "206518e2f64d9641b09385814b94d948125db00f829bcfb422f02208df72646a", "d936853131d8f29b2505ccbfb0b894074893bb7de3d15b78af13eeb60f8c574c", "206518e2f64d9641b09385814b94d948125db00f829bcfb422f02208df72646a"),
  payload("task5/Demo+Recovery+Success/meta/episodes/chunk-003/file-000.parquet", 5131016, "3e011549fb5d3a96d00c0903c8460df42e824014", "50e03d006e73eefd086f9d7ee66a3fa37a87700e8db670dbcb01435a27315dc0", "753408355fa8204a84bd96487a948fe95d25293e23e5a01ae9256290d2eb3f6b", "50e03d006e73eefd086f9d7ee66a3fa37a87700e8db670dbcb01435a27315dc0"),
  payload("task5/Demo+Recovery+Success/meta/episodes/chunk-004/file-000.parquet", 5108182, "7cad0515904f5dcbcf93ddbf94e33d61b7bf94da", "7eec2fa1ba05fd90d3d1f3353d45bfecea5553792247c23d9c1c3d71bbbaea4e", "5d1c5facb94e9b1a22a2419b49028e41331009529866e1ae7ed59ba67f075fd4", "7eec2fa1ba05fd90d3d1f3353d45bfecea5553792247c23d9c1c3d71bbbaea4e"),
  payload("task5/Demo+Recovery+Success/meta/episodes/chunk-005/file-000.parquet", 4172298, "760cb614d687002e14619bf2a00a6be30fde91cf", "0bfb49f2b4d7fa55e86704ba54fa3a3e7ab161dec6c97a27ff7f93b76d3e5c76", "fe8458f3df6b6288984829df50180dab793ef22fe71c297e881f085e51e28ae0", "0bfb49f2b4d7fa55e86704ba54fa3a3e7ab161dec6c97a27ff7f93b76d3e5c76"),
  payload("task5/Demo+Recovery+Success/meta/info.json", 3097, "0217e7d33539cd209507beab770865ccbd175ddd", null, null, "655637849884ded6042f4e235c84f10faecb19567d3fee4ea8e99312b7b43d63"),
  payload("task5/Demo+Recovery+Success/meta/stats.json", 24109, "2af71074adad821ad83810e53ec9ab2bd9db460e", null, null, "099a550447c640c8874f90d662da694c4dd10c81ded781c5784d8f7ae603e010"),
  payload("task5/Demo+Recovery+Success/meta/tasks.parquet", 2080, "b0094ed397bdd45aaaedf85545571d790961d7fc", "196311a5129c8ae43d6d6d1316e0b653174cf988967b0cb1beff66cdc959b88e", "e2ea9f6bd28c98a00903913ed88c34c8dddc309b65bc351850c55232626a09d7", "196311a5129c8ae43d6d6d1316e0b653174cf988967b0cb1beff66cdc959b88e"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.left_realsense_link_camera_0/chunk-000/file-000.mp4", 5637894, "b58406ff7f1451f10d0d6f9b5f30267d9be262a1", "c4f34ee47b83ae7ac8c804d6f4c40b6a3978c0845c854ead5bc6a5bfd4cbf8ed", "272ae5710fd210756b2baf7f30dfe3a95c65494bc15785a858694ca3968c613e", "c4f34ee47b83ae7ac8c804d6f4c40b6a3978c0845c854ead5bc6a5bfd4cbf8ed"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.left_realsense_link_camera_0/chunk-000/file-200.mp4", 745952, "c90f55d0aee768cffca3b2cd247b28b914030e8e", "053de45c26877fedb87d19a1e57da096f77299835bf149269c7d63b695800758", "2eb59752e66465ce97e19845942707faedfa11fee363414df596e1bc30ef2883", "053de45c26877fedb87d19a1e57da096f77299835bf149269c7d63b695800758"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.left_realsense_link_camera_0/chunk-001/file-370.mp4", 6649112, "0cafcc6fd0627ab4eb82df3ac221fe3cd18ee1b5", "a289cd9a0c6e4c8c31bb43d2081e6a29af0c70b533119036fcc36bffb144f8ba", "a2c9e21091e22bd00ea9baab673a9e9ebcdf9f9338a66875beae9b9a22327d58", "a289cd9a0c6e4c8c31bb43d2081e6a29af0c70b533119036fcc36bffb144f8ba"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.left_realsense_link_camera_0/chunk-001/file-407.mp4", 67269, "6dd44f7d4c67827437140b15dbfee9985996d96a", "190bf96f260d835db8ce5ccb9563807329ba2687aacb0f41d66265b99abce0fe", "0bb90e7f42c740ccb9a5980c1350dfe3bad435e49b55ba400469cc75557cc825", "190bf96f260d835db8ce5ccb9563807329ba2687aacb0f41d66265b99abce0fe"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.right_realsense_link_camera_0/chunk-000/file-000.mp4", 5435220, "9770d86e6c5f8ba7faf4715282fcc1ad9474a31a", "f204d2ee536652ef92786d2019bdfa8dcf23f9ccdc9888261aefcc2d65ea4622", "9e82bcb86a70743dcbff0973a117cb93b104d83d1c0135140917e0a0ee8f468f", "f204d2ee536652ef92786d2019bdfa8dcf23f9ccdc9888261aefcc2d65ea4622"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.right_realsense_link_camera_0/chunk-000/file-200.mp4", 794839, "bde8d38e656e9b239072ae1115549060db988017", "7cfdf2734e96fc0a1d2320869808fd7242f48b70f9091f1b0595ce900b5c450d", "ab63e352299aa8c0b0f549bb31fb60e83a0e1c08b95280a6d42d537ba2e3a4b0", "7cfdf2734e96fc0a1d2320869808fd7242f48b70f9091f1b0595ce900b5c450d"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.right_realsense_link_camera_0/chunk-001/file-370.mp4", 6837003, "ce7addf9c2e5f28da9e28a4916e4da332e1d59c4", "69ebe077186525314b278bbdb76cfd708db3ce36ef013b1e0b36986d80267d05", "9ca7cfe75756d63e9b919acc2532b804d2acc752e838e3dc6d06e40f44aa6c70", "69ebe077186525314b278bbdb76cfd708db3ce36ef013b1e0b36986d80267d05"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.right_realsense_link_camera_0/chunk-001/file-407.mp4", 48311, "ddc00bd8059ca5e53338345e688eeb820e481e5f", "1a4a4ee0c91d2dc7040701ca50367ead595f14b26d5d9a6541990ab69c832f8f", "c23ab1a2a67153a70c537db488ec28a611452d955a55f4fdc3aa08c5a558aaba", "1a4a4ee0c91d2dc7040701ca50367ead595f14b26d5d9a6541990ab69c832f8f"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.zed_link_camera_0/chunk-000/file-000.mp4", 3831110, "eae225e4c7b2ecb265012605348d31b45daf619c", "f53d5a52810fd213de540afdcc05f7caf21060539691a3c31940a5f24ca3d74a", "12a38fa38fdd30300390198410b3b1e2752acb9a206e064fa595756e1703a120", "f53d5a52810fd213de540afdcc05f7caf21060539691a3c31940a5f24ca3d74a"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.zed_link_camera_0/chunk-000/file-200.mp4", 735254, "ee2fa1e668984035e17844d9e0037aead9e013f3", "771ef45f0d0aed32c5350115d2eede320283d72389d0c5d433bb54d9e1778413", "78b9033c43b46fcad6a4337f992170e4f5e76145a1ed55ad7452c8243f27097d", "771ef45f0d0aed32c5350115d2eede320283d72389d0c5d433bb54d9e1778413"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.zed_link_camera_0/chunk-001/file-370.mp4", 5128314, "19ce936fc6f7ee39a4a42e8d6f2078adec15416e", "6477ba5ed3b23f2c6e135e1302bdda2c20f85ea8e4f986dfdd6dee45f8fdcb5b", "8eb2c2d59d38f8bfdabeedb5d01ed1e33d184833fc60a4c167b46164ec9bf585", "6477ba5ed3b23f2c6e135e1302bdda2c20f85ea8e4f986dfdd6dee45f8fdcb5b"),
  payload("task5/Demo+Recovery+Success/videos/observation.rgb.zed_link_camera_0/chunk-001/file-407.mp4", 51502, "1438a3ec03cf56ab96b8012e25c0db7ec8e6a3bc", "0ce8b25e0070cd080757e4cb304290cd171470cccb4a1a3be02ae2ef0b3c7c77", "57d63ee59eff5a5e9da8aab450a5c212ad475087c877bd26cf3c4b0b8a6bda7f", "0ce8b25e0070cd080757e4cb304290cd171470cccb4a1a3be02ae2ef0b3c7c77"),
]);

const CAMERAS = Object.freeze([
  "observation.rgb.left_realsense_link_camera_0",
  "observation.rgb.right_realsense_link_camera_0",
  "observation.rgb.zed_link_camera_0",
]);

export const B1K_SELECTED_EPISODES = Object.freeze([
  Object.freeze({ family: "human2026", publisherClass: "OFFICIAL_HUMAN",
    episodeIndex: 0, chunk: 0, file: 0, frames: 12_850,
    sourceBasename: "episode_00000000_human2026.parquet" }),
  Object.freeze({ family: "nav", publisherClass: "GENERATED_NAVIGATION",
    episodeIndex: 200, chunk: 0, file: 200, frames: 701,
    sourceBasename: "episode_00000200_nav.parquet" }),
  Object.freeze({ family: "success", publisherClass: "GENERATED_SUCCESS_NAMED",
    episodeIndex: 1370, chunk: 1, file: 370, frames: 8_676,
    sourceBasename: "episode_00001370_success.parquet" }),
  Object.freeze({ family: "place", publisherClass: "GENERATED_PLACE_RECOVERY_NAMED",
    episodeIndex: 1407, chunk: 1, file: 407, frames: 180,
    sourceBasename: "episode_00001407_place.parquet" }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `B1K_RECOVERY_${code}`
    : `B1K_RECOVERY_${code}:${detail}`);
}

export function b1kRecoverySha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return b1kRecoverySha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function strictUtf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}

function parseJson(bytes, code) {
  try { return JSON.parse(strictUtf8(bytes, code)); }
  catch { fail(code); }
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}

function checkedPath(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}

function readRegular(root, relative, maximum = MAX_SMALL_BYTES) {
  const target = checkedPath(root, relative);
  const before = lstatSync(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o777n) !== 0o600n
    || before.size < 1n || before.size > BigInt(maximum)) fail("FILE_UNSAFE", relative);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const opened = lstatSync(target, { bigint: true });
    const actual = readFileSync(descriptor);
    const after = lstatSync(target, { bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino
      || after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || BigInt(actual.length) !== before.size) {
      fail("FILE_CHANGED", relative);
    }
    return actual;
  } finally { closeSync(descriptor); }
}

function hashRegular(root, relative, expectedBytes) {
  const target = checkedPath(root, relative);
  const before = lstatSync(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o777n) !== 0o600n
    || before.size !== BigInt(expectedBytes)) fail("PAYLOAD_FILE_UNSAFE", relative);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let total = 0;
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count)); total += count;
    }
  } finally { closeSync(descriptor); }
  const after = lstatSync(target, { bigint: true });
  if (total !== expectedBytes || after.dev !== before.dev || after.ino !== before.ino
    || after.size !== before.size) fail("PAYLOAD_FILE_CHANGED", relative);
  return `sha256:${hash.digest("hex")}`;
}

function sourceEvidenceFiles() {
  const fixed = [
    "metadata/dataset-record-before.json", "metadata/dataset-record-after.json",
    "metadata/root-tree.json", "metadata/task5-tree.json",
    "metadata/task5-group-tree.json", "metadata/task5-meta-tree.json",
    "metadata/task31-tree.json", "metadata/task31-segmented-meta-tree.json",
    "metadata/task31-success-meta-tree.json", "metadata/object-response-headers.json",
  ];
  for (const bracket of ["before", "after"]) {
    for (let index = 0; index < INVENTORY_PAGES; index += 1) {
      const name = `page-${String(index).padStart(3, "0")}`;
      fixed.push(`metadata/task5-full-tree-${bracket}/${name}.json`);
      fixed.push(`metadata/task5-full-tree-${bracket}/${name}.headers.json`);
    }
  }
  return fixed;
}

function expectedSourceFiles(includeManifest = true) {
  const files = [...sourceEvidenceFiles(), ...PAYLOADS.map((item) => `files/${item.path}`)];
  if (includeManifest) files.push("source-manifest.json");
  return files.sort();
}

function expectedDirectories(includeManifest = true) {
  const directories = new Set(["."]);
  for (const relative of expectedSourceFiles(includeManifest)) {
    const parts = relative.split("/"); parts.pop();
    let current = "";
    for (const part of parts) {
      current = current === "" ? part : `${current}/${part}`;
      directories.add(current);
    }
  }
  return [...directories].sort();
}

function walkPrivate(root, prefix = "") {
  const target = prefix === "" ? root : checkedPath(root, prefix);
  const status = lstatSync(target);
  if (status.isSymbolicLink()) fail("SYMLINK", prefix || ".");
  if ((status.mode & 0o777) !== (status.isDirectory() ? 0o700 : 0o600)) {
    fail("MODE", prefix || ".");
  }
  const files = []; const directories = [];
  if (!status.isDirectory()) return { files: [prefix], directories };
  directories.push(prefix || ".");
  for (const name of readdirSync(target).sort()) {
    const relative = prefix === "" ? name : `${prefix}/${name}`;
    const child = walkPrivate(root, relative);
    files.push(...child.files); directories.push(...child.directories);
  }
  return { files, directories };
}

function normalizeTreeEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)
    || !["file", "directory"].includes(entry.type)) fail("TREE_ENTRY_INVALID");
  safeRelative(entry.path);
  if (entry.type === "directory") {
    return { type: "directory", path: entry.path, oid: entry.oid ?? null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !GIT_OID.test(entry.oid)) {
    fail("TREE_FILE_INVALID", entry.path);
  }
  let lfs = null;
  if (entry.lfs !== undefined) {
    if (!entry.lfs || !SHA.test(entry.lfs.oid)
      || entry.lfs.size !== entry.size
      || !Number.isSafeInteger(entry.lfs.pointerSize)) fail("TREE_LFS_INVALID", entry.path);
    lfs = { oid: entry.lfs.oid, size: entry.lfs.size,
      pointerSize: entry.lfs.pointerSize };
  }
  const xetHash = entry.xetHash ?? null;
  if (xetHash !== null && !SHA.test(xetHash)) fail("TREE_XET_INVALID", entry.path);
  return { type: "file", path: entry.path, bytes: entry.size,
    oid: entry.oid, lfs, xetHash };
}

function readExpectedJson(root, relative, expectedHash) {
  const bytes = readRegular(root, relative);
  if (b1kRecoverySha256(bytes) !== expectedHash) fail("METADATA_HASH_INVALID", relative);
  return parseJson(bytes, relative);
}

function parsePageHeaders(root, bracket, index) {
  const name = `page-${String(index).padStart(3, "0")}.headers.json`;
  const value = parseJson(readRegular(root,
    `metadata/task5-full-tree-${bracket}/${name}`), name);
  if (!value || value.status !== 200 || typeof value.requestUrl !== "string"
    || typeof value.etag !== "string" || !Number.isSafeInteger(value.contentLength)
    || (value.nextUrl !== null && typeof value.nextUrl !== "string")) {
    fail("PAGE_HEADERS_INVALID", `${bracket}:${index}`);
  }
  const request = new URL(value.requestUrl);
  if (request.origin !== "https://huggingface.co"
    || !decodeURIComponent(request.pathname).includes(B1K_RECOVERY_REVISION)) {
    fail("PAGE_REQUEST_URL_INVALID", `${bracket}:${index}`);
  }
  return value;
}

function replayInventoryBracket(root, bracket) {
  const entries = [];
  let expectedUrl = null;
  for (let index = 0; index < INVENTORY_PAGES; index += 1) {
    const name = `page-${String(index).padStart(3, "0")}`;
    const bytes = readRegular(root,
      `metadata/task5-full-tree-${bracket}/${name}.json`, 512 * 1024);
    const headers = parsePageHeaders(root, bracket, index);
    if (headers.contentLength !== bytes.length
      || expectedUrl !== null && headers.requestUrl !== expectedUrl) {
      fail("PAGE_CHAIN_INVALID", `${bracket}:${index}`);
    }
    const page = parseJson(bytes, `${bracket}:${name}`);
    const expectedRows = index < INVENTORY_PAGES - 1 ? 1000 : 227;
    if (!Array.isArray(page) || page.length !== expectedRows
      || (index < INVENTORY_PAGES - 1) !== (headers.nextUrl !== null)) {
      fail("PAGE_ROWS_INVALID", `${bracket}:${index}`);
    }
    entries.push(...page.map(normalizeTreeEntry));
    expectedUrl = headers.nextUrl;
  }
  const paths = entries.map((item) => item.path);
  if (new Set(paths).size !== entries.length) fail("TREE_DUPLICATE_PATH");
  const directories = entries.filter((item) => item.type === "directory");
  const files = entries.filter((item) => item.type === "file");
  if (directories.some((item, index) => index > 0
    && directories[index - 1].path >= item.path)
    || files.some((item, index) => index > 0 && files[index - 1].path >= item.path)) {
    fail("TREE_ORDER_INVALID");
  }
  const rootHash = digest(TREE_ROOT_DOMAIN, entries);
  if (rootHash !== EXPECTED.task5InventoryRoot
    || entries.length !== EXPECTED.task5Entries
    || files.length !== EXPECTED.task5Files
    || directories.length !== EXPECTED.task5Directories
    || files.reduce((sum, item) => sum + item.bytes, 0) !== EXPECTED.task5Bytes) {
    fail("TREE_PROFILE_INVALID", bracket);
  }
  return { entries, files, directories, rootHash };
}

function inventoryProfile(inventory) {
  const prefix = "task5/Demo+Recovery+Success/";
  const count = (sub) => inventory.files.filter((item) =>
    item.path.startsWith(`${prefix}${sub}/`));
  const data = count("data"); const videos = count("videos"); const meta = count("meta");
  const bytes = (items) => items.reduce((sum, item) => sum + item.bytes, 0);
  if (data.length !== EXPECTED.task5DataFiles || bytes(data) !== EXPECTED.task5DataBytes
    || videos.length !== EXPECTED.task5VideoFiles
    || bytes(videos) !== EXPECTED.task5VideoBytes
    || meta.length !== EXPECTED.task5MetaFiles || bytes(meta) !== EXPECTED.task5MetaBytes
    || inventory.files.filter((item) => item.lfs !== null).length !== EXPECTED.task5LfsFiles
    || inventory.files.filter((item) => item.xetHash !== null).length !== EXPECTED.task5LfsFiles) {
    fail("TREE_CATEGORY_PROFILE_INVALID");
  }
  const cameras = Object.fromEntries(CAMERAS.map((camera) => {
    const matches = videos.filter((item) => item.path.includes(`/videos/${camera}/`));
    return [camera, { files: matches.length, bytes: bytes(matches) }];
  }));
  if (Object.values(cameras).some((item) => item.files !== 5_795)) {
    fail("CAMERA_TREE_PROFILE_INVALID");
  }
  return { data: { files: data.length, bytes: bytes(data) },
    videos: { files: videos.length, bytes: bytes(videos) },
    metadata: { files: meta.length, bytes: bytes(meta) }, cameras };
}

function validatePayloadAgainstTree(specification, inventory, supportTrees) {
  let remote = inventory.files.find((item) => item.path === specification.path);
  if (remote === undefined) {
    remote = supportTrees.flat().map(normalizeTreeEntry).find((item) =>
      item.type === "file" && item.path === specification.path);
  }
  if (!remote || remote.bytes !== specification.bytes || remote.oid !== specification.oid
    || (remote.lfs?.oid ?? null) !== (specification.lfs?.oid ?? null)
    || remote.xetHash !== specification.xetHash) fail("PAYLOAD_TREE_IDENTITY", specification.path);
}

function readObjectHeaders(root) {
  const rows = parseJson(readRegular(root, "metadata/object-response-headers.json"),
    "object-response-headers");
  if (!Array.isArray(rows) || rows.length !== PAYLOADS.length
    || !same(rows.map((item) => item.path), PAYLOADS.map((item) => item.path))) {
    fail("OBJECT_HEADERS_CENSUS_INVALID");
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]; const spec = PAYLOADS[index];
    if (![302, 307].includes(row.status)
      || row.headers?.xRepoCommit !== B1K_RECOVERY_REVISION
      || row.headers?.xLinkedEtag !== `\"${spec.lfs?.oid ?? spec.oid}\"`
      || (spec.lfs !== null && (row.headers.xLinkedSize !== String(spec.bytes)
        || row.headers.xXetHash !== spec.xetHash))) {
      fail("OBJECT_HEADERS_INVALID", spec.path);
    }
  }
  return rows;
}

function collectSource(root, requireManifest = true) {
  const resolved = path.resolve(root);
  const status = lstatSync(resolved);
  if (!status.isDirectory() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o700) {
    fail("SOURCE_ROOT_UNSAFE");
  }
  const walked = walkPrivate(resolved);
  if (!same(walked.files.sort(), expectedSourceFiles(requireManifest))
    || !same(walked.directories.sort(), expectedDirectories(requireManifest))) {
    fail("SOURCE_TOPOLOGY_INVALID");
  }
  const recordBeforeBytes = readRegular(resolved, "metadata/dataset-record-before.json");
  const recordAfterBytes = readRegular(resolved, "metadata/dataset-record-after.json");
  if (!recordBeforeBytes.equals(recordAfterBytes)
    || b1kRecoverySha256(recordBeforeBytes) !== EXPECTED.recordSha256) {
    fail("RECORD_BRACKET_INVALID");
  }
  const record = parseJson(recordBeforeBytes, "dataset-record");
  if (record.id !== B1K_RECOVERY_DATASET_ID || record.sha !== B1K_RECOVERY_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.usedStorage !== 26_353_425_962 || record.cardData?.license !== undefined
    || !Array.isArray(record.siblings)
    || record.siblings.length !== EXPECTED.repositorySiblingFiles) {
    fail("RECORD_PROFILE_INVALID");
  }
  const siblingPaths = record.siblings.map((item) => item.rfilename);
  if (new Set(siblingPaths).size !== siblingPaths.length
    || !same(siblingPaths, [...siblingPaths].sort())
    || siblingPaths.filter((item) => item.startsWith("task5/")).length !== 23_190
    || siblingPaths.filter((item) => item.startsWith("task31/")).length !== 6_240) {
    fail("RECORD_SIBLING_CENSUS_INVALID");
  }
  const supportSpecs = [
    ["metadata/root-tree.json", EXPECTED.rootTreeSha256],
    ["metadata/task5-tree.json", EXPECTED.task5TreeSha256],
    ["metadata/task5-group-tree.json", EXPECTED.task5GroupTreeSha256],
    ["metadata/task5-meta-tree.json", EXPECTED.task5MetaTreeSha256],
    ["metadata/task31-tree.json", EXPECTED.task31TreeSha256],
    ["metadata/task31-segmented-meta-tree.json", EXPECTED.task31SegmentedMetaTreeSha256],
    ["metadata/task31-success-meta-tree.json", EXPECTED.task31SuccessMetaTreeSha256],
  ];
  const supportTrees = supportSpecs.map(([relative, hash]) => {
    const value = readExpectedJson(resolved, relative, hash);
    if (!Array.isArray(value)) fail("SUPPORT_TREE_INVALID", relative);
    return value;
  });
  const before = replayInventoryBracket(resolved, "before");
  const after = replayInventoryBracket(resolved, "after");
  if (!same(before.entries, after.entries)) fail("TREE_BRACKET_INVALID");
  const profile = inventoryProfile(before);
  const headers = readObjectHeaders(resolved);
  const payloadDescriptors = PAYLOADS.map((specification) => {
    validatePayloadAgainstTree(specification, before, supportTrees);
    const relative = `files/${specification.path}`;
    const sha256 = hashRegular(resolved, relative, specification.bytes);
    if (sha256 !== specification.sha256) fail("PAYLOAD_HASH_INVALID", specification.path);
    return { path: relative, bytes: specification.bytes, sha256,
      oid: specification.oid, lfs: specification.lfs, xetHash: specification.xetHash };
  });
  const evidenceDescriptors = sourceEvidenceFiles().map((relative) => {
    const bytes = readRegular(resolved, relative, MAX_SMALL_BYTES);
    return { path: relative, bytes: bytes.length, sha256: b1kRecoverySha256(bytes) };
  });
  const descriptors = [...evidenceDescriptors, ...payloadDescriptors]
    .sort((left, right) => left.path.localeCompare(right.path));
  return { root: resolved, record, inventory: before, inventoryProfile: profile,
    objectHeaders: headers, payloadDescriptors, evidenceDescriptors, descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, descriptors) };
}

function manifestBody(collected) {
  return {
    schema: SOURCE_SCHEMA, datasetId: B1K_RECOVERY_DATASET_ID,
    revision: B1K_RECOVERY_REVISION, scope: B1K_RECOVERY_SCOPE,
    recordBeforeAfterExact: true, task5TreeBeforeAfterExact: true,
    task5InventoryPagesPerBracket: INVENTORY_PAGES,
    task5Entries: EXPECTED.task5Entries, task5Files: EXPECTED.task5Files,
    task5Directories: EXPECTED.task5Directories, task5Bytes: EXPECTED.task5Bytes,
    repositoryPayloadFiles: PAYLOADS.length,
    repositoryPayloadBytes: PAYLOADS.reduce((sum, item) => sum + item.bytes, 0),
    sourceObjects: collected.descriptors, sourceRoot: collected.sourceRoot,
  };
}

export function createB1kRecoverySourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

function parseBoxes(bytes, start, end, context) {
  const boxes = [];
  let cursor = start;
  while (cursor < end) {
    if (end - cursor < 8) fail("MP4_BOX_HEADER_TRUNCATED", context);
    let size = bytes.readUInt32BE(cursor);
    const type = bytes.toString("ascii", cursor + 4, cursor + 8);
    let headerBytes = 8;
    if (!/^[\x20-\x7e]{4}$/u.test(type)) fail("MP4_BOX_TYPE_INVALID", context);
    if (size === 1) {
      if (end - cursor < 16) fail("MP4_LARGE_BOX_TRUNCATED", context);
      const large = bytes.readBigUInt64BE(cursor + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_BOX_TOO_LARGE", context);
      size = Number(large); headerBytes = 16;
    } else if (size === 0) size = end - cursor;
    if (size < headerBytes || cursor + size > end) fail("MP4_BOX_SIZE_INVALID", context);
    boxes.push({ type, start: cursor, end: cursor + size,
      payloadStart: cursor + headerBytes, payloadEnd: cursor + size, size });
    cursor += size;
  }
  if (cursor !== end) fail("MP4_BOX_COVERAGE_INVALID", context);
  return boxes;
}

function children(bytes, box, context) {
  return parseBoxes(bytes, box.payloadStart, box.payloadEnd, context);
}

function exactlyOne(boxes, type, context) {
  const matches = boxes.filter((box) => box.type === type);
  if (matches.length !== 1) fail("MP4_BOX_CARDINALITY", `${context}:${type}`);
  return matches[0];
}

function unsigned64(bytes, offset) {
  const value = bytes.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_INTEGER_TOO_LARGE");
  return Number(value);
}

function mediaHeader(bytes, box, context) {
  const version = bytes[box.payloadStart];
  if (version === 0 && box.payloadEnd - box.payloadStart >= 24) return {
    timescale: bytes.readUInt32BE(box.payloadStart + 12),
    durationTicks: bytes.readUInt32BE(box.payloadStart + 16) };
  if (version === 1 && box.payloadEnd - box.payloadStart >= 36) return {
    timescale: bytes.readUInt32BE(box.payloadStart + 20),
    durationTicks: unsigned64(bytes, box.payloadStart + 24) };
  fail("MP4_MDHD_INVALID", context);
}

function sampleTiming(bytes, box, context) {
  const count = bytes.readUInt32BE(box.payloadStart + 4);
  if (box.payloadEnd - box.payloadStart !== 8 + count * 8) fail("MP4_STTS_SIZE", context);
  let samples = 0; let durationTicks = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = box.payloadStart + 8 + index * 8;
    samples += bytes.readUInt32BE(offset);
    durationTicks += bytes.readUInt32BE(offset) * bytes.readUInt32BE(offset + 4);
  }
  return { entries: count, samples, durationTicks };
}

export function parseB1kRecoveryMp4(bytes, label = "mp4") {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32) fail("MP4_BYTES_INVALID", label);
  const top = parseBoxes(bytes, 0, bytes.length, label);
  const ftyp = exactlyOne(top, "ftyp", label);
  const moov = exactlyOne(top, "moov", label);
  const mdats = top.filter((box) => box.type === "mdat");
  if (mdats.length < 1) fail("MP4_MDAT_MISSING", label);
  const tracks = [];
  for (const trak of children(bytes, moov, `${label}:moov`).filter((box) => box.type === "trak")) {
    const tc = children(bytes, trak, `${label}:trak`);
    const tkhd = exactlyOne(tc, "tkhd", label);
    const mdia = exactlyOne(tc, "mdia", label);
    const mc = children(bytes, mdia, `${label}:mdia`);
    const hdlr = exactlyOne(mc, "hdlr", label);
    const handler = bytes.toString("ascii", hdlr.payloadStart + 8, hdlr.payloadStart + 12);
    const header = mediaHeader(bytes, exactlyOne(mc, "mdhd", label), label);
    const minf = exactlyOne(mc, "minf", label);
    const stbl = exactlyOne(children(bytes, minf, `${label}:minf`), "stbl", label);
    const sc = children(bytes, stbl, `${label}:stbl`);
    const stsz = exactlyOne(sc, "stsz", label);
    const samples = bytes.readUInt32BE(stsz.payloadStart + 8);
    const timing = sampleTiming(bytes, exactlyOne(sc, "stts", label), label);
    if (samples !== timing.samples || header.durationTicks !== timing.durationTicks) {
      fail("MP4_TIMING_INVALID", label);
    }
    const stsd = exactlyOne(sc, "stsd", label);
    const entryStart = stsd.payloadStart + 8;
    const codec = bytes.toString("ascii", entryStart + 4, entryStart + 8);
    const width = bytes.readUInt16BE(entryStart + 32);
    const height = bytes.readUInt16BE(entryStart + 34);
    const tkhdWidth = bytes.readUInt32BE(tkhd.payloadEnd - 8) / 65_536;
    const tkhdHeight = bytes.readUInt32BE(tkhd.payloadEnd - 4) / 65_536;
    if (handler !== "vide" || width !== tkhdWidth || height !== tkhdHeight) {
      fail("MP4_VIDEO_PROFILE_INVALID", label);
    }
    tracks.push({ handler, codec, width, height, timescale: header.timescale,
      durationTicks: header.durationTicks, durationSeconds: header.durationTicks / header.timescale,
      samples, timingEntries: timing.entries });
  }
  if (tracks.length !== 1) fail("MP4_TRACK_CARDINALITY", label);
  return { bytes: bytes.length,
    majorBrand: bytes.toString("ascii", ftyp.payloadStart, ftyp.payloadStart + 4),
    topLevelBoxes: top.map((box) => ({ type: box.type, bytes: box.size })), tracks,
    compressedPixelsDecoded: false, visualSemanticsReviewed: false };
}

function selectedDataPath(episode) {
  return `task5/Demo+Recovery+Success/data/chunk-${String(episode.chunk).padStart(3, "0")}/file-${String(episode.file).padStart(3, "0")}.parquet`;
}

function selectedVideoPath(episode, camera) {
  return `task5/Demo+Recovery+Success/videos/${camera}/chunk-${String(episode.chunk).padStart(3, "0")}/file-${String(episode.file).padStart(3, "0")}.mp4`;
}

function replayVideos(root) {
  const episodes = [];
  for (const episode of B1K_SELECTED_EPISODES) {
    const videos = CAMERAS.map((camera) => {
      const relative = selectedVideoPath(episode, camera);
      const bytes = readRegular(root, `files/${relative}`, MAX_PAYLOAD_BYTES);
      const parsed = parseB1kRecoveryMp4(bytes, relative);
      const track = parsed.tracks[0];
      if (track.codec !== "avc1" || track.width !== 224 || track.height !== 224
        || track.samples !== episode.frames || track.timescale !== 15_360
        || track.durationSeconds !== episode.frames / 30) fail("VIDEO_CROSSWALK", relative);
      return { camera, path: relative, bytes: bytes.length,
        container: { majorBrand: parsed.majorBrand,
          topLevelBoxes: parsed.topLevelBoxes.map((item) => item.type),
          codec: track.codec, width: track.width, height: track.height,
          samples: track.samples, timescale: track.timescale,
          durationTicks: track.durationTicks, durationSeconds: track.durationSeconds,
          timingEntries: track.timingEntries },
        compressedPixelsDecoded: false, visuallyReviewed: false };
    });
    episodes.push({ family: episode.family, episodeIndex: episode.episodeIndex,
      frames: episode.frames, videos });
  }
  return episodes;
}

function replayConversionManifest(root) {
  const bytes = readRegular(root,
    "files/task5/Demo+Recovery+Success/meta/conversion_manifest.jsonl");
  const text = strictUtf8(bytes, "CONVERSION_MANIFEST_UTF8");
  if (!text.endsWith("\n")) fail("CONVERSION_MANIFEST_NEWLINE");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== 5_795) fail("CONVERSION_MANIFEST_ROWS");
  const counts = {}; const frames = {}; const selected = new Map(); const sources = new Set();
  const rootHashRows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const row = parseJson(Buffer.from(lines[index], "utf8"), `manifest:${index}`);
    const match = /^\/[^\0]+\/episode_(\d{8})_(human2026|nav|success|place)\.parquet$/u
      .exec(row.source);
    if (!match || Number(match[1]) !== index || row.episode_index !== index
      || !Number.isSafeInteger(row.frames) || row.frames < 1 || row.kind !== "parquet"
      || row.source_base_qvel_frame !== "auto" || row.state_input_dim !== null
      || row.task_index !== 5 || sources.has(row.source)) fail("CONVERSION_MANIFEST_ROW", String(index));
    const family = match[2]; sources.add(row.source);
    counts[family] = (counts[family] ?? 0) + 1;
    frames[family] = (frames[family] ?? 0) + row.frames;
    if (B1K_SELECTED_EPISODES.some((item) => item.episodeIndex === index)) {
      selected.set(index, { family, frames: row.frames, sourceBasename: path.posix.basename(row.source) });
    }
    rootHashRows.push({ episodeIndex: index, frames: row.frames, family });
  }
  const expectedCounts = { human2026: 200, nav: 1170, success: 37, place: 4388 };
  const expectedFrames = { human2026: 2039222, nav: 562590, success: 327684,
    place: 607744 };
  if (!same(counts, expectedCounts) || !same(frames, expectedFrames)) {
    fail("CONVERSION_MANIFEST_CENSUS");
  }
  for (const episode of B1K_SELECTED_EPISODES) {
    const actual = selected.get(episode.episodeIndex);
    if (!same(actual, { family: episode.family, frames: episode.frames,
      sourceBasename: episode.sourceBasename })) fail("CONVERSION_SELECTED_CROSSWALK");
  }
  return { rows: lines.length, absoluteSourcePaths: lines.length,
    uniqueSourcePaths: sources.size, familyEpisodeCounts: counts,
    familyFrameCounts: frames, selectedRows: [...selected.values()].length,
    safeProjectionRoot: digest("outsider/b1k-conversion-manifest-safe/v1", rootHashRows),
    rawAbsoluteSourcePathsProjected: false };
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, sys
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])/'files'
def die(code): raise RuntimeError('B1K_RECOVERY_PYTHON_'+code)
def shaschema(pf): return hashlib.sha256(str(pf.schema_arrow).encode()).hexdigest()
def one(value):
    if not isinstance(value,list) or len(value)!=1: die('STAT_SCALAR')
    return value[0]
def family(source):
    if not isinstance(source,str) or not source.startswith('/') or '\\x00' in source:
        die('SOURCE_PATH')
    name=pathlib.PurePosixPath(source).name
    for item in ['human2026','nav','success','place']:
        if name.endswith('_'+item+'.parquet'): return item
    die('SOURCE_FAMILY')

meta=root/'task5/Demo+Recovery+Success/meta'
meta_columns=['episode_index','tasks','length','data/chunk_index','data/file_index',
 'dataset_from_index','dataset_to_index','_source_kind','_source','_source_task_index',
 'stats/next.reward/min','stats/next.reward/max','stats/next.reward/count',
 'stats/next.terminated/max','stats/next.truncated/max']
rows=[]; meta_rows=[]
for chunk in range(6):
    p=meta/f'episodes/chunk-{chunk:03d}/file-000.parquet'
    pf=pq.ParquetFile(p)
    expected_rows=1000 if chunk<5 else 795
    if (pf.metadata.num_rows!=expected_rows or pf.metadata.num_row_groups!=1
        or len(pf.schema_arrow.names)!=124
        or shaschema(pf)!='22ad3442399f44da7975b37db3b471b5512c9ac787e8f655c613193cd5c9aeee'):
        die('META_PARQUET_PROFILE')
    current=pf.read(columns=meta_columns).to_pylist()
    rows.extend(current); meta_rows.append(len(current))
if len(rows)!=5795: die('META_ROWS')

counts=collections.Counter(); frames=collections.Counter(); positive=collections.Counter()
negative=collections.Counter(); terminated=collections.Counter(); truncated=collections.Counter()
selected={}; from_cursor=0
for index,row in enumerate(rows):
    fam=family(row['_source'])
    if (row['episode_index']!=index or row['data/chunk_index']!=index//1000
        or row['data/file_index']!=index%1000 or row['dataset_from_index']!=from_cursor
        or row['dataset_to_index']!=from_cursor+row['length']
        or row['_source_kind']!='parquet' or row['_source_task_index']!=5
        or row['tasks']!=['setting_mousetraps']): die('META_CROSSWALK')
    counts[fam]+=1; frames[fam]+=row['length']; from_cursor=row['dataset_to_index']
    positive[fam]+=int(one(row['stats/next.reward/max'])>0)
    negative[fam]+=int(one(row['stats/next.reward/min'])<0)
    terminated[fam]+=int(one(row['stats/next.terminated/max'])>0)
    truncated[fam]+=int(one(row['stats/next.truncated/max'])>0)
    if index in [0,200,1370,1407]:
        selected[index]={'family':fam,'frames':row['length'],
          'sourceBasename':pathlib.PurePosixPath(row['_source']).name,
          'datasetFromIndex':row['dataset_from_index'],
          'datasetToIndex':row['dataset_to_index'],
          'rewardMin':one(row['stats/next.reward/min']),
          'rewardMax':one(row['stats/next.reward/max']),
          'terminatedPresent':one(row['stats/next.terminated/max'])>0,
          'truncatedPresent':one(row['stats/next.truncated/max'])>0}
if from_cursor!=3537240: die('META_FRAME_TOTAL')
expected_counts={'human2026':200,'nav':1170,'success':37,'place':4388}
expected_frames={'human2026':2039222,'nav':562590,'success':327684,'place':607744}
if dict(counts)!=expected_counts or dict(frames)!=expected_frames: die('META_FAMILY_CENSUS')

task_pf=pq.ParquetFile(meta/'tasks.parquet')
tasks=task_pf.read().to_pylist()
if (task_pf.metadata.num_rows!=1 or shaschema(task_pf)!='88f87710f9231471b57512d0b1c474b63fc69a15985cd16150ec920ef3899803'
    or tasks!=[{'task_index':0,'task':'setting_mousetraps'}]): die('TASK_TABLE')
info=json.loads((meta/'info.json').read_text(encoding='utf-8'))
features=info['features']
video_keys=sorted(name for name,value in features.items() if value.get('dtype')=='video')
if (info['codebase_version']!='v3.0' or info['robot_type']!='R1Pro' or info['fps']!=30
    or info['total_episodes']!=5795 or info['total_frames']!=3537240
    or info['total_tasks']!=1 or len(video_keys)!=3
    or features['action']['shape']!=[23] or features['observation.state']['shape']!=[61]
    or features['next.reward']['shape']!=[1]): die('INFO_PROFILE')

selected_specs=[('human2026',0,0,0,12850),('nav',200,0,200,701),
 ('success',1370,1,370,8676),('place',1407,1,407,180)]
data_results=[]
for fam,episode,chunk,file_index,expected_frames_count in selected_specs:
    p=root/f'task5/Demo+Recovery+Success/data/chunk-{chunk:03d}/file-{file_index:03d}.parquet'
    pf=pq.ParquetFile(p); table=pf.read(); data=table.to_pylist()
    if (pf.metadata.num_rows!=expected_frames_count or pf.metadata.num_row_groups!=1
        or shaschema(pf)!='642a377eec8fb7b293af0a7e8a32022686e2e280dc40104d5a2dd68421bc437f'
        or table.schema.names!=['action','next.reward','next.terminated','next.truncated',
          'observation.state','timestamp','frame_index','episode_index','index','task_index']):
        die('DATA_PARQUET_PROFILE')
    start=selected[episode]['datasetFromIndex']
    if any(len(row['action'])!=23 or len(row['observation.state'])!=61
           or any(not math.isfinite(float(x)) for x in row['action'])
           or any(not math.isfinite(float(x)) for x in row['observation.state'])
           or not math.isfinite(float(row['next.reward']))
           or not math.isfinite(float(row['timestamp']))
           or row['frame_index']!=idx or row['episode_index']!=episode
           or row['index']!=start+idx or row['task_index']!=0
           for idx,row in enumerate(data)): die('DATA_ROW_PROFILE')
    rewards=[float(row['next.reward']) for row in data]
    data_results.append({'family':fam,'episodeIndex':episode,'rows':len(data),
      'globalIndexFirst':data[0]['index'],'globalIndexLast':data[-1]['index'],
      'timestampFirst':float(data[0]['timestamp']),'timestampLast':float(data[-1]['timestamp']),
      'rewardMinimum':min(rewards),'rewardMaximum':max(rewards),
      'rewardPositiveRows':sum(x>0 for x in rewards),
      'rewardNegativeRows':sum(x<0 for x in rewards),
      'terminatedTrueRows':sum(bool(row['next.terminated']) for row in data),
      'truncatedTrueRows':sum(bool(row['next.truncated']) for row in data),
      'actionDimensions':23,'stateDimensions':61,'allFinite':True,
      'frameIndexContiguous':True,'globalIndexContiguous':True})

def task31(group):
    base=root/'task31'/group/'meta'
    ep_pf=pq.ParquetFile(base/'episodes/chunk-000/file-000.parquet')
    ep=ep_pf.read().to_pylist(); inf=json.loads((base/'info.json').read_text())
    t_pf=pq.ParquetFile(base/'tasks.parquet'); task=t_pf.read().to_pylist()
    if (shaschema(ep_pf)!='48fa52ad49048a7a653df1393e57786d32613acc781cd9ce68abd6848b379984'
        or shaschema(t_pf)!='00e5692a0a363c0597eb47d865f06597ef49c2665952859f7d5def12d8144f1b'
        or task!=[{'task_index':31,'task':'clean_boxing_gloves'}]
        or inf['total_episodes']!=len(ep) or inf['total_frames']!=sum(r['length'] for r in ep)
        or inf['total_tasks']!=1 or inf['fps']!=30 or inf['robot_type']!='R1Pro'):
        die('TASK31_PROFILE')
    kinds=collections.Counter(r['_src'] for r in ep)
    kind_frames=collections.Counter()
    for row in ep: kind_frames[row['_src']]+=row['length']
    return ep,{'group':group,'metadataOnly':True,'episodes':len(ep),
      'frames':sum(r['length'] for r in ep),'sourceFamilyEpisodes':dict(kinds),
      'sourceFamilyFrames':dict(kind_frames),'minimumEpisodeIndex':min(r['episode_index'] for r in ep),
      'maximumEpisodeIndex':max(r['episode_index'] for r in ep),
      'datasetFromFirst':ep[0]['dataset_from_index'],'datasetToLast':ep[-1]['dataset_to_index'],
      'singleLargePreservedIndexGap':sum(ep[i]['dataset_to_index']!=ep[i+1]['dataset_from_index'] for i in range(len(ep)-1))==1}

seg,seg_out=task31('b1k_task31_human+segmented_success')
suc,suc_out=task31('b1k_task31_human+success')
seg_h=[r for r in seg if r['_src']=='human_demo_2026']
suc_h=[r for r in suc if r['_src']=='human_demo_2026']
if len(seg_h)!=200 or seg_h!=suc_h: die('TASK31_SHARED_HUMAN')

print(json.dumps({'task5':{'metadataShardRows':meta_rows,'episodes':len(rows),
 'frames':from_cursor,'task':tasks[0],'familyEpisodeCounts':dict(counts),
 'familyFrameCounts':dict(frames),'positiveRewardEpisodeCounts':dict(positive),
 'negativeRewardEpisodeCounts':dict(negative),'terminatedEpisodeCounts':dict(terminated),
 'truncatedEpisodeCounts':dict(truncated),'selectedMetadata':selected,
 'info':{'codebaseVersion':info['codebase_version'],'robotType':info['robot_type'],
   'fps':info['fps'],'videoKeys':video_keys,'publishedVideoFiles':5795*len(video_keys),
   'totalVideosFieldPresent':False,'actionDimensions':23,
   'stateDimensions':61},'allEpisodeMetadataColumnsDecoded':True},
 'selectedData':data_results,
 'task31':{'segmented':seg_out,'successRollout':suc_out,
   'sharedHumanRows':200,'sharedHumanRowsByteSemanticIdentical':True,
   'groupDenominatorsAdditive':False},
 'execution':{'downloadedSourceCodeExecuted':False,'parquetBytesDecodedAsDataOnly':True}},
 sort_keys=True,separators=(',',':'),allow_nan=False))
`;

function findPython(options = {}) {
  const candidates = [options.pythonExecutable,
    process.env.OUTSIDER_B1K_RECOVERY_PYTHON,
    "/private/tmp/armbench-parquet-venv/bin/python",
    ".venv/bin/python", "/opt/anaconda3/bin/python"].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? "python3";
}

function replayParquets(root, options = {}) {
  const result = spawnSync(findPython(options), ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONWARNINGS: "ignore" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("PARQUET_REPLAY_FAILED", result.error?.message ?? result.stderr?.trim()
      ?? String(result.status));
  }
  const replay = parseJson(Buffer.from(result.stdout, "utf8"), "python-replay");
  if (replay.task5?.episodes !== 5_795 || replay.task5?.frames !== 3_537_240
    || replay.selectedData?.length !== 4 || replay.task31?.sharedHumanRows !== 200) {
    fail("PARQUET_REPLAY_OUTPUT_INVALID");
  }
  return replay;
}

function readmeClaims(root) {
  const text = strictUtf8(readRegular(root, "files/README.md"), "README_UTF8");
  return {
    task5OnlyTreeShown: /└── task5\//u.test(text) && !/task31\//u.test(text),
    futureSiblingTasksClaim: /Further tasks will be added as sibling folders/u.test(text),
    trainingReadyClaim: /Training-ready mixed dataset/u.test(text),
    officialHumanClaim: /Official 2026 human demonstrations/u.test(text),
    generatedRecoveryClaim: /Generated placement \/ recovery/u.test(text),
    validationAllParquetsClaim: /all 5,795 Parquets/u.test(text),
    validationAllVideosClaim: /all 17,385 videos decoded/u.test(text),
    modelCheckpointsTrainedOnDataClaim: /Models trained on this data/u.test(text),
    frontMatterLicenseClaim: /^license:/mu.test(text) ? "PRESENT" : null,
  };
}

export function buildB1kRecoveryArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected);
  const sourceManifest = deepFreeze({ ...body,
    manifestHash: digest(MANIFEST_DOMAIN, body) });
  const storedManifest = parseJson(readRegular(collected.root, "source-manifest.json"),
    "source-manifest");
  if (!same(storedManifest, sourceManifest)) fail("SOURCE_MANIFEST_MISMATCH");
  const parquet = replayParquets(collected.root, options);
  const conversion = replayConversionManifest(collected.root);
  const video = replayVideos(collected.root);
  const readme = readmeClaims(collected.root);
  const selectedSpecs = B1K_SELECTED_EPISODES.map((episode) => {
    const paths = [selectedDataPath(episode),
      ...CAMERAS.map((camera) => selectedVideoPath(episode, camera))];
    return { family: episode.family, publisherClass: episode.publisherClass,
      episodeIndex: episode.episodeIndex, frames: episode.frames,
      completeDataAndThreeVideoFiles: true,
      files: paths.map((relative) => {
        const specification = PAYLOADS.find((item) => item.path === relative);
        const header = collected.objectHeaders.find((item) => item.path === relative);
        return { path: relative, bytes: specification.bytes, oid: specification.oid,
          lfsOid: specification.lfs.oid, xetHash: specification.xetHash,
          localSha256: specification.sha256,
          headerBinding: { xRepoCommit: header.headers.xRepoCommit,
            xLinkedSize: header.headers.xLinkedSize,
            xLinkedEtag: header.headers.xLinkedEtag,
            xXetHash: header.headers.xXetHash } };
      }) };
  });
  const reportBody = {
    schema: B1K_RECOVERY_REPORT_SCHEMA,
    disposition: B1K_RECOVERY_DISPOSITION,
    scope: { kind: B1K_RECOVERY_SCOPE, task: "task5/setting_mousetraps",
      datasetId: B1K_RECOVERY_DATASET_ID, revision: B1K_RECOVERY_REVISION,
      boundedCapBytes: SELECTED_CAP_BYTES,
      completeTask5MetadataFiles: EXPECTED.completeTask5MetadataFiles,
      completeTask5MetadataBytes: EXPECTED.completeTask5MetadataBytes,
      selectedCompleteEpisodes: 4, selectedPayloadFiles: EXPECTED.selectedPayloadFiles,
      selectedPayloadBytes: EXPECTED.selectedPayloadBytes,
      selectedPayloadWithinCap: EXPECTED.selectedPayloadBytes <= SELECTED_CAP_BYTES,
      completeRepositoryPayloadAcquired: false,
      completeTask5PayloadAcquired: false,
      fullTask5InventoryAcquired: true,
      selector: "MINIMUM_EPISODE_INDEX_WITHIN_EACH_OF_FOUR_PUBLISHER_SOURCE_FAMILIES",
      withinFamilySelectorUsesRewardTerminationOrOutcome: false,
      publisherFamilyLabelsUsedToDefineStrata: true },
    source: { public: true, gated: false, disabled: false,
      recordBeforeAfterByteIdentical: true, task5TreeBeforeAfterSemanticIdentical: true,
      fullRecordSiblingFiles: EXPECTED.repositorySiblingFiles,
      task5SiblingFiles: 23_190, task31SiblingFiles: 6_240,
      recordUsedStorageBytes: 26_353_425_962,
      recordUsedStorageIsNotTask5FixedTreeBytes: true,
      task5InventoryPagesPerBracket: INVENTORY_PAGES,
      task5Entries: EXPECTED.task5Entries, task5Files: EXPECTED.task5Files,
      task5Directories: EXPECTED.task5Directories, task5Bytes: EXPECTED.task5Bytes,
      task5InventoryRoot: collected.inventory.rootHash,
      task5Categories: collected.inventoryProfile,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      acquiredRepositoryPayloadFiles: EXPECTED.acquiredRepositoryPayloadFiles,
      acquiredRepositoryPayloadBytes: EXPECTED.acquiredRepositoryPayloadBytes,
      allSelectedObjectHeadersOidLfsXetAndLocalBytesBound: true },
    task5MetadataReplay: { ...parquet.task5, conversionManifest: conversion,
      complete5795EpisodeMetadataCensus: true,
      sourceAbsolutePathsRemainPrivate: true },
    selection: { episodes: selectedSpecs,
      parquetReplay: parquet.selectedData,
      videoContainerReplay: video,
      eachEpisodeHasOneDataParquetAndThreeCameraVideos: true,
      everyVideoSampleCountEqualsParquetRows: true,
      compressedVideoPixelsDecoded: false,
      visualOutcomeAdjudicationPerformed: false },
    publisherSemantics: {
      readmeClaims: readme,
      officialHumanEpisodesPublisherClaim: 200,
      generatedNavigationEpisodesPublisherFamily: 1_170,
      generatedSuccessNamedEpisodesPublisherFamily: 37,
      generatedPlaceRecoveryNamedEpisodesPublisherFamily: 4_388,
      positiveRewardEpisodeCounts: parquet.task5.positiveRewardEpisodeCounts,
      negativeRewardEpisodeCounts: parquet.task5.negativeRewardEpisodeCounts,
      terminatedEpisodeCounts: parquet.task5.terminatedEpisodeCounts,
      truncatedEpisodeCounts: parquet.task5.truncatedEpisodeCounts,
      generatedSuccessAndPlaceRewardMaximumPositive: false,
      folderOrSourceFamilyNameIsOutcome: false,
      terminationIsSuccess: false,
      generatedRecoveryFamilyIsIndependentRecoveryEffect: false,
      publisherValidationIndependentlyReproducedForWholeTask5: false,
    },
    task31TerminalDisposition: {
      selectedIntoTask5Slice: false,
      reason: "SEPARATE_TASK_AND_NON_ADDITIVE_METADATA_POPULATIONS",
      ...parquet.task31,
      task31RawDataOrVideoBytesAcquired: 0,
      task31OutcomeOrRecoveryRowsAdmitted: 0,
    },
    documentationDrift: {
      readmeTreeShowsOnlyTask5: readme.task5OnlyTreeShown,
      fixedRootAlsoContainsTask31: true,
      readmeFileCount23192EqualsTask5FilesPlusTwoRootFiles: true,
      task5ApiFilesExcludingRootSupport: 23_190,
      task5FilesPlusRootSupport: 23_192,
      task31WasAddedWithoutReadmeTreeUpdate: true,
    },
    rightsPrivacyAndUse: {
      rights: { datasetCardLicenseClaim: null, readmeLicenseClaim: null,
        repositoryLicenseFilePresent: false, rightsStatus: "FAIL_CLOSED",
        publisherTrainingReadyClaimIsNotRightsGrant: true,
        redistributionAuthorizedByThisArtifact: false, authorizedTrainingRows: 0 },
      privacy: { rawSourcePrivate: true, rawVisualBytesPrivate: true,
        absolutePublisherSourcePathsPrivate: true, noPiiGuaranteed: false,
        rawAbsolutePathsOrVisualContentProjectedIntoReport: false },
      use: { autonomousActionAuthorized: false, networkAdmissionRows: 0,
        productionTrainingRows: 0, authorityDelta: 0, ceuRows: 0 },
    },
    zeroClaimBoundary: {
      independentlyVerifiedPhysicalEpisodes: 0, independentOutcomeRows: 0,
      realWorldOutcomeRows: 0, physicalEffectRows: 0, recoveryRows: 0,
      retryRows: 0, pairedFailureCorrectionRows: 0, longitudinalRows: 0,
      delegationRows: 0, authorizedTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, authorityDelta: 0,
      autonomousActionAuthorized: false,
    },
    executionBoundary: { sourceBytesExecuted: false,
      parquetDecodedAsInertData: true, mp4ContainersStructurallyParsed: true,
      compressedVideoDecoded: false, publisherConverterExecuted: false,
      publisherModelsOrCheckpointsExecuted: false },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return { report, sourceManifest };
}

export function createB1kRecoveryReceipt(report) {
  if (!report || report.schema !== B1K_RECOVERY_REPORT_SCHEMA
    || !HASH.test(report.artifactHash)) fail("REPORT_INVALID");
  const body = { schema: B1K_RECOVERY_RECEIPT_SCHEMA,
    datasetId: B1K_RECOVERY_DATASET_ID, revision: B1K_RECOVERY_REVISION,
    scope: B1K_RECOVERY_SCOPE, disposition: B1K_RECOVERY_DISPOSITION,
    artifactHash: report.artifactHash,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceRoot: report.source.sourceRoot,
    selectedCompleteEpisodes: 4, selectedPayloadBytes: EXPECTED.selectedPayloadBytes,
    task5MetadataEpisodes: 5_795, task5MetadataFrames: 3_537_240,
    independentOutcomeRows: 0, recoveryRows: 0, authorizedTrainingRows: 0,
    networkAdmissionRows: 0, authorityDelta: 0,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function serializeB1kRecoveryArtifact(value) {
  return serialize(value);
}

export function verifyB1kRecoverySourceDirectory(sourceDirectory) {
  try {
    const collected = collectSource(sourceDirectory, true);
    const body = manifestBody(collected);
    const expected = { ...body, manifestHash: digest(MANIFEST_DOMAIN, body) };
    const actual = parseJson(readRegular(collected.root, "source-manifest.json"),
      "source-manifest");
    if (!same(actual, expected)) fail("SOURCE_MANIFEST_MISMATCH");
    return { ok: true, sourceManifest: deepFreeze(expected),
      verificationLevel: "FULL_TASK5_INVENTORY_METADATA_AND_FOUR_EPISODE_SOURCE_REDERIVED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyB1kRecoveryArtifactDirectory(artifactDirectory, options = {}) {
  try {
    const root = path.resolve(artifactDirectory);
    const walked = walkPrivate(root);
    const expectedFiles = ["report.json", "run-receipt.json",
      ...expectedSourceFiles(true).map((item) => `source/${item}`)].sort();
    const expectedDirs = [".", "source",
      ...expectedDirectories(true).filter((item) => item !== ".")
        .map((item) => `source/${item}`)].sort();
    if (!same(walked.files.sort(), expectedFiles)
      || !same(walked.directories.sort(), expectedDirs)) fail("ARTIFACT_TOPOLOGY_INVALID");
    const built = buildB1kRecoveryArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const report = parseJson(readRegular(root, "report.json"), "report");
    const receipt = parseJson(readRegular(root, "run-receipt.json"), "receipt");
    const expectedReceipt = createB1kRecoveryReceipt(built.report);
    if (!same(report, built.report) || !same(receipt, expectedReceipt)) {
      fail("ARTIFACT_CONTENT_INVALID");
    }
    return { ok: true, report: built.report, receipt: expectedReceipt,
      verificationLevel: "FULL_TASK5_INVENTORY_METADATA_AND_FOUR_EPISODE_SOURCE_REDERIVED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function b1kRecoveryPayloadSpecifications() {
  return PAYLOADS;
}

export function b1kRecoverySourceEvidencePaths() {
  return sourceEvidenceFiles();
}
