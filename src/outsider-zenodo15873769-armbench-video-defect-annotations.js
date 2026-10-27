/*
 * Complete, byte-pinned annotation slice for Zenodo record 15873769.
 *
 * Both official ZIP files are retained and replayed in full.  ZIP central and
 * local headers, data descriptors, CRC-32 values, JSON annotations, Parquet
 * pages, and NPY arrays are checked from source bytes.  The archives contain
 * corrected/additional labels, temporal segments, and bounding boxes, but no
 * source videos or robot action state.  They therefore do not establish a
 * complete episode, an independently observed execution effect, or recovery.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { canonicalizeStrict } from "./canonical.js";

export const ZENODO_15873769_RECORD_ID = 15_873_769;
export const ZENODO_15873769_DOI = "10.5281/zenodo.15873769";
export const ZENODO_15873769_CONCEPT_DOI = "10.5281/zenodo.15873768";
export const ZENODO_15873769_LICENSE = "CC-BY-4.0";
export const ZENODO_15873769_REPORT_SCHEMA =
  "outsider/zenodo-15873769-armbench-video-defect-annotations/v1";
export const ZENODO_15873769_RECEIPT_SCHEMA =
  "outsider/zenodo-15873769-armbench-video-defect-annotations-receipt/v1";
export const ZENODO_15873769_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const SOURCE_SCHEMA =
  "outsider/zenodo-15873769-armbench-video-defect-source/v1";
const INVENTORY_SCHEMA =
  "outsider/zenodo-15873769-armbench-video-defect-zip-inventory/v1";
const MANIFEST_DOMAIN = "outsider/zenodo-15873769-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/zenodo-15873769-source-root/v1";
const REPORT_DOMAIN = "outsider/zenodo-15873769-report/v1";
const RECEIPT_DOMAIN = "outsider/zenodo-15873769-receipt/v1";
const RECORD_URL = `https://zenodo.org/api/records/${ZENODO_15873769_RECORD_ID}`;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_LINEAGE_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MD5 = /^md5:[a-f0-9]{32}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_DESCRIPTOR = 0x08074b50;
const ZIP_EOCD = 0x06054b50;

const OFFICIAL_FILES = Object.freeze([
  Object.freeze({
    key: "ARMBench.zip",
    archivePath: "raw/ARMBench.zip",
    id: "ac184082-4e7b-4e9a-8ba3-434012765082",
    bytes: 166_841_298,
    md5: "md5:f07266948be3443202c35405fdff5b1c",
    sha256: "sha256:d346ad8fbc925971f479f4a0237be4d7d6f0bcae1ae21ab5c6675014bd361fbc",
    expected: Object.freeze({
      entries: 1_109, files: 1_107, directories: 2,
      compressedBytes: 166_542_564, uncompressedBytes: 238_309_537,
      storedEntries: 2, deflatedEntries: 1_107,
      nameRoot: "sha256:ec436a1ff0854aa07a4c0fb501ceeec92207c70e2d157522ba8cfba9397a2583",
      entryRoot: "sha256:4f7f8f8c0668f4c96639d5b2fcb9e23aa33787ccd28d837dc822aa19b71438ef",
      localOffsetRoot: "sha256:21a45e831ae0f05467d7701e5e7847c4f698941312fed5f66d9428f3d09b4c00",
    }),
  }),
  Object.freeze({
    key: "FAILURE.zip",
    archivePath: "raw/FAILURE.zip",
    id: "eee1be7e-35cc-4fc4-8568-f91fabed44d8",
    bytes: 73_299,
    md5: "md5:fd87f7efbc15a6b1d263ca83dc3bc576",
    sha256: "sha256:faedcf91cac3da6b67d946165e99d32a07a3e7d5b0c0927e9353f10eec093e25",
    expected: Object.freeze({
      entries: 237, files: 230, directories: 7,
      compressedBytes: 17_751, uncompressedBytes: 46_783,
      storedEntries: 7, deflatedEntries: 230,
      nameRoot: "sha256:bd27ffe66c11432db98ef87d68a2ba21415e23e33814ecc2f21260c27a590caa",
      entryRoot: "sha256:b0c9f71e4322c2293af640d04b0eef07ae75c507c3c29ffa18b929e0a8604d54",
      localOffsetRoot: "sha256:32576e0eba9985651ba9207b0af14b8787c3a228f0c5773c3f6141275d3af5f0",
    }),
  }),
]);

const LINEAGE = Object.freeze([
  Object.freeze({ path: "lineage/code-repo-record.json", bytes: 6_092,
    sha256: "sha256:e215f95cea31b9a33b97124d1c62f9f5fedd07aca047ca0434a615920a49777f" }),
  Object.freeze({ path: "lineage/code-commit.json", bytes: 5_054,
    sha256: "sha256:58933061a41193b0f381fe250a27572b76ef167672cb9ebec2473aecde529d7d" }),
  Object.freeze({ path: "lineage/code-tree.json", bytes: 6_958,
    sha256: "sha256:376d33d92ffc97b7fe98cc2d10bcd29838400c9d81629a117bcfff529b2c5207" }),
  Object.freeze({ path: "lineage/code-readme.md", bytes: 4_012,
    sha256: "sha256:c6a433ce4140b548c2d8d2bcb031c7d850138e54c31500e8f396e3b711cc04cb" }),
  Object.freeze({ path: "lineage/code-armbench-dataset.py", bytes: 35_813,
    sha256: "sha256:00901e257462d8dbd20547edf405ea4d84b7ddc594b6d19688eec0f80c031277" }),
  Object.freeze({ path: "lineage/code-failure-dataset.py", bytes: 14_270,
    sha256: "sha256:91b87927464fbf9d95fada8cb686324cd05ec297e29485b5c2b638bc496324b4" }),
  Object.freeze({ path: "lineage/project-page.html", bytes: 4_973,
    sha256: "sha256:37a19c97f938cafee5d91fdd31cd6e5e92ee598b71aea665e2578c841d8366ad" }),
  Object.freeze({ path: "lineage/paper-arxiv-record.xml", bytes: 3_115,
    sha256: "sha256:fbed749947e49ca3b8f71a442a0f0afdd41cec8c45860d2f72c5dc5b7da41d9e" }),
  Object.freeze({ path: "lineage/paper-crossref-record.json", bytes: 7_145,
    sha256: "sha256:6231fa20b2f5a3753c6e78451100d18aa074ff65eed0adb75a24f1ea32e3446d" }),
]);

const PARQUET_EXPECTED = Object.freeze({
  "annotated_segments.parquet": Object.freeze({ bytes: 22_250, rows: 500,
    sha256: "sha256:a534b30d117a371c73c7c04691526fc4effa938c201c37ba04aa5b39a0b55049",
    columns: Object.freeze(["trial", "segments"]), valueColumn: "segments",
    valueCounts: Object.freeze({ 0: 16_796, 1: 18_874, 2: 30_869,
      3: 12_549, 4: 8_320 }), valueBytes: 87_408,
    trialRoot: "sha256:4634a36caca06076b9e379e250e6622eb6e091839c211e8ef0978183b7727242",
    valueRoot: "sha256:4bfb932784208313fe9769c9771046d76db38a87155ba1b7cd809a08c5586edc" }),
  "arm_boxes.parquet": Object.freeze({ bytes: 78_624_135, rows: 20_008,
    sha256: "sha256:0f88cf2df763017f56675a72460dc598e3adec14388e675368b35d66e8b7ff3b",
    columns: Object.freeze(["trial", "boxes", "shape"]), valueColumn: "boxes",
    valueBytes: 114_094_464,
    trialRoot: "sha256:42c7d8dcdadab4cdde98b3e0438c0735e6fa78b47d2dfb34a5b307d6d93c0cb5",
    valueRoot: "sha256:ccc0ffcc756f31c9c83e7fb618aa9db9cb68fd2fbd711759db41649d32f38de0",
    shapeRoot: "sha256:59eda5fb4f2b3afac70aa2a2efe11e8c6e4909af0d8c79712b31edc76f6959ba",
    shapeTail: Object.freeze([4]), shapeValues: 40_016 }),
  "crop_boxes.parquet": Object.freeze({ bytes: 51_452_940, rows: 20_008,
    sha256: "sha256:b02bfb38f241548ba79d64814435a8d044721da1e823d9b1d10f1e3079a89d85",
    columns: Object.freeze(["trial", "boxes", "shape"]), valueColumn: "boxes",
    valueBytes: 228_188_928,
    trialRoot: "sha256:42c7d8dcdadab4cdde98b3e0438c0735e6fa78b47d2dfb34a5b307d6d93c0cb5",
    valueRoot: "sha256:5f1feba342caf1e2a20fe9e6b8ca1be15fbbcb15caa42de8fa20e9805c60eef5",
    shapeRoot: "sha256:d186c6e88d7db2c898efe6f5d903796a60f14f5a83d8cfbc52007bde59acb83e",
    shapeTail: Object.freeze([2, 4]), shapeValues: 60_024 }),
  "defect_segments.parquet": Object.freeze({ bytes: 96_483, rows: 3_466,
    sha256: "sha256:6adf6a2d19867b59c1b16c29ad0fd6beaa608e93ba02cfec9a65b1eec642575c",
    columns: Object.freeze(["trial", "defect_segments"]),
    valueColumn: "defect_segments", valueBytes: 656_795,
    valueCounts: Object.freeze({ 0: 131_352, 1: 308_481, 2: 216_962 }),
    trialRoot: "sha256:b23e7ef665f3883d6c72a95b64447a3e5f04e4310dfefa5cb3e6a22197737e99",
    valueRoot: "sha256:a313341e369b6bffa81ef50dff67c3e4b77a3f3ac614f4831bc767e5afd0e7b1" }),
  "dest_boxes.parquet": Object.freeze({ bytes: 62_478_845, rows: 20_008,
    sha256: "sha256:6aa90b337ce7eba8147e1e9619d7683effd82a0918f276294dce51522f13ee2d",
    columns: Object.freeze(["trial", "boxes", "shape"]), valueColumn: "boxes",
    valueBytes: 114_094_464,
    trialRoot: "sha256:42c7d8dcdadab4cdde98b3e0438c0735e6fa78b47d2dfb34a5b307d6d93c0cb5",
    valueRoot: "sha256:a36f86cb971fa4c26784bae03ebe963ed5b85ab8d2929ef4e135217c5c93d735",
    shapeRoot: "sha256:59eda5fb4f2b3afac70aa2a2efe11e8c6e4909af0d8c79712b31edc76f6959ba",
    shapeTail: Object.freeze([4]), shapeValues: 40_016 }),
  "detected_segments.parquet": Object.freeze({ bytes: 679_134, rows: 20_008,
    sha256: "sha256:61cbfe2e26eeaa0e28fc9213be16a88cda6bf25a7bc2729bc0406d7bad4831b3",
    columns: Object.freeze(["trial", "segments"]), valueColumn: "segments",
    valueBytes: 3_565_452,
    valueCounts: Object.freeze({ 0: 642_144, 1: 772_399, 2: 1_321_058,
      3: 483_875, 4: 345_976 }),
    trialRoot: "sha256:42c7d8dcdadab4cdde98b3e0438c0735e6fa78b47d2dfb34a5b307d6d93c0cb5",
    valueRoot: "sha256:e23980dd2a9d2ca127bfae5950232ee98f04a767168b07f33ca407f0a01bfeb1" }),
  "src_boxes.parquet": Object.freeze({ bytes: 44_345_002, rows: 20_008,
    sha256: "sha256:abc052c804bf790b50c2315fdf7372fd4bbe0b76df2163c73fb235fe7d0bb2a4",
    columns: Object.freeze(["trial", "boxes", "shape"]), valueColumn: "boxes",
    valueBytes: 114_094_464,
    trialRoot: "sha256:42c7d8dcdadab4cdde98b3e0438c0735e6fa78b47d2dfb34a5b307d6d93c0cb5",
    valueRoot: "sha256:5ba6504bb659cd0b9a40ea95dd9059adcdce00966fe414b3f0b60dc7e7ec378f",
    shapeRoot: "sha256:59eda5fb4f2b3afac70aa2a2efe11e8c6e4909af0d8c79712b31edc76f6959ba",
    shapeTail: Object.freeze([4]), shapeValues: 40_016 }),
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `ZENODO_15873769_${code}`
    : `ZENODO_15873769_${code}:${detail}`);
}

export function zenodo15873769Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function md5(bytes) {
  return `md5:${createHash("md5").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return zenodo15873769Sha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)
    || ArrayBuffer.isView(value)) return value;
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

function checkedRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o600 || status.size < 1n
    || status.size > BigInt(maximumBytes)
    || exactBytes !== null && status.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  return target;
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedRegular(root, relative, maximumBytes, exactBytes);
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
  const target = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const hashMd5 = createHash("md5");
  const chunk = Buffer.allocUnsafe(256 * 1024);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    let total = 0;
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      const view = chunk.subarray(0, count);
      hash.update(view); hashMd5.update(view); total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || total !== exactBytes) fail("FILE_CHANGED_DURING_READ", relative);
    return { bytes: total, sha256: `sha256:${hash.digest("hex")}`,
      md5: `md5:${hashMd5.digest("hex")}` };
  } finally { closeSync(descriptor); }
}

function walk(root, prefix = "") {
  const directory = prefix === "" ? path.resolve(root) : checkedPath(root, prefix);
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", prefix);
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

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
}

function findEocd(bytes) {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_EOCD) return offset;
  }
  fail("ZIP_EOCD_MISSING");
}

function decodeZipName(bytes) {
  const text = strictUtf8(bytes, "ZIP_NAME_UTF8_INVALID");
  if (Buffer.from(text, "utf8").equals(bytes) === false
    || text.startsWith("/") || text.includes("\\") || text.includes("\0")
    || text.split("/").filter(Boolean).some((part) => [".", ".."].includes(part))) {
    fail("ZIP_NAME_INVALID", text);
  }
  return text;
}

function inspectZip(bytes, specification, retain = new Set(), onMember = null) {
  if (bytes.length !== specification.bytes
    || zenodo15873769Sha256(bytes) !== specification.sha256
    || md5(bytes) !== specification.md5) fail("ARCHIVE_DIGEST_INVALID", specification.key);
  const eocdOffset = findEocd(bytes);
  if (eocdOffset + 22 > bytes.length) fail("ZIP_EOCD_TRUNCATED", specification.key);
  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const diskEntries = bytes.readUInt16LE(eocdOffset + 8);
  const entriesCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralBytes = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  const commentBytes = bytes.readUInt16LE(eocdOffset + 20);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entriesCount
    || entriesCount !== specification.expected.entries || commentBytes !== 0
    || centralOffset + centralBytes !== eocdOffset
    || eocdOffset + 22 !== bytes.length) fail("ZIP_EOCD_INVALID", specification.key);
  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entriesCount; index += 1) {
    if (offset + 46 > eocdOffset || bytes.readUInt32LE(offset) !== ZIP_CENTRAL) {
      fail("ZIP_CENTRAL_INVALID", `${specification.key}/${index}`);
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const entryCommentBytes = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const internalAttributes = bytes.readUInt16LE(offset + 36);
    const externalAttributes = bytes.readUInt32LE(offset + 38);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const end = offset + 46 + nameBytes + extraBytes + entryCommentBytes;
    if (end > eocdOffset || diskStart !== 0 || ![0, 8].includes(flags)
      || ![0, 8].includes(method)) fail("ZIP_CENTRAL_ENTRY_INVALID", String(index));
    const nameRaw = bytes.subarray(offset + 46, offset + 46 + nameBytes);
    const name = decodeZipName(nameRaw);
    const directory = name.endsWith("/");
    if (directory && (compressedSize !== 0 || uncompressedSize !== 0 || method !== 0)
      || !directory && uncompressedSize === 0) fail("ZIP_ENTRY_PROFILE_INVALID", name);
    entries.push({ index, name, directory, flags, method, crc,
      compressedSize, uncompressedSize, localOffset, internalAttributes,
      externalAttributes, centralOffset: offset, centralBytes: end - offset });
    offset = end;
  }
  if (offset !== eocdOffset) fail("ZIP_CENTRAL_SIZE_INVALID", specification.key);
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) {
    fail("ZIP_ENTRY_DUPLICATE", specification.key);
  }
  const retained = new Map();
  const nameHash = createHash("sha256");
  const entryHash = createHash("sha256");
  const offsetHash = createHash("sha256");
  let compressedTotal = 0;
  let uncompressedTotal = 0;
  let files = 0;
  let directories = 0;
  let stored = 0;
  let deflated = 0;
  const orderedLocal = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 0; index < orderedLocal.length; index += 1) {
    const entry = orderedLocal[index];
    const local = entry.localOffset;
    if (local + 30 > centralOffset || bytes.readUInt32LE(local) !== ZIP_LOCAL) {
      fail("ZIP_LOCAL_HEADER_INVALID", entry.name);
    }
    const flags = bytes.readUInt16LE(local + 6);
    const method = bytes.readUInt16LE(local + 8);
    const localCrc = bytes.readUInt32LE(local + 14);
    const localCompressed = bytes.readUInt32LE(local + 18);
    const localUncompressed = bytes.readUInt32LE(local + 22);
    const localNameBytes = bytes.readUInt16LE(local + 26);
    const localExtraBytes = bytes.readUInt16LE(local + 28);
    const dataOffset = local + 30 + localNameBytes + localExtraBytes;
    const localName = decodeZipName(bytes.subarray(local + 30, local + 30 + localNameBytes));
    if (flags !== entry.flags || method !== entry.method || localName !== entry.name
      || flags === 0 && (localCrc !== entry.crc
        || localCompressed !== entry.compressedSize
        || localUncompressed !== entry.uncompressedSize)
      || flags === 8 && (![0, entry.crc].includes(localCrc)
        || ![0, entry.compressedSize].includes(localCompressed)
        || ![0, entry.uncompressedSize].includes(localUncompressed))) {
      fail("ZIP_LOCAL_CENTRAL_MISMATCH", entry.name);
    }
    const compressedEnd = dataOffset + entry.compressedSize;
    if (compressedEnd > centralOffset) fail("ZIP_MEMBER_RANGE_INVALID", entry.name);
    let memberEnd = compressedEnd;
    if (flags === 8) {
      if (bytes.readUInt32LE(memberEnd) !== ZIP_DESCRIPTOR
        || bytes.readUInt32LE(memberEnd + 4) !== entry.crc
        || bytes.readUInt32LE(memberEnd + 8) !== entry.compressedSize
        || bytes.readUInt32LE(memberEnd + 12) !== entry.uncompressedSize) {
        fail("ZIP_DATA_DESCRIPTOR_INVALID", entry.name);
      }
      memberEnd += 16;
    }
    const nextOffset = index + 1 < orderedLocal.length
      ? orderedLocal[index + 1].localOffset : centralOffset;
    if (memberEnd !== nextOffset) fail("ZIP_LOCAL_COVERAGE_INVALID", entry.name);
    const compressed = bytes.subarray(dataOffset, compressedEnd);
    let raw;
    try {
      raw = method === 0 ? Buffer.from(compressed)
        : method === 8 ? inflateRawSync(compressed) : fail("ZIP_METHOD_INVALID", entry.name);
    } catch { fail("ZIP_INFLATE_INVALID", entry.name); }
    if (raw.length !== entry.uncompressedSize || crc32(raw) !== entry.crc) {
      fail("ZIP_MEMBER_CRC_INVALID", entry.name);
    }
    if (retain.has(entry.name)) retained.set(entry.name, raw);
    if (onMember !== null) onMember(entry, raw);
    nameHash.update(`${entry.name}\n`, "utf8");
    entryHash.update(entry.name, "utf8"); entryHash.update(Buffer.from([0]));
    const crcBytes = Buffer.alloc(4); crcBytes.writeUInt32BE(entry.crc);
    const sizeBytes = Buffer.alloc(16); sizeBytes.writeBigUInt64BE(BigInt(entry.compressedSize));
    sizeBytes.writeBigUInt64BE(BigInt(entry.uncompressedSize), 8);
    entryHash.update(crcBytes); entryHash.update(sizeBytes);
    offsetHash.update(entry.name, "utf8"); offsetHash.update(Buffer.from([0]));
    const localBytes = Buffer.alloc(8); localBytes.writeBigUInt64BE(BigInt(entry.localOffset));
    offsetHash.update(localBytes);
    compressedTotal += entry.compressedSize; uncompressedTotal += entry.uncompressedSize;
    if (entry.directory) directories += 1; else files += 1;
    if (entry.method === 0) stored += 1; else deflated += 1;
  }
  const projection = {
    archive: specification.key, archiveBytes: bytes.length,
    archiveMd5: md5(bytes), archiveSha256: zenodo15873769Sha256(bytes),
    entries: entries.length, files, directories,
    compressedBytes: compressedTotal, uncompressedBytes: uncompressedTotal,
    storedEntries: stored, deflatedEntries: deflated,
    centralOffset, centralBytes, eocdOffset, commentBytes,
    nameRoot: `sha256:${nameHash.digest("hex")}`,
    entryRoot: `sha256:${entryHash.digest("hex")}`,
    localOffsetRoot: `sha256:${offsetHash.digest("hex")}`,
    allCentralLocalHeadersMatched: true, allDataDescriptorsMatched: true,
    allMembersInflatedAndCrcVerified: true,
    entriesDetail: entries.map((entry) => ({ name: entry.name,
      directory: entry.directory, method: entry.method, flags: entry.flags,
      crc32: entry.crc.toString(16).padStart(8, "0"),
      compressedBytes: entry.compressedSize,
      uncompressedBytes: entry.uncompressedSize,
      localOffset: entry.localOffset })),
  };
  const expected = specification.expected;
  for (const key of ["entries", "files", "directories", "compressedBytes",
    "uncompressedBytes", "storedEntries", "deflatedEntries", "nameRoot",
    "entryRoot", "localOffsetRoot"]) {
    if (projection[key] !== expected[key]) fail("ZIP_CENSUS_INVALID", `${specification.key}/${key}`);
  }
  return { projection, retained };
}

class CompactReader {
  constructor(bytes, offset = 0) { this.bytes = bytes; this.offset = offset; }
  u8() {
    if (this.offset >= this.bytes.length) fail("THRIFT_TRUNCATED");
    return this.bytes[this.offset++];
  }
  varint() {
    let result = 0n;
    let shift = 0n;
    for (let count = 0; count < 10; count += 1) {
      const byte = this.u8();
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        if (result <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(result);
        return result;
      }
      shift += 7n;
    }
    fail("THRIFT_VARINT_INVALID");
  }
  zigzag() {
    const value = this.varint();
    if (typeof value === "bigint") return value >> 1n ^ -(value & 1n);
    return value >>> 1 ^ -(value & 1);
  }
  value(type) {
    if (type === 1) return true;
    if (type === 2) return false;
    if (type === 3) return this.u8();
    if ([4, 5, 6].includes(type)) return this.zigzag();
    if (type === 7) {
      if (this.offset + 8 > this.bytes.length) fail("THRIFT_DOUBLE_TRUNCATED");
      const value = this.bytes.readDoubleLE(this.offset); this.offset += 8; return value;
    }
    if (type === 8) {
      const length = this.varint();
      if (!Number.isSafeInteger(length) || length < 0
        || this.offset + length > this.bytes.length) fail("THRIFT_BINARY_INVALID");
      const value = this.bytes.subarray(this.offset, this.offset + length);
      this.offset += length; return value;
    }
    if ([9, 10].includes(type)) {
      const header = this.u8();
      let length = header >>> 4;
      const elementType = header & 15;
      if (length === 15) length = this.varint();
      if (!Number.isSafeInteger(length) || length < 0 || length > 10_000_000) {
        fail("THRIFT_LIST_INVALID");
      }
      return Array.from({ length }, () => this.value(elementType));
    }
    if (type === 11) {
      const length = this.varint();
      if (!Number.isSafeInteger(length) || length < 0 || length > 1_000_000) {
        fail("THRIFT_MAP_INVALID");
      }
      if (length === 0) return [];
      const types = this.u8();
      return Array.from({ length }, () =>
        [this.value(types >>> 4), this.value(types & 15)]);
    }
    if (type === 12) return this.struct();
    fail("THRIFT_TYPE_INVALID", String(type));
  }
  struct() {
    const result = {};
    let field = 0;
    for (;;) {
      const header = this.u8();
      if (header === 0) return result;
      const delta = header >>> 4;
      const type = header & 15;
      field = delta === 0 ? Number(this.zigzag()) : field + delta;
      if (!Number.isSafeInteger(field) || field <= 0 || result[field] !== undefined) {
        fail("THRIFT_FIELD_INVALID", String(field));
      }
      result[field] = this.value(type);
    }
  }
}

function snappyRaw(bytes, expectedBytes) {
  const reader = { offset: 0 };
  const readVarint = () => {
    let result = 0;
    let shift = 0;
    for (let count = 0; count < 5; count += 1) {
      if (reader.offset >= bytes.length) fail("SNAPPY_TRUNCATED");
      const byte = bytes[reader.offset++]; result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    fail("SNAPPY_LENGTH_INVALID");
  };
  const declared = readVarint();
  if (declared !== expectedBytes) fail("SNAPPY_DECLARED_SIZE_INVALID");
  const output = Buffer.allocUnsafe(declared);
  let written = 0;
  while (reader.offset < bytes.length) {
    const tag = bytes[reader.offset++];
    const kind = tag & 3;
    if (kind === 0) {
      let length = tag >>> 2;
      if (length < 60) length += 1;
      else {
        const count = length - 59;
        if (count < 1 || count > 4 || reader.offset + count > bytes.length) {
          fail("SNAPPY_LITERAL_LENGTH_INVALID");
        }
        length = 1;
        let encoded = 0;
        for (let index = 0; index < count; index += 1) {
          encoded |= bytes[reader.offset++] << index * 8;
        }
        length += encoded >>> 0;
      }
      if (reader.offset + length > bytes.length || written + length > output.length) {
        fail("SNAPPY_LITERAL_RANGE_INVALID");
      }
      bytes.copy(output, written, reader.offset, reader.offset + length);
      reader.offset += length; written += length;
    } else {
      let length;
      let back;
      if (kind === 1) {
        if (reader.offset >= bytes.length) fail("SNAPPY_COPY_TRUNCATED");
        length = 4 + (tag >>> 2 & 7);
        back = (tag & 0xe0) << 3 | bytes[reader.offset++];
      } else if (kind === 2) {
        if (reader.offset + 2 > bytes.length) fail("SNAPPY_COPY_TRUNCATED");
        length = 1 + (tag >>> 2);
        back = bytes.readUInt16LE(reader.offset); reader.offset += 2;
      } else {
        if (reader.offset + 4 > bytes.length) fail("SNAPPY_COPY_TRUNCATED");
        length = 1 + (tag >>> 2);
        back = bytes.readUInt32LE(reader.offset); reader.offset += 4;
      }
      if (back <= 0 || back > written || written + length > output.length) {
        fail("SNAPPY_COPY_RANGE_INVALID");
      }
      for (let index = 0; index < length; index += 1) {
        output[written + index] = output[written - back + index];
      }
      written += length;
    }
  }
  if (written !== output.length) fail("SNAPPY_OUTPUT_SIZE_INVALID");
  return output;
}

function readUnsignedVarint(bytes, state) {
  let result = 0;
  let shift = 0;
  for (let count = 0; count < 10; count += 1) {
    if (state.offset >= bytes.length) fail("RLE_VARINT_TRUNCATED");
    const byte = bytes[state.offset++];
    if (shift < 28) result += (byte & 0x7f) * 2 ** shift;
    else result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
  fail("RLE_VARINT_INVALID");
}

function decodeHybrid(bytes, bitWidth, count, lengthPrefixed) {
  const state = { offset: 0 };
  let limit = bytes.length;
  if (lengthPrefixed) {
    if (bytes.length < 4) fail("RLE_LENGTH_TRUNCATED");
    const encodedBytes = bytes.readUInt32LE(0);
    state.offset = 4; limit = 4 + encodedBytes;
    if (limit > bytes.length) fail("RLE_LENGTH_INVALID");
  }
  const values = [];
  while (values.length < count && state.offset < limit) {
    const header = readUnsignedVarint(bytes.subarray(0, limit), state);
    if ((header & 1) === 0) {
      const run = Math.floor(header / 2);
      const byteWidth = Math.ceil(bitWidth / 8);
      if (run <= 0 || state.offset + byteWidth > limit) fail("RLE_RUN_INVALID");
      let value = 0;
      for (let index = 0; index < byteWidth; index += 1) {
        value += bytes[state.offset++] * 2 ** (index * 8);
      }
      for (let index = 0; index < run && values.length < count; index += 1) {
        values.push(value);
      }
    } else {
      const groups = Math.floor(header / 2);
      const run = groups * 8;
      const packedBytes = Math.ceil(run * bitWidth / 8);
      if (groups <= 0 || state.offset + packedBytes > limit) fail("BITPACK_RUN_INVALID");
      let bitOffset = 0;
      for (let index = 0; index < run && values.length < count; index += 1) {
        let value = 0;
        for (let bit = 0; bit < bitWidth; bit += 1) {
          const absolute = bitOffset + bit;
          const present = bytes[state.offset + Math.floor(absolute / 8)]
            >>> (absolute % 8) & 1;
          value |= present << bit;
        }
        values.push(value); bitOffset += bitWidth;
      }
      state.offset += packedBytes;
    }
  }
  if (values.length !== count) fail("RLE_VALUE_COUNT_INVALID");
  return { values, bytes: lengthPrefixed ? limit : state.offset };
}

function plainValues(bytes, physicalType, count) {
  const values = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    if (physicalType === 6) {
      if (offset + 4 > bytes.length) fail("PARQUET_BYTE_ARRAY_TRUNCATED");
      const length = bytes.readUInt32LE(offset); offset += 4;
      if (offset + length > bytes.length) fail("PARQUET_BYTE_ARRAY_RANGE_INVALID");
      values.push(bytes.subarray(offset, offset + length)); offset += length;
    } else if (physicalType === 2) {
      if (offset + 8 > bytes.length) fail("PARQUET_INT64_TRUNCATED");
      const value = bytes.readBigInt64LE(offset); offset += 8;
      if (value < BigInt(Number.MIN_SAFE_INTEGER)
        || value > BigInt(Number.MAX_SAFE_INTEGER)) fail("PARQUET_INT64_UNSAFE");
      values.push(Number(value));
    } else fail("PARQUET_PHYSICAL_TYPE_UNSUPPORTED", String(physicalType));
  }
  return { values, bytes: offset };
}

function parquetSchemaNames(schema) {
  if (!Array.isArray(schema) || !exactObject(schema[0])
    || strictUtf8(schema[0][4], "PARQUET_SCHEMA_NAME_INVALID") !== "schema") {
    fail("PARQUET_SCHEMA_INVALID");
  }
  return schema.slice(1).map((item) => strictUtf8(item[4],
    "PARQUET_SCHEMA_NAME_INVALID"));
}

function parseParquetMetadata(bytes, expected) {
  if (bytes.length !== expected.bytes || zenodo15873769Sha256(bytes) !== expected.sha256
    || !bytes.subarray(0, 4).equals(Buffer.from("PAR1", "ascii"))
    || !bytes.subarray(-4).equals(Buffer.from("PAR1", "ascii"))) {
    fail("PARQUET_FILE_INVALID");
  }
  const footerBytes = bytes.readUInt32LE(bytes.length - 8);
  const footerOffset = bytes.length - 8 - footerBytes;
  if (footerOffset < 4) fail("PARQUET_FOOTER_RANGE_INVALID");
  const reader = new CompactReader(bytes, footerOffset);
  const metadata = reader.struct();
  if (reader.offset !== bytes.length - 8 || metadata[1] !== 2
    || metadata[3] !== expected.rows || !Array.isArray(metadata[2])
    || !Array.isArray(metadata[4]) || metadata[4].length !== 1
    || strictUtf8(metadata[6], "PARQUET_CREATED_BY_INVALID")
      !== "parquet-cpp-arrow version 16.0.0") fail("PARQUET_METADATA_INVALID");
  const schemaNames = parquetSchemaNames(metadata[2]);
  const expectedSchemaNames = expected.columns.includes("shape")
    ? ["trial", "boxes", "shape", "list", "element"] : expected.columns;
  if (!same(schemaNames, expectedSchemaNames)) fail("PARQUET_SCHEMA_PROFILE_INVALID");
  const rowGroup = metadata[4][0];
  if (rowGroup[3] !== expected.rows || !Array.isArray(rowGroup[1])
    || rowGroup[1].length !== expected.columns.length) {
    fail("PARQUET_ROW_GROUP_INVALID");
  }
  const columns = rowGroup[1].map((chunk) => {
    const value = chunk[3];
    if (!exactObject(value) || !Array.isArray(value[3]) || value[4] !== 1
      || ![6, 2].includes(value[1]) || !Array.isArray(value[2])
      || !value[2].every((encoding) => [0, 3, 8].includes(encoding))) {
      fail("PARQUET_COLUMN_METADATA_INVALID");
    }
    return { physicalType: value[1], encodings: value[2],
      path: value[3].map((part) => strictUtf8(part, "PARQUET_PATH_INVALID")),
      codec: value[4], numValues: value[5], uncompressedBytes: value[6],
      compressedBytes: value[7], dataOffset: value[9],
      dictionaryOffset: value[11] ?? null };
  });
  if (!same(columns.map((column) => column.path[0]), expected.columns)) {
    fail("PARQUET_COLUMN_ORDER_INVALID");
  }
  return { footerOffset, footerBytes, metadata, columns };
}

function decodeColumnPages(bytes, column, options) {
  const start = column.dictionaryOffset ?? column.dataOffset;
  const end = start + column.compressedBytes;
  if (start < 4 || end > bytes.length - 8) fail("PARQUET_COLUMN_RANGE_INVALID");
  let offset = start;
  let dictionary = null;
  const values = [];
  const repetitions = [];
  let pageCount = 0;
  while (offset < end) {
    const reader = new CompactReader(bytes, offset);
    const header = reader.struct();
    const headerBytes = reader.offset - offset;
    if (![0, 2].includes(header[1]) || !Number.isSafeInteger(header[2])
      || !Number.isSafeInteger(header[3]) || header[2] < 0 || header[3] < 0
      || reader.offset + header[3] > end) fail("PARQUET_PAGE_HEADER_INVALID");
    const compressed = bytes.subarray(reader.offset, reader.offset + header[3]);
    const page = snappyRaw(compressed, header[2]);
    if (header[1] === 2) {
      const dictionaryHeader = header[7];
      if (!exactObject(dictionaryHeader) || dictionaryHeader[2] !== 0
        || dictionary !== null) fail("PARQUET_DICTIONARY_HEADER_INVALID");
      const decoded = plainValues(page, column.physicalType, dictionaryHeader[1]);
      if (decoded.bytes !== page.length) fail("PARQUET_DICTIONARY_TRAILING_BYTES");
      dictionary = decoded.values;
    } else {
      const data = header[5];
      if (!exactObject(data) || ![0, 8].includes(data[2])
        || data[3] !== 3 || data[4] !== 3) fail("PARQUET_DATA_HEADER_INVALID");
      const count = data[1];
      let cursor = 0;
      let reps = Array(count).fill(0);
      if (options.maxRepetition > 0) {
        const decoded = decodeHybrid(page.subarray(cursor), 1, count, true);
        reps = decoded.values; cursor += decoded.bytes;
      }
      let definitions = Array(count).fill(options.maxDefinition);
      if (options.maxDefinition > 0) {
        const width = Math.ceil(Math.log2(options.maxDefinition + 1));
        const decoded = decodeHybrid(page.subarray(cursor), width, count, true);
        definitions = decoded.values; cursor += decoded.bytes;
      }
      if (definitions.some((value) => value !== options.maxDefinition)) {
        fail("PARQUET_NULL_UNSUPPORTED");
      }
      let decoded;
      if (data[2] === 8) {
        if (dictionary === null || cursor >= page.length) {
          fail("PARQUET_DICTIONARY_DATA_INVALID");
        }
        const bitWidth = page[cursor++];
        const indices = decodeHybrid(page.subarray(cursor), bitWidth, count, false);
        cursor += indices.bytes;
        if (indices.values.some((index) => index < 0 || index >= dictionary.length)) {
          fail("PARQUET_DICTIONARY_INDEX_INVALID");
        }
        decoded = indices.values.map((index) => dictionary[index]);
      } else {
        const plain = plainValues(page.subarray(cursor), column.physicalType, count);
        cursor += plain.bytes; decoded = plain.values;
      }
      if (cursor !== page.length) fail("PARQUET_DATA_TRAILING_BYTES");
      values.push(...decoded); repetitions.push(...reps);
    }
    offset = reader.offset + header[3]; pageCount += 1;
  }
  if (offset !== end || values.length !== column.numValues
    || repetitions.length !== column.numValues) fail("PARQUET_COLUMN_COUNT_INVALID");
  return { values, repetitions, pageCount };
}

function rootLines(lines) {
  return zenodo15873769Sha256(Buffer.from(`${lines.join("\n")}\n`, "utf8"));
}

function replayParquet(bytes, fileName, expected) {
  const parsed = parseParquetMetadata(bytes, expected);
  const trialColumn = decodeColumnPages(bytes, parsed.columns[0],
    { maxRepetition: 0, maxDefinition: 1 });
  const trials = trialColumn.values.map((value) => strictUtf8(value,
    "PARQUET_TRIAL_UTF8_INVALID"));
  if (trials.length !== expected.rows || new Set(trials).size !== trials.length
    || trials.some((trial) => !/^\d{21}$/u.test(trial))
    || rootLines(trials) !== expected.trialRoot) fail("PARQUET_TRIAL_CENSUS_INVALID", fileName);
  const valueColumn = decodeColumnPages(bytes, parsed.columns[1],
    { maxRepetition: 0, maxDefinition: 1 });
  if (valueColumn.values.length !== expected.rows
    || valueColumn.values.some((value) => !Buffer.isBuffer(value))) {
    fail("PARQUET_VALUE_COUNT_INVALID", fileName);
  }
  const valueHash = createHash("sha256");
  let valueBytes = 0;
  let minBytes = Infinity;
  let maxBytes = -Infinity;
  const byteValueCounts = {};
  const lengths = [];
  for (let index = 0; index < expected.rows; index += 1) {
    const value = valueColumn.values[index];
    const lengthBytes = Buffer.alloc(8); lengthBytes.writeBigUInt64BE(BigInt(value.length));
    valueHash.update(trials[index], "utf8"); valueHash.update(Buffer.from([0]));
    valueHash.update(lengthBytes); valueHash.update(value);
    valueBytes += value.length; minBytes = Math.min(minBytes, value.length);
    maxBytes = Math.max(maxBytes, value.length); lengths.push(value.length);
    if (expected.valueCounts !== undefined) {
      for (const byte of value) byteValueCounts[byte] = (byteValueCounts[byte] ?? 0) + 1;
    }
  }
  if (valueBytes !== expected.valueBytes
    || `sha256:${valueHash.digest("hex")}` !== expected.valueRoot
    || expected.valueCounts !== undefined && !same(byteValueCounts, expected.valueCounts)) {
    fail("PARQUET_VALUE_CENSUS_INVALID", fileName);
  }
  let shapes = null;
  let shapeSummary = null;
  if (expected.columns.includes("shape")) {
    const decoded = decodeColumnPages(bytes, parsed.columns[2],
      { maxRepetition: 1, maxDefinition: 3 });
    if (decoded.values.length !== expected.shapeValues
      || decoded.repetitions[0] !== 0) fail("PARQUET_SHAPE_COUNT_INVALID", fileName);
    shapes = [];
    let current = [];
    for (let index = 0; index < decoded.values.length; index += 1) {
      if (decoded.repetitions[index] === 0) {
        if (current.length > 0) shapes.push(current);
        current = [];
      } else if (decoded.repetitions[index] !== 1) fail("PARQUET_REPETITION_INVALID");
      current.push(decoded.values[index]);
    }
    if (current.length > 0) shapes.push(current);
    const shapeLines = shapes.map((shape) => canonicalizeStrict(shape));
    const totalFrames = shapes.reduce((sum, shape) => sum + shape[0], 0);
    if (shapes.length !== expected.rows || rootLines(shapeLines) !== expected.shapeRoot
      || shapes.some((shape, index) => !same(shape.slice(1), expected.shapeTail)
        || valueColumn.values[index].length !== 8 * shape.reduce((a, b) => a * b, 1))) {
      fail("PARQUET_SHAPE_PROFILE_INVALID", fileName);
    }
    shapeSummary = { rows: shapes.length, totalFrames,
      minimumFrames: Math.min(...shapes.map((shape) => shape[0])),
      maximumFrames: Math.max(...shapes.map((shape) => shape[0])),
      uniqueShapes: new Set(shapeLines).size, tail: expected.shapeTail,
      shapeRoot: expected.shapeRoot, float64ByteShapeConsistencyRows: shapes.length };
  }
  return {
    file: fileName, bytes: bytes.length, sha256: zenodo15873769Sha256(bytes),
    rows: expected.rows, uniqueTrials: trials.length,
    trialMinimum: sorted(trials)[0], trialMaximum: sorted(trials).at(-1),
    trialOrderRoot: expected.trialRoot, columns: expected.columns,
    rowGroups: 1, createdBy: "parquet-cpp-arrow version 16.0.0",
    footerBytes: parsed.footerBytes, footerOffset: parsed.footerOffset,
    columnPageCounts: [trialColumn.pageCount, valueColumn.pageCount,
      ...(expected.columns.includes("shape") ? [2] : [])],
    valueColumn: expected.valueColumn, valueBytes, minValueBytes: minBytes,
    maxValueBytes: maxBytes, valueRoot: expected.valueRoot,
    ...(expected.valueCounts === undefined ? {} : { byteValueCounts }),
    ...(shapeSummary === null ? {} : { shape: shapeSummary }),
    trials, lengths,
  };
}

function exactKeys(value, keys) {
  return exactObject(value) && same(sorted(Object.keys(value)), sorted(keys));
}

function addCount(counts, key, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function numericCounts(counts) {
  return Object.fromEntries(sorted(Object.keys(counts).map(Number))
    .map((key) => [key, counts[key]]));
}

function parseRelabeledAnnotation(entryName, bytes) {
  const text = strictUtf8(bytes, "RELABEL_JSON_UTF8_INVALID");
  const allBareNaN = text.match(/\bNaN\b/gu)?.length ?? 0;
  let replacements = 0;
  const normalized = text.replace(/("frame_idx"\s*:\s*)NaN(\s*[,}])/gu,
    (match, prefix, suffix) => { replacements += 1; return `${prefix}null${suffix}`; });
  if (replacements !== allBareNaN) fail("RELABEL_NAN_CONTEXT_INVALID", entryName);
  let value;
  try { value = JSON.parse(normalized); }
  catch { fail("RELABEL_JSON_INVALID", entryName); }
  const fileId = entryName.split("/").at(-1).slice(0, -5);
  if (!exactKeys(value, ["id", "label", "sublabel", "annotations"])
    || value.id !== fileId || !/^\d{21}$/u.test(value.id)
    || !["nominal", "deconstruction", "open"].includes(value.label)
    || !(Array.isArray(value.sublabel) && value.sublabel.length === 0
      || ["bag", "book", "box", "other"].includes(value.sublabel))
    || !Array.isArray(value.annotations)
    || ![0, 2].includes(value.annotations.length)) {
    fail("RELABEL_PROFILE_INVALID", entryName);
  }
  let nullFrameIndices = 0;
  let finiteFrameIndices = 0;
  for (const annotation of value.annotations) {
    if (!exactKeys(annotation, ["frame_idx", "label"])
      || !["Deconstruction ", "No Damage", "Open ", "nan"].includes(annotation.label)) {
      fail("RELABEL_ELEMENT_INVALID", entryName);
    }
    if (annotation.frame_idx === null) nullFrameIndices += 1;
    else if (Number.isFinite(annotation.frame_idx)
      && Number.isSafeInteger(annotation.frame_idx) && annotation.frame_idx >= 0) {
      finiteFrameIndices += 1;
    } else fail("RELABEL_FRAME_INDEX_INVALID", entryName);
  }
  if (nullFrameIndices !== replacements) fail("RELABEL_NAN_COUNT_INVALID", entryName);
  return { value, bareNaNTokens: replacements, nullFrameIndices,
    finiteFrameIndices, fileId };
}

function replaySplit(bytes, name, expectedRows, expectedRoot) {
  const value = parseJson(bytes, `SPLIT_${name.toUpperCase()}_INVALID`);
  if (!Array.isArray(value) || value.length !== expectedRows
    || new Set(value).size !== value.length
    || value.some((trial) => typeof trial !== "string" || !/^\d{21}$/u.test(trial))
    || rootLines(value) !== expectedRoot) fail("SPLIT_PROFILE_INVALID", name);
  return { name, rows: value.length, uniqueTrials: value.length,
    minimum: sorted(value)[0], maximum: sorted(value).at(-1),
    trialOrderRoot: expectedRoot, trials: value };
}

function replayArmbenchMembers(armBytes, specification) {
  const parquet = {};
  const relabeled = [];
  let train = null;
  let test = null;
  const names = { parquet: 0, relabeled: 0, split: 0, directories: 0, other: 0 };
  const inspected = inspectZip(armBytes, specification, new Set(), (entry, raw) => {
    if (entry.directory) { names.directories += 1; return; }
    if (entry.name.startsWith("ARMBench/relabeled_annotations/")
      && entry.name.endsWith(".json")) {
      relabeled.push(parseRelabeledAnnotation(entry.name, raw));
      names.relabeled += 1; return;
    }
    const base = entry.name.slice("ARMBench/".length);
    if (PARQUET_EXPECTED[base] !== undefined) {
      parquet[base] = replayParquet(raw, base, PARQUET_EXPECTED[base]);
      names.parquet += 1; return;
    }
    if (base === "train.json") {
      train = replaySplit(raw, "train", 8_757,
        "sha256:4a4724432fb08440f8909c31571bcfdb94ccdd4df8656ac143a5079f0fbe10f1");
      names.split += 1; return;
    }
    if (base === "test.json") {
      test = replaySplit(raw, "test", 11_251,
        "sha256:c046809ccd8e68df46321920803818558d62a994c8df99cd1e1853f42e735f43");
      names.split += 1; return;
    }
    names.other += 1;
  });
  if (!same(names, { parquet: 7, relabeled: 1_098, split: 2,
    directories: 2, other: 0 }) || train === null || test === null
    || !same(sorted(Object.keys(parquet)), sorted(Object.keys(PARQUET_EXPECTED)))) {
    fail("ARMBENCH_MEMBER_CENSUS_INVALID");
  }
  const labelCounts = {};
  const sublabelCounts = {};
  const annotationLabelCounts = {};
  const labelByAnnotationCount = {};
  let annotationElements = 0;
  let filesWithAnnotations = 0;
  let bareNaNTokens = 0;
  let filesWithBareNaN = 0;
  let finiteFrameIndices = 0;
  const relabeledIds = [];
  const labelSets = new Map(["nominal", "deconstruction", "open"].map((key) =>
    [key, new Set()]));
  const semanticHash = createHash("sha256");
  for (const row of relabeled.sort((left, right) =>
    left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0)) {
    const value = row.value;
    relabeledIds.push(value.id); labelSets.get(value.label).add(value.id);
    addCount(labelCounts, value.label);
    addCount(sublabelCounts, Array.isArray(value.sublabel) ? "[]" : value.sublabel);
    addCount(labelByAnnotationCount, `${value.label}/${value.annotations.length}`);
    annotationElements += value.annotations.length;
    if (value.annotations.length > 0) filesWithAnnotations += 1;
    bareNaNTokens += row.bareNaNTokens;
    if (row.bareNaNTokens > 0) filesWithBareNaN += 1;
    finiteFrameIndices += row.finiteFrameIndices;
    for (const annotation of value.annotations) addCount(annotationLabelCounts,
      annotation.label);
    semanticHash.update(value.id, "utf8"); semanticHash.update(Buffer.from([0]));
    semanticHash.update(canonicalizeStrict({ label: value.label,
      sublabel: value.sublabel,
      annotations: value.annotations.map((annotation) => ({
        frameIndex: annotation.frame_idx === null ? "BARE_NAN" : annotation.frame_idx,
        label: annotation.label,
      })) }), "utf8"); semanticHash.update(Buffer.from("\n", "utf8"));
  }
  const expectedLabels = { deconstruction: 137, nominal: 823, open: 138 };
  const expectedSublabels = { "[]": 116, bag: 28, book: 541, box: 367, other: 46 };
  const expectedAnnotationLabels = { "Deconstruction ": 55, "No Damage": 6,
    "Open ": 132, nan: 125 };
  const expectedByAnnotation = { "deconstruction/0": 26, "deconstruction/2": 111,
    "nominal/0": 823, "open/0": 90, "open/2": 48 };
  if (relabeledIds.length !== 1_098 || new Set(relabeledIds).size !== 1_098
    || !same(labelCounts, expectedLabels) || !same(sublabelCounts, expectedSublabels)
    || !same(annotationLabelCounts, expectedAnnotationLabels)
    || !same(labelByAnnotationCount, expectedByAnnotation)
    || annotationElements !== 318 || filesWithAnnotations !== 159
    || bareNaNTokens !== 113 || filesWithBareNaN !== 113
    || finiteFrameIndices !== 205) {
    fail("RELABEL_CENSUS_INVALID");
  }
  const trainSet = new Set(train.trials);
  const testSet = new Set(test.trials);
  const splitUnion = new Set([...trainSet, ...testSet]);
  const master = parquet["detected_segments.parquet"];
  const masterSet = new Set(master.trials);
  if ([...trainSet].some((id) => testSet.has(id)) || splitUnion.size !== 20_008
    || masterSet.size !== 20_008
    || [...splitUnion].some((id) => !masterSet.has(id))
    || relabeledIds.some((id) => !splitUnion.has(id))) fail("ARMBENCH_ID_UNIVERSE_INVALID");
  const masterFrameByTrial = new Map(master.trials.map((trial, index) =>
    [trial, master.lengths[index]]));
  for (const file of ["arm_boxes.parquet", "crop_boxes.parquet",
    "dest_boxes.parquet", "src_boxes.parquet"]) {
    const value = parquet[file];
    if (!same(value.trials, master.trials)) fail("BOX_TRIAL_ORDER_INVALID", file);
    const tailProduct = PARQUET_EXPECTED[file].shapeTail.reduce((a, b) => a * b, 1);
    for (let index = 0; index < value.rows; index += 1) {
      const frames = value.lengths[index] / (8 * tailProduct);
      if (!Number.isSafeInteger(frames)
        || frames !== masterFrameByTrial.get(value.trials[index])) {
        fail("BOX_FRAME_ALIGNMENT_INVALID", `${file}/${index}`);
      }
    }
  }
  for (const file of ["annotated_segments.parquet", "defect_segments.parquet"]) {
    const value = parquet[file];
    for (let index = 0; index < value.rows; index += 1) {
      if (value.lengths[index] !== masterFrameByTrial.get(value.trials[index])) {
        fail("SEGMENT_FRAME_ALIGNMENT_INVALID", `${file}/${index}`);
      }
    }
  }
  const annotatedSet = new Set(parquet["annotated_segments.parquet"].trials);
  const defectSet = new Set(parquet["defect_segments.parquet"].trials);
  const overlap = (left, right) => [...left].filter((id) => right.has(id)).length;
  const relabeledSet = new Set(relabeledIds);
  const crosswalk = {
    splitUnionTrials: splitUnion.size,
    trainTestOverlap: 0,
    detectedAndAllBoxTrialSetsIdentical: true,
    manuallyAnnotatedTrials: annotatedSet.size,
    defectSegmentTrials: defectSet.size,
    annotatedDefectIntersection: overlap(annotatedSet, defectSet),
    annotatedOnly: annotatedSet.size - overlap(annotatedSet, defectSet),
    defectOnly: defectSet.size - overlap(annotatedSet, defectSet),
    relabeledTrials: relabeledSet.size,
    relabeledTrainOverlap: overlap(relabeledSet, trainSet),
    relabeledTestOverlap: overlap(relabeledSet, testSet),
    relabeledAnnotatedOverlap: overlap(relabeledSet, annotatedSet),
    relabeledDefectOverlap: overlap(relabeledSet, defectSet),
    correctedNominalRowsInDefectSegments:
      overlap(labelSets.get("nominal"), defectSet),
    correctedDeconstructionRowsInDefectSegments:
      overlap(labelSets.get("deconstruction"), defectSet),
    correctedOpenRowsInDefectSegments: overlap(labelSets.get("open"), defectSet),
  };
  if (!same(crosswalk, {
    splitUnionTrials: 20_008, trainTestOverlap: 0,
    detectedAndAllBoxTrialSetsIdentical: true,
    manuallyAnnotatedTrials: 500, defectSegmentTrials: 3_466,
    annotatedDefectIntersection: 257, annotatedOnly: 243, defectOnly: 3_209,
    relabeledTrials: 1_098, relabeledTrainOverlap: 662,
    relabeledTestOverlap: 436, relabeledAnnotatedOverlap: 63,
    relabeledDefectOverlap: 278, correctedNominalRowsInDefectSegments: 3,
    correctedDeconstructionRowsInDefectSegments: 137,
    correctedOpenRowsInDefectSegments: 138,
  })) fail("ARMBENCH_CROSSWALK_INVALID");
  const publicParquet = Object.fromEntries(sorted(Object.keys(parquet)).map((key) => {
    const { trials: ignoredTrials, lengths: ignoredLengths, ...summary } = parquet[key];
    return [key, summary];
  }));
  const semanticRoot = `sha256:${semanticHash.digest("hex")}`;
  if (semanticRoot
    !== "sha256:939b1dd5c8640a5691a3d0dcfe8536119f2778633a713394fe49fbce8664ef24") {
    fail("RELABEL_SEMANTIC_ROOT_INVALID");
  }
  const { trials: ignoredTrainTrials, ...publicTrain } = train;
  const { trials: ignoredTestTrials, ...publicTest } = test;
  return {
    zip: inspected.projection,
    parquet: publicParquet,
    private: { parquet, trainTrials: train.trials, testTrials: test.trials,
      relabeledIds },
    split: { train: publicTrain, test: publicTest, disjoint: true,
      unionTrials: splitUnion.size },
    relabeled: {
      files: relabeledIds.length, uniqueIds: relabeledIds.length,
      labelCounts, sublabelCounts, annotationElements, filesWithAnnotations,
      annotationLabelCounts, labelByAnnotationCount,
      bareNaNFrameIndexTokens: bareNaNTokens,
      finiteNonnegativeIntegerFrameIndices: finiteFrameIndices,
      strictJsonFiles: relabeledIds.length - filesWithBareNaN,
      filesWithBareNaN,
      filenameInternalIdMatches: relabeledIds.length,
      semanticRoot,
    },
    crosswalk,
  };
}

function parseNpy(bytes, entryName) {
  if (bytes.length < 11 || !bytes.subarray(0, 6)
    .equals(Buffer.from([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]))) {
    fail("NPY_MAGIC_INVALID", entryName);
  }
  const major = bytes[6];
  const minor = bytes[7];
  let headerBytes;
  let headerOffset;
  if (major === 1 && minor === 0) {
    headerBytes = bytes.readUInt16LE(8); headerOffset = 10;
  } else fail("NPY_VERSION_INVALID", entryName);
  if (headerOffset + headerBytes > bytes.length || headerBytes < 1) {
    fail("NPY_HEADER_RANGE_INVALID", entryName);
  }
  const header = strictUtf8(bytes.subarray(headerOffset, headerOffset + headerBytes),
    "NPY_HEADER_UTF8_INVALID");
  const match = /^\{'descr': '\|u1', 'fortran_order': False, 'shape': \((\d+),\), \} *\n$/u
    .exec(header);
  if (match === null) fail("NPY_HEADER_PROFILE_INVALID", entryName);
  const length = Number(match[1]);
  const dataOffset = headerOffset + headerBytes;
  if (!Number.isSafeInteger(length) || length < 1 || dataOffset + length !== bytes.length) {
    fail("NPY_PAYLOAD_SIZE_INVALID", entryName);
  }
  const payload = bytes.subarray(dataOffset);
  if ([...payload].some((value) => ![0, 1, 2].includes(value))) {
    fail("NPY_VALUE_INVALID", entryName);
  }
  const counts = {};
  for (const value of payload) addCount(counts, value);
  return { dtype: "uint8", shape: [length], length, counts: numericCounts(counts),
    payload, headerBytes, dataOffset };
}

function replayFailureMembers(failureBytes, specification) {
  const tasks = new Map(["place", "pour", "push", "put_in", "put_on"].map((key) =>
    [key, { files: 0, ids: [], totalElements: 0, minimumLength: Infinity,
      maximumLength: -Infinity, valueCounts: {} }]));
  let readme = null;
  let npyFiles = 0;
  let directories = 0;
  let other = 0;
  const rowFragments = [];
  const inspected = inspectZip(failureBytes, specification, new Set(), (entry, raw) => {
    if (entry.directory) { directories += 1; return; }
    if (entry.name === "FAILURE/README.txt") {
      readme = strictUtf8(raw, "FAILURE_README_UTF8_INVALID"); return;
    }
    const match = /^FAILURE\/action_segmentation\/(place|pour|push|put_in|put_on)\/(\d+)\.npy$/u
      .exec(entry.name);
    if (match === null) { other += 1; return; }
    const parsed = parseNpy(raw, entry.name);
    const task = tasks.get(match[1]);
    const id = Number(match[2]);
    if (!Number.isSafeInteger(id) || id < 1) fail("FAILURE_ID_INVALID", entry.name);
    task.files += 1; task.ids.push(id); task.totalElements += parsed.length;
    task.minimumLength = Math.min(task.minimumLength, parsed.length);
    task.maximumLength = Math.max(task.maximumLength, parsed.length);
    for (const [key, count] of Object.entries(parsed.counts)) {
      addCount(task.valueCounts, key, count);
    }
    rowFragments.push({ name: entry.name, shape: parsed.shape,
      payload: Buffer.from(parsed.payload) }); npyFiles += 1;
  });
  if (directories !== 7 || npyFiles !== 229 || other !== 0
    || readme !== "Copy the action_segmentation folder into the 'failnet_dataset' folder.\n") {
    fail("FAILURE_MEMBER_CENSUS_INVALID");
  }
  const expected = {
    place: { files: 45, idMin: 3, idMax: 50, missing: [6, 28, 47],
      total: 4_496, min: 35, max: 138, counts: { 0: 1_193, 1: 2_335, 2: 968 } },
    pour: { files: 67, idMin: 1, idMax: 67, missing: [],
      total: 4_448, min: 49, max: 100, counts: { 0: 1_554, 1: 2_396, 2: 498 } },
    push: { files: 31, idMin: 4, idMax: 36, missing: [17, 18],
      total: 1_987, min: 34, max: 78, counts: { 0: 790, 1: 451, 2: 746 } },
    put_in: { files: 56, idMin: 1, idMax: 57, missing: [28],
      total: 3_553, min: 39, max: 108, counts: { 0: 969, 1: 2_013, 2: 571 } },
    put_on: { files: 30, idMin: 1, idMax: 30, missing: [],
      total: 2_916, min: 66, max: 113, counts: { 0: 924, 1: 1_386, 2: 606 } },
  };
  const publicTasks = {};
  const globalCounts = {};
  let totalElements = 0;
  for (const [name, task] of tasks) {
    const ids = sorted(task.ids);
    const missing = [];
    for (let id = ids[0]; id <= ids.at(-1); id += 1) {
      if (!task.ids.includes(id)) missing.push(id);
    }
    const actual = { files: task.files, idMin: ids[0], idMax: ids.at(-1),
      missing, total: task.totalElements, min: task.minimumLength,
      max: task.maximumLength, counts: numericCounts(task.valueCounts) };
    if (new Set(ids).size !== ids.length || !same(actual, expected[name])) {
      fail("FAILURE_TASK_CENSUS_INVALID", name);
    }
    publicTasks[name] = { files: actual.files, uniqueIds: ids.length,
      minimumId: actual.idMin, maximumId: actual.idMax,
      missingIdsWithinRange: missing, temporalLabels: actual.total,
      minimumFrames: actual.min, maximumFrames: actual.max,
      valueCounts: actual.counts };
    totalElements += actual.total;
    for (const [key, count] of Object.entries(actual.counts)) addCount(globalCounts, key, count);
  }
  const rowHash = createHash("sha256");
  for (const row of rowFragments.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    rowHash.update(row.name, "utf8"); rowHash.update(Buffer.from([0]));
    rowHash.update("uint8", "utf8"); rowHash.update(Buffer.from([0]));
    rowHash.update(canonicalizeStrict(row.shape), "utf8"); rowHash.update(Buffer.from([0]));
    rowHash.update(row.payload);
  }
  const rowRoot = `sha256:${rowHash.digest("hex")}`;
  if (totalElements !== 17_400
    || !same(numericCounts(globalCounts), { 0: 5_430, 1: 8_581, 2: 3_389 })
    || rowRoot
      !== "sha256:4739f7fae9ec6ad93f475483f8a03e0c815c37b714624ce23f5124a8d0383b70") {
    fail("FAILURE_GLOBAL_CENSUS_INVALID", rowRoot);
  }
  return { zip: inspected.projection, tasks: publicTasks,
    npyFiles, dtype: "uint8", dimensions: 1, totalTemporalLabels: totalElements,
    valueCounts: numericCounts(globalCounts), allNpyAllowPickleRequired: false,
    allNpyPayloadsInertlyParsed: true,
    rowRoot,
    readme: { bytes: Buffer.byteLength(readme),
      copyInstructionPresent: true, sourceVideosIncluded: false } };
}

function recordProjection(bytes) {
  if (bytes.length !== 4_667 || zenodo15873769Sha256(bytes)
    !== "sha256:eece1e70b757dff57301df9fe98f41b47e77c1ee0d8a71502f28353ae170611b") {
    fail("RECORD_BYTES_INVALID");
  }
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  if (value.id !== ZENODO_15873769_RECORD_ID || value.doi !== ZENODO_15873769_DOI
    || value.conceptdoi !== ZENODO_15873769_CONCEPT_DOI || value.revision !== 10
    || value.status !== "published" || value.submitted !== true
    || value.metadata?.access_right !== "open"
    || value.metadata?.license?.id !== "cc-by-4.0"
    || value.metadata?.title
      !== "ARMBench Video Defect Dataset - corrected and additional annotations"
    || value.updated !== "2025-10-07T18:08:12.204099+00:00"
    || !Array.isArray(value.files) || value.files.length !== 2
    || !Array.isArray(value.metadata?.related_identifiers)
    || value.metadata.related_identifiers.length !== 1
    || value.metadata.related_identifiers[0].identifier
      !== "10.1109/ECMR65884.2025.11162998") fail("RECORD_PROFILE_INVALID");
  const files = value.files.map((file) => ({ id: file.id, key: file.key,
    bytes: file.size, md5: file.checksum, contentUrl: file.links?.self }))
    .sort((left, right) => left.key < right.key ? -1 : 1);
  const expected = OFFICIAL_FILES.map((file) => ({ id: file.id, key: file.key,
    bytes: file.bytes, md5: file.md5,
    contentUrl: `${RECORD_URL}/files/${file.key}/content` }))
    .sort((left, right) => left.key < right.key ? -1 : 1);
  if (!same(files, expected)) fail("RECORD_FILE_PROFILE_INVALID");
  const description = value.metadata.description;
  if (typeof description !== "string"
    || !description.includes("updated labels for the ARMBench Video Detect dataset")
    || !description.includes("object bounding boxes")
    || !description.includes("temporal segmentation of robot actions")
    || !description.includes("FAILURE.zip file contains temporal segmentation annotations")) {
    fail("RECORD_DESCRIPTION_PROFILE_INVALID");
  }
  return { id: value.id, doi: value.doi, conceptDoi: value.conceptdoi,
    revision: value.revision, created: value.created, updated: value.updated,
    status: value.status, accessRight: value.metadata.access_right,
    license: value.metadata.license.id, title: value.metadata.title,
    creatorCount: value.metadata.creators.length,
    relatedPaperDoi: value.metadata.related_identifiers[0].identifier,
    files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    descriptionClaims: { correctedLabels: true, objectBoundingBoxes: true,
      actionTemporalSegmentation: true, failureTemporalSegmentation: true } };
}

function replayLineage(root) {
  const entries = [];
  for (const specification of LINEAGE) {
    const measured = hashRegular(root, specification.path, MAX_LINEAGE_BYTES,
      specification.bytes);
    if (measured.sha256 !== specification.sha256) fail("LINEAGE_DIGEST_INVALID",
      specification.path);
    entries.push({ path: specification.path, bytes: specification.bytes,
      sha256: specification.sha256 });
  }
  const repo = parseJson(readRegular(root, "lineage/code-repo-record.json",
    MAX_LINEAGE_BYTES, 6_092), "CODE_REPO_JSON_INVALID");
  const commit = parseJson(readRegular(root, "lineage/code-commit.json",
    MAX_LINEAGE_BYTES, 5_054), "CODE_COMMIT_JSON_INVALID");
  const tree = parseJson(readRegular(root, "lineage/code-tree.json",
    MAX_LINEAGE_BYTES, 6_958), "CODE_TREE_JSON_INVALID");
  const readme = strictUtf8(readRegular(root, "lineage/code-readme.md",
    MAX_LINEAGE_BYTES, 4_012), "CODE_README_UTF8_INVALID");
  const armCode = strictUtf8(readRegular(root, "lineage/code-armbench-dataset.py",
    MAX_LINEAGE_BYTES, 35_813), "ARM_CODE_UTF8_INVALID");
  const failureCode = strictUtf8(readRegular(root, "lineage/code-failure-dataset.py",
    MAX_LINEAGE_BYTES, 14_270), "FAILURE_CODE_UTF8_INVALID");
  const project = strictUtf8(readRegular(root, "lineage/project-page.html",
    MAX_LINEAGE_BYTES, 4_973), "PROJECT_PAGE_UTF8_INVALID");
  const arxiv = strictUtf8(readRegular(root, "lineage/paper-arxiv-record.xml",
    MAX_LINEAGE_BYTES, 3_115), "ARXIV_RECORD_UTF8_INVALID");
  const crossref = parseJson(readRegular(root, "lineage/paper-crossref-record.json",
    MAX_LINEAGE_BYTES, 7_145), "CROSSREF_RECORD_JSON_INVALID");
  const codeSha = "8e92c98b677ffdeb48822440dfac856e6b4ec20c";
  const treeSha = "d7d4da0ec875cc3dfe7819e7509ddded219270b5";
  if (repo.full_name !== "sthoduka/using_task_knowledge"
    || repo.visibility !== "public" || repo.private !== false
    || repo.default_branch !== "master" || repo.license !== null
    || repo.homepage !== "https://sthoduka.github.io/using_task_knowledge/"
    || commit.sha !== codeSha || commit.commit?.tree?.sha !== treeSha
    || tree.sha !== treeSha || tree.truncated !== false
    || !Array.isArray(tree.tree) || tree.tree.length !== 23
    || !readme.includes("https://zenodo.org/records/15873769")
    || !readme.includes("https://arxiv.org/abs/2508.18705")
    || !project.includes("Enhancing Video-Based Robot Failure Detection Using Task Knowledge")
    || !armCode.includes("label_encoder = {\"nominal\": 0, \"deconstruction\": 1, \"open\": 2}")
    || !armCode.includes("action_classes = {\"ApproachGrasp\": 0, \"MoveDestination\": 1, \"Wait\": 2, \"ApproachPlace\": 3, \"MoveSource\": 4}")
    || !armCode.includes("# robot actions (manually annotated)")
    || !armCode.includes("# robot actions (extracted using trained action segmentation model)")
    || !failureCode.includes("sub_action_classes = {\"approach\": 0, \"act\": 1, \"retract\": 2}")
    || !arxiv.includes("http://arxiv.org/abs/2508.18705v2")
    || !arxiv.includes("10.1109/ECMR65884.2025.11162998")
    || crossref.message?.DOI !== "10.1109/ecmr65884.2025.11162998"
    || crossref.message?.title?.[0]
      !== "Enhancing Video-Based Robot Failure Detection Using Task Knowledge") {
    fail("LINEAGE_PROFILE_INVALID");
  }
  return { entries, codeRepository: "sthoduka/using_task_knowledge",
    codeCommit: codeSha, codeTree: treeSha, codeTreeEntries: tree.tree.length,
    codeRepositoryLicenseClaim: null, codeBytesExecuted: false,
    paperDoi: "10.1109/ECMR65884.2025.11162998", arxivId: "2508.18705v2",
    mappingsFromInertCode: {
      armbenchOutcomeLabels: { nominal: 0, deconstruction: 1, open: 2 },
      armbenchActionLabels: { ApproachGrasp: 0, MoveDestination: 1,
        Wait: 2, ApproachPlace: 3, MoveSource: 4 },
      failureSubActionLabels: { approach: 0, act: 1, retract: 2 },
      detectedSegmentsPublisherModelDerived: true,
      annotatedSegmentsPublisherManual: true,
    },
    projectPagePinned: true, baseArmbenchPagePinned: false,
    baseArmbenchPageExclusionReason:
      "TLS_CERTIFICATE_EXPIRED_AT_ACQUISITION;NO_VERIFICATION_BYPASS",
  };
}

export function inspectZenodo15873769AnnotationArchives(armbenchBytes,
  failureBytes) {
  const armbench = replayArmbenchMembers(armbenchBytes, OFFICIAL_FILES[0]);
  const failure = replayFailureMembers(failureBytes, OFFICIAL_FILES[1]);
  return deepFreeze({ armbench, failure });
}

function stripZipDetail(zip) {
  const { entriesDetail: ignoredEntries, ...summary } = zip;
  return summary;
}

function inventoryFromReplay(record, armbench, failure) {
  const body = {
    schema: INVENTORY_SCHEMA,
    record: { id: record.id, doi: record.doi, revision: record.revision,
      exactBytes: 4_667,
      sha256: "sha256:eece1e70b757dff57301df9fe98f41b47e77c1ee0d8a71502f28353ae170611b" },
    archives: [
      { ...stripZipDetail(armbench.zip), entriesDetail: armbench.zip.entriesDetail },
      { ...stripZipDetail(failure.zip), entriesDetail: failure.zip.entriesDetail },
    ],
    armbenchAnnotations: {
      parquet: armbench.parquet, splits: armbench.split,
      relabeled: armbench.relabeled, crosswalk: armbench.crosswalk,
    },
    failureAnnotations: failure,
    executionBoundary: {
      sourceVideosPresent: false, robotActionStatePresent: false,
      robotControlCommandsPresent: false, sensorStatePresent: false,
      completeEpisodesPresent: false, independentOutcomePresent: false,
      recoveryPresent: false,
    },
  };
  return deepFreeze({ ...body, inventoryHash: digest(INVENTORY_SCHEMA, body) });
}

const CORE_PATHS = Object.freeze([
  "metadata/record-before.json", "metadata/record-after.json",
  ...OFFICIAL_FILES.map((file) => file.archivePath),
  ...LINEAGE.map((file) => file.path),
]);

const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:f3bae8f7bfaff7bd6e6548cb5a53e1033688701b3602c4a0ed56ebeca309a0f4";

function sourceEntry(root, relative, maximumBytes, exactBytes, expectedSha256,
  expectedMd5 = null) {
  const measured = hashRegular(root, relative, maximumBytes, exactBytes);
  if (measured.sha256 !== expectedSha256
    || expectedMd5 !== null && measured.md5 !== expectedMd5) {
    fail("SOURCE_ENTRY_DIGEST_INVALID", relative);
  }
  return { path: relative, bytes: measured.bytes, sha256: measured.sha256 };
}

function collectCoreSource(sourceDirectory, expectedExtraPaths = []) {
  const root = path.resolve(sourceDirectory);
  const expectedLayout = sorted([...CORE_PATHS, ...expectedExtraPaths]);
  if (!same(walk(root), expectedLayout)) fail("SOURCE_LAYOUT_INVALID");
  const beforeBytes = readRegular(root, "metadata/record-before.json",
    MAX_METADATA_BYTES, 4_667);
  const afterBytes = readRegular(root, "metadata/record-after.json",
    MAX_METADATA_BYTES, 4_667);
  if (!beforeBytes.equals(afterBytes)) fail("RECORD_BRACKET_CHANGED");
  const record = recordProjection(beforeBytes);
  const entries = [
    sourceEntry(root, "metadata/record-before.json", MAX_METADATA_BYTES, 4_667,
      "sha256:eece1e70b757dff57301df9fe98f41b47e77c1ee0d8a71502f28353ae170611b"),
    sourceEntry(root, "metadata/record-after.json", MAX_METADATA_BYTES, 4_667,
      "sha256:eece1e70b757dff57301df9fe98f41b47e77c1ee0d8a71502f28353ae170611b"),
  ];
  for (const specification of OFFICIAL_FILES) {
    entries.push(sourceEntry(root, specification.archivePath, MAX_ARCHIVE_BYTES,
      specification.bytes, specification.sha256, specification.md5));
  }
  const lineage = replayLineage(root);
  entries.push(...lineage.entries);
  const armbenchBytes = readRegular(root, OFFICIAL_FILES[0].archivePath,
    MAX_ARCHIVE_BYTES, OFFICIAL_FILES[0].bytes);
  const failureBytes = readRegular(root, OFFICIAL_FILES[1].archivePath,
    MAX_ARCHIVE_BYTES, OFFICIAL_FILES[1].bytes);
  const armbench = replayArmbenchMembers(armbenchBytes, OFFICIAL_FILES[0]);
  const failure = replayFailureMembers(failureBytes, OFFICIAL_FILES[1]);
  const inventory = inventoryFromReplay(record, armbench, failure);
  return { root, record, entries, lineage, armbench, failure, inventory };
}

function manifestBody(entries, inventory) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: SOURCE_SCHEMA, recordId: ZENODO_15873769_RECORD_ID,
    doi: ZENODO_15873769_DOI, recordRevision: 10,
    officialArchiveFiles: 2, officialArchiveBytes: 166_914_597,
    archiveEntries: 1_346, archiveFiles: 1_337, archiveDirectories: 9,
    armbenchTrialUniverse: 20_008, failureNpyFiles: 229,
    sourceFiles: ordered.length, entries: ordered,
    inventoryHash: inventory.inventoryHash,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

export function createZenodo15873769SourceMaterialFromDirectory(sourceDirectory) {
  const collected = collectCoreSource(sourceDirectory, []);
  const inventoryBytes = serialize(collected.inventory);
  const inventoryEntry = { path: "source-support/zip-inventory.json",
    bytes: inventoryBytes.length, sha256: zenodo15873769Sha256(inventoryBytes) };
  const body = manifestBody([...collected.entries, inventoryEntry], collected.inventory);
  const manifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  return deepFreeze({ inventory: collected.inventory, inventoryBytes,
    sourceManifest: manifest, sourceManifestBytes: serialize(manifest) });
}

function collectCompleteSource(sourceDirectory) {
  const collected = collectCoreSource(sourceDirectory,
    ["source-manifest.json", "source-support/zip-inventory.json"]);
  const inventoryBytes = readRegular(collected.root,
    "source-support/zip-inventory.json", MAX_METADATA_BYTES);
  if (!serialize(collected.inventory).equals(inventoryBytes)) {
    fail("STORED_INVENTORY_MISMATCH");
  }
  const inventoryEntry = { path: "source-support/zip-inventory.json",
    bytes: inventoryBytes.length, sha256: zenodo15873769Sha256(inventoryBytes) };
  const body = manifestBody([...collected.entries, inventoryEntry], collected.inventory);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const sourceManifestBytes = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(sourceManifestBytes)) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  if (sourceManifest.sourceManifestHash !== EXPECTED_SOURCE_MANIFEST_HASH) {
    fail("SOURCE_MANIFEST_PIN_INVALID", sourceManifest.sourceManifestHash);
  }
  return { ...collected, sourceManifest, sourceManifestBytes, inventoryBytes };
}

function parquetReportProjection(parquet) {
  return Object.fromEntries(sorted(Object.keys(parquet)).map((key) => {
    const value = parquet[key];
    return [key, { rows: value.rows, columns: value.columns,
      uniqueTrials: value.uniqueTrials, trialOrderRoot: value.trialOrderRoot,
      valueColumn: value.valueColumn, valueBytes: value.valueBytes,
      minimumValueBytes: value.minValueBytes, maximumValueBytes: value.maxValueBytes,
      valueRoot: value.valueRoot, columnPageCounts: value.columnPageCounts,
      ...(value.byteValueCounts === undefined ? {}
        : { byteValueCounts: value.byteValueCounts }),
      ...(value.shape === undefined ? {} : { shape: value.shape }) }];
  }));
}

function splitReportProjection(split) {
  const project = (value) => ({ name: value.name, rows: value.rows,
    uniqueTrials: value.uniqueTrials, trialOrderRoot: value.trialOrderRoot });
  return { train: project(split.train), test: project(split.test),
    disjoint: split.disjoint, unionTrials: split.unionTrials };
}

function failureTaskReportProjection(tasks) {
  return Object.fromEntries(sorted(Object.keys(tasks)).map((key) => {
    const value = tasks[key];
    return [key, { files: value.files, uniqueIds: value.uniqueIds,
      temporalLabels: value.temporalLabels,
      minimumFrames: value.minimumFrames, maximumFrames: value.maximumFrames,
      missingIdsWithinPublishedRange: value.missingIdsWithinRange.length,
      valueCounts: value.valueCounts }];
  }));
}

export function buildZenodo15873769AnnotationReportFromSource(sourceDirectory) {
  const source = collectCompleteSource(sourceDirectory);
  const armbench = source.armbench;
  const failure = source.failure;
  const reportBody = {
    schema: ZENODO_15873769_REPORT_SCHEMA,
    disposition: ZENODO_15873769_DISPOSITION,
    source: {
      recordId: source.record.id, doi: source.record.doi,
      conceptDoi: source.record.conceptDoi, recordRevision: source.record.revision,
      recordCreated: source.record.created, recordUpdated: source.record.updated,
      title: source.record.title, public: true, openAccess: true,
      officialFileCount: source.record.files.length,
      officialArchiveBytes: source.record.totalBytes,
      recordBeforeAfterByteIdentical: true,
      recordBeforeAfterSha256:
        "sha256:eece1e70b757dff57301df9fe98f41b47e77c1ee0d8a71502f28353ae170611b",
      sourceManifestHash: source.sourceManifest.sourceManifestHash,
      sourceManifestFileSha256: zenodo15873769Sha256(source.sourceManifestBytes),
      sourceRoot: source.sourceManifest.sourceRoot,
      inventoryHash: source.inventory.inventoryHash,
      fullOfficialArchiveBytesRetained: true,
    },
    archiveReplay: {
      archives: [stripZipDetail(armbench.zip), stripZipDetail(failure.zip)],
      totalEntries: armbench.zip.entries + failure.zip.entries,
      totalFiles: armbench.zip.files + failure.zip.files,
      totalDirectories: armbench.zip.directories + failure.zip.directories,
      totalCompressedMemberBytes:
        armbench.zip.compressedBytes + failure.zip.compressedBytes,
      totalUncompressedMemberBytes:
        armbench.zip.uncompressedBytes + failure.zip.uncompressedBytes,
      allCentralDirectoriesParsed: true, allLocalHeadersParsed: true,
      allDataDescriptorsParsed: true, allMembersInflated: true,
      allMemberCrc32ValuesVerified: true,
      fullPrivateEntryInventoryStored: true,
    },
    armbenchAnnotations: {
      split: splitReportProjection(armbench.split),
      parquet: parquetReportProjection(armbench.parquet),
      relabeled: armbench.relabeled,
      crosswalk: armbench.crosswalk,
      visibleTrialUniverse: 20_008,
      detectedActionSegmentRows: 20_008,
      manuallyAnnotatedActionSegmentRows: 500,
      framewiseDefectSegmentRows: 3_466,
      boundingBoxTrialRowsPerBoxFile: 20_008,
      boundingBoxFiles: 4,
      boundingBoxFloat64ValuesNotRobotState: true,
      detectedActionSegmentsArePublisherModelOutput: true,
      manuallyAnnotatedSegmentsArePublisherAnnotations: true,
      correctedJsonLabelsArePublisherLabels: true,
      sourceVideosPresent: false,
    },
    failureAnnotations: {
      tasks: failureTaskReportProjection(failure.tasks), npyFiles: failure.npyFiles,
      dtype: failure.dtype, dimensions: failure.dimensions,
      totalTemporalLabels: failure.totalTemporalLabels,
      valueCounts: failure.valueCounts, rowRoot: failure.rowRoot,
      readme: failure.readme, allNpyPayloadsInertlyParsed: true,
      temporalCodeMappingFromPinnedInertLoader:
        source.lineage.mappingsFromInertCode.failureSubActionLabels,
      sourceVideosPresent: false, benchmarkOutcomeLabelsPresent: false,
    },
    lineage: {
      codeRepository: source.lineage.codeRepository,
      codeCommit: source.lineage.codeCommit,
      codeTree: source.lineage.codeTree,
      codeTreeEntries: source.lineage.codeTreeEntries,
      codeRepositoryLicenseClaim: source.lineage.codeRepositoryLicenseClaim,
      paperDoi: source.lineage.paperDoi, arxivId: source.lineage.arxivId,
      projectPagePinned: source.lineage.projectPagePinned,
      baseArmbenchPagePinned: source.lineage.baseArmbenchPagePinned,
      baseArmbenchPageExclusionReason:
        source.lineage.baseArmbenchPageExclusionReason,
      mappingsFromPinnedInertCode: source.lineage.mappingsFromInertCode,
      codeBytesExecutedDuringAcquisitionOrReplay: false,
    },
    semantics: {
      semanticUnit: "PUBLISHER_VIDEO_DEFECT_ANNOTATION",
      correctedLabelsAndAdditionalAnnotations: true,
      archiveContainsOriginalVideos: false,
      archiveContainsRobotActionState: false,
      archiveContainsControlCommands: false,
      archiveContainsSensorTelemetry: false,
      archiveContainsCompleteEpisodes: false,
      archiveContainsRecoverySequences: false,
      annotationsAreExecutionEffects: false,
      labelsAreIndependentlyObservedOutcomes: false,
      publisherAnnotationsMayReferencePhysicalVideoEvents: true,
      referencedEventsReplayedFromOriginalVisualBytes: false,
      sourceNativeTemporalAndObjectAnnotationsReplayed: true,
    },
    denominatorRegistry: {
      ZENODO_ARCHIVE_FILES: 2,
      ZIP_MEMBER_FILES: 1_337,
      ARMBENCH_TRIAL_UNIVERSE: 20_008,
      ARMBENCH_RELABEL_FILES: 1_098,
      ARMBENCH_MANUALLY_ANNOTATED_ACTION_TRIALS: 500,
      ARMBENCH_DEFECT_SEGMENT_TRIALS: 3_466,
      ARMBENCH_BOUNDING_BOX_ROWS_PER_ROLE: 20_008,
      FAILURE_NPY_TRIAL_FILES: 229,
      FAILURE_TEMPORAL_FRAME_LABELS: 17_400,
      parquetRoleRowsAreNotAdditiveEpisodes: true,
      frameLabelsAreNotAdditionalTrials: true,
      correctedRowsAreSubsetsNotAdditionalEpisodes: true,
      crossDatasetTotalsProhibited: true,
    },
    outcomeBoundary: {
      publisherCorrectedVideoLabels: 1_098,
      publisherFramewiseDefectSegmentRows: 3_466,
      publisherActionTemporalAnnotationRows: 20_508,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      physicalEffectRows: 0, completeEpisodeRows: 0,
      retryRows: 0, recoveryRows: 0, longitudinalRows: 0,
    },
    rightsPrivacyAndUse: {
      rights: {
        officialZenodoLicenseClaim: ZENODO_15873769_LICENSE,
        exactClaimAppliesToDepositedRecordFiles: true,
        codeRepositoryLicenseClaim: null,
        upstreamOriginalVideoRightsEstablishedByThisRecord: false,
        useSpecificModelTrainingAuthorizationEstablished: false,
        rightsDisposition: "FAIL_CLOSED", legalConclusionEstablished: false,
        authorizedTrainingRows: 0,
      },
      privacy: {
        rawSourcePrivate: true, noPiiGuaranteed: false,
        originalVisualSourcePrivacyGuaranteed: false,
        rawTrialIdsOrAnnotationsProjectedIntoReport: false,
        privateSourceFilesMode: "0600", privateSourceDirectoriesMode: "0700",
      },
      use: {
        quarantineEvaluationOnly: true, offlineTrainingRows: 0,
        productionTrainingRows: 0, networkAdmissionRows: 0,
        authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
      },
    },
    zeroClaimBoundary: {
      originalVideoBytes: 0, actionStateRows: 0, controlCommandRows: 0,
      sensorTelemetryRows: 0, independentOutcomeRows: 0,
      physicalEffectRows: 0, completeEpisodeRows: 0,
      retryRows: 0, recoveryRows: 0, longitudinalRows: 0,
      delegationRows: 0, authorizedTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      authorityDelta: 0, autonomousActionAuthorized: false,
    },
  };
  return deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
}

function reportErrors(report) {
  const errors = [];
  if (!exactObject(report) || report.schema !== ZENODO_15873769_REPORT_SCHEMA) {
    return ["SCHEMA_INVALID"];
  }
  if (report.disposition !== ZENODO_15873769_DISPOSITION
    || report.source?.doi !== ZENODO_15873769_DOI
    || report.source?.recordRevision !== 10
    || report.source?.officialArchiveBytes !== 166_914_597
    || report.archiveReplay?.totalEntries !== 1_346
    || report.armbenchAnnotations?.visibleTrialUniverse !== 20_008
    || report.failureAnnotations?.npyFiles !== 229
    || report.failureAnnotations?.totalTemporalLabels !== 17_400) {
    errors.push("SOURCE_DENOMINATOR_BOUNDARY");
  }
  const zero = report.zeroClaimBoundary;
  if (!exactObject(zero) || zero.originalVideoBytes !== 0
    || zero.actionStateRows !== 0 || zero.controlCommandRows !== 0
    || zero.sensorTelemetryRows !== 0 || zero.independentOutcomeRows !== 0
    || zero.physicalEffectRows !== 0 || zero.completeEpisodeRows !== 0
    || zero.retryRows !== 0 || zero.recoveryRows !== 0
    || zero.longitudinalRows !== 0 || zero.delegationRows !== 0
    || zero.authorizedTrainingRows !== 0 || zero.networkAdmissionRows !== 0
    || zero.actorCreditRows !== 0 || zero.ceuRows !== 0
    || zero.authorityDelta !== 0 || zero.autonomousActionAuthorized !== false) {
    errors.push("ZERO_CLAIM_BOUNDARY");
  }
  const rights = report.rightsPrivacyAndUse;
  if (rights?.rights?.officialZenodoLicenseClaim !== ZENODO_15873769_LICENSE
    || rights.rights.rightsDisposition !== "FAIL_CLOSED"
    || rights.rights.authorizedTrainingRows !== 0
    || rights.privacy?.rawSourcePrivate !== true
    || rights.privacy?.noPiiGuaranteed !== false
    || rights.use?.quarantineEvaluationOnly !== true
    || rights.use?.networkAdmissionRows !== 0
    || rights.use?.authorityRows !== 0) errors.push("RIGHTS_PRIVACY_USE_BOUNDARY");
  const { artifactHash: ignored, ...body } = report;
  if (!HASH.test(report.artifactHash ?? "")
    || report.artifactHash !== digest(REPORT_DOMAIN, body)) errors.push("ARTIFACT_HASH");
  return errors;
}

export function verifyZenodo15873769AnnotationReport(report) {
  const errors = reportErrors(report);
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function createZenodo15873769AnnotationReceipt(report, reportBytes,
  manifestBytes) {
  const checked = verifyZenodo15873769AnnotationReport(report);
  if (!checked.ok) fail("REPORT_INVALID", checked.errors.join(","));
  const body = {
    schema: ZENODO_15873769_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileBytes: reportBytes.length,
    reportFileSha256: zenodo15873769Sha256(reportBytes),
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileBytes: manifestBytes.length,
    sourceManifestFileSha256: zenodo15873769Sha256(manifestBytes),
    disposition: ZENODO_15873769_DISPOSITION,
    officialArchiveFiles: 2, officialArchiveBytes: 166_914_597,
    armbenchTrialUniverse: 20_008, failureNpyFiles: 229,
    independentOutcomeRows: 0, physicalEffectRows: 0,
    completeEpisodeRows: 0, recoveryRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    authorityDelta: 0, receiptWrittenLast: true, noClobber: true,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyZenodo15873769AnnotationReceipt(receipt, reportBytes,
  manifestBytes) {
  try {
    const report = parseJson(reportBytes, "REPORT_JSON_INVALID");
    const expected = createZenodo15873769AnnotationReceipt(report, reportBytes,
      manifestBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return deepFreeze({ ok: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyZenodo15873769SourceDirectory(sourceDirectory) {
  try {
    const source = collectCompleteSource(sourceDirectory);
    return deepFreeze({ ok: true, record: source.record,
      sourceManifest: source.sourceManifest, inventory: source.inventory,
      verificationLevel: "FULL_ARCHIVE_BYTES_ZIP_CRC_AND_ANNOTATION_SOURCE_REDERIVED" });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyZenodo15873769AnnotationArtifactDirectory(directory) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)),
        ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const sourceDirectory = checkedPath(root, "source");
    const report = buildZenodo15873769AnnotationReportFromSource(sourceDirectory);
    const expectedReportBytes = serialize(report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createZenodo15873769AnnotationReceipt(report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report, receipt,
      reportFileSha256: zenodo15873769Sha256(reportBytes),
      receiptFileSha256: zenodo15873769Sha256(receiptBytes),
      verificationLevel: "FULL_ARCHIVE_BYTES_ZIP_CRC_AND_ANNOTATION_SOURCE_REDERIVED" });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeZenodo15873769AnnotationArtifact(value) {
  return serialize(value);
}
