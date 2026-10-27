/*
 * Complete fixed-revision replay for HaptalAI/misalignment-failure-benchmark.
 *
 * The two Parquet files are decoded directly from inert bytes.  The included
 * generator, baseline, and scorer are text evidence only and are never run.
 * Current bytes contain 150 wholly synthetic episodes, not the 2,000 episodes
 * described by the README and generator, and episode_id leaks the injected
 * failure class.  Publisher-generated labels are not physical or independent
 * execution outcomes.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const HAPTAL_MISALIGNMENT_DATASET_ID =
  "HaptalAI/misalignment-failure-benchmark";
export const HAPTAL_MISALIGNMENT_REVISION =
  "f402167b1561795b7103deb391d3fb57fcb5ede7";
export const HAPTAL_MISALIGNMENT_LICENSE = "Apache-2.0";
export const HAPTAL_MISALIGNMENT_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";
export const HAPTAL_MISALIGNMENT_REPORT_SCHEMA =
  "outsider/haptal-misalignment-failure-full-repo/v1";
export const HAPTAL_MISALIGNMENT_RECEIPT_SCHEMA =
  "outsider/haptal-misalignment-failure-full-repo-receipt/v1";

const SOURCE_SCHEMA = "outsider/haptal-misalignment-failure-source/v1";
const MANIFEST_DOMAIN = "outsider/haptal-misalignment-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/haptal-misalignment-source-root/v1";
const TREE_ROOT_DOMAIN = "outsider/haptal-misalignment-tree-root/v1";
const REPORT_DOMAIN = "outsider/haptal-misalignment-report/v1";
const RECEIPT_DOMAIN = "outsider/haptal-misalignment-receipt/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

const RECORD_SHA256 =
  "sha256:31cfaf7af9e1706aa38b68ae88d2efcc09eb3718cc8df596a3234296d4182897";
const TREE_SHA256 =
  "sha256:387d1a709df9b15e2135035a1fe50d1a8ed18783fea85d5020b24f07aeeeddc2";

const FILES = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 1_053,
    oid: "99d72b42b172f67ecc29782e30ce96c2e127f0c1", lfs: null,
    sha256: "sha256:868cbec616368b65365fc88cd9e9eab79fcb01d936aab207500a12bcf6a31ea8" }),
  Object.freeze({ path: "README.md", bytes: 12_598,
    oid: "33239b5868daacbc199114f9fac243d0673e0361", lfs: null,
    sha256: "sha256:f9ecfb054ca1df4387bc2e787de00c507be52e8dd20a01ee77c0e0243f5d08a8" }),
  Object.freeze({ path: "baseline.py", bytes: 13_173,
    oid: "0ffd56c588af632c745c249e61ae3bdc3405507e", lfs: null,
    sha256: "sha256:9dfcdca0f4744943a4ba6445b5ef0f199bb3caa68ed854902eb92726ea06f49c" }),
  Object.freeze({ path: "episodes.parquet", bytes: 14_392_520,
    oid: "133d3bf750bf5ccceb7eaa1970a66bf900d97a9f",
    lfs: Object.freeze({ oid:
      "dbb7b0c57743ecd2f80b15ebf6cc894f5e6370d51ea297a9fedfb4f0a9fef5a4",
    size: 14_392_520, pointerSize: 133 }),
    sha256: "sha256:dbb7b0c57743ecd2f80b15ebf6cc894f5e6370d51ea297a9fedfb4f0a9fef5a4" }),
  Object.freeze({ path: "generate_misalignment_dataset.py", bytes: 16_484,
    oid: "3ada2caa00a859c059e2dd9730f5e00cf030c459", lfs: null,
    sha256: "sha256:a7fb080198ca80651829784e64df556d036a933f97166017f3a04f3b38783a01" }),
  Object.freeze({ path: "labels.parquet", bytes: 5_455,
    oid: "3935bdeb29481d33814f825adfa2465f952381ae", lfs: null,
    sha256: "sha256:908c2c8875aa3a866e705b301c5dc8daa87eb170397de01c9f730225e2b68588" }),
  Object.freeze({ path: "score.py", bytes: 4_175,
    oid: "b9cd2cfcb1b7afa04a0412e518e9f50a5f7b6c32", lfs: null,
    sha256: "sha256:210f6f280367b95c56bd209d223a27c1c7c66326004d3392cfdb4b411705a0c3" }),
]);

const EPISODE_COLUMNS = Object.freeze([
  Object.freeze({ name: "episode_id", physicalType: 6, kind: "string" }),
  Object.freeze({ name: "timestep", physicalType: 1, kind: "int32" }),
  ...Array.from({ length: 14 }, (_, index) => [
    Object.freeze({ name: `joint_${index}_pos`, physicalType: 5, kind: "double" }),
    Object.freeze({ name: `joint_${index}_vel`, physicalType: 5, kind: "double" }),
  ]).flat(),
  Object.freeze({ name: "gripper_state", physicalType: 5, kind: "double" }),
  Object.freeze({ name: "end_effector_x", physicalType: 5, kind: "double" }),
  Object.freeze({ name: "end_effector_y", physicalType: 5, kind: "double" }),
  Object.freeze({ name: "end_effector_z", physicalType: 5, kind: "double" }),
  Object.freeze({ name: "contact_force", physicalType: 5, kind: "double" }),
  Object.freeze({ name: "target_x", physicalType: 5, kind: "double" }),
  Object.freeze({ name: "target_y", physicalType: 5, kind: "double" }),
  Object.freeze({ name: "target_z", physicalType: 5, kind: "double" }),
]);

const LABEL_COLUMNS = Object.freeze([
  Object.freeze({ name: "episode_id", physicalType: 6, kind: "string" }),
  Object.freeze({ name: "logged_success", physicalType: 0, kind: "boolean" }),
  Object.freeze({ name: "actually_succeeded", physicalType: 0, kind: "boolean" }),
  Object.freeze({ name: "failure_mode", physicalType: 6, kind: "string" }),
  Object.freeze({ name: "base_dataset", physicalType: 6, kind: "string" }),
  Object.freeze({ name: "split", physicalType: 6, kind: "string" }),
]);

const EPISODE_COLUMN_ROOTS = Object.freeze({
  episode_id: "sha256:10e4c71e54529e81c0edf3201352925593111ad6e51d6410c24baa456116d447",
  timestep: "sha256:ccaffe7d0c4f992ab826c177e534a4d926185a0960c5383c8c7240124541fbb7",
  joint_0_pos: "sha256:e91ecebf189c17c1fbfc4db6eda22b42bb53e42671dd765a27679cabffa11245",
  joint_0_vel: "sha256:951a6b4ffad0af122d9fc56bf87596cbd0b209ad44838fc05be442a0126b4b2f",
  joint_1_pos: "sha256:bbf646dd965d62b519c76d5193d3286726b6e1e0924229856a952fc8bcb3dd2a",
  joint_1_vel: "sha256:be509feba9e3757a41719a5069109915379e21783f60434c880025cfa5364b46",
  joint_2_pos: "sha256:93f95e890379cb442df709f8357cbf4ee3ba05e119dcb0a57a2d9708544ebda2",
  joint_2_vel: "sha256:033c6fd0d79b30491e970aee5df0450e336817aca7942f57192f80a224e37221",
  joint_3_pos: "sha256:4cc56b73b62b23c598730669a6f02af36456178851fd95c0f2cb2e27f86b4639",
  joint_3_vel: "sha256:9690d8d6db280ba58a3ab6cabee722523679cc1dee10acf1cea7f0fa494296c7",
  joint_4_pos: "sha256:67767266dde2fca0dc0a794d2d9870617dfd4b010390534322d43da8ccd5e7ef",
  joint_4_vel: "sha256:4659ba9daad949fbb1b47eb86ed05c83f03e8fc355d5daedb63871fa82dea9cb",
  joint_5_pos: "sha256:ce04314cfa26f5a2834b6b10ad7c8e0b05ebb771ed5209a1e628913b32caf3c8",
  joint_5_vel: "sha256:b12c124f7be168858cbd05e91d940e36f712ee99fa08f8b88828d7e89a559542",
  joint_6_pos: "sha256:78c64d50a407c6c87aac409de500290e79558878a5222a678e2bdb8e9641f994",
  joint_6_vel: "sha256:ef908524da50d09d592d9d6f8fca39477af37c5a845329330c7a4ef3b1320422",
  joint_7_pos: "sha256:e32ab3c4a9e01cf0e4798cb0053e4bc8b0aa3355635d556c31f0f8cb70381ef8",
  joint_7_vel: "sha256:1582bbd0d2dd2b53fbbd272b10958542ad13cde5e13a7a92219b2afa2558dca7",
  joint_8_pos: "sha256:795348dc63ff7593e47ace9ecf1aab3fa50ccaedd86016ea848d25d28929fc38",
  joint_8_vel: "sha256:c273fed80bb8a84f8b32172eba1f8e458259fcb64b7a88410337de8869eb2a55",
  joint_9_pos: "sha256:3e14ccdfc146cc4522cd0c3661f7e48bb6bf5dda97ea46e0a78549dc4951d440",
  joint_9_vel: "sha256:66efb72e0ec873eb2a448a5b84fc1d7f4d60d2c0deabb448dc89b61417c42363",
  joint_10_pos: "sha256:03f66087f373072939ca53211b5a0b19c31ad18c9558b94fecf65460ab23b7f5",
  joint_10_vel: "sha256:1596a0932c6e98034210f665e1a4f798121b6336d7d861e90872ad201ab81a45",
  joint_11_pos: "sha256:722f36e87e7b5ea345241d9fda443f7f92209c92ead2448bf34e7121f79aa046",
  joint_11_vel: "sha256:e0c478e3c01530efac5d9c056e8a29d611579cd14c5cb95c114beaff3d6a9d94",
  joint_12_pos: "sha256:e2ede048213a734db69c72e94eec4b8d336a7fbb4af8c1194adfdaf465ec3d5a",
  joint_12_vel: "sha256:497430585ef11a88dfe909aefeb24451e6aba7321bd7b71963d08bb0ad65d901",
  joint_13_pos: "sha256:5b6bc7c23ad4653b43ec73e7666728a1885290c6c004f11c9881aabc122c102e",
  joint_13_vel: "sha256:2afb00d5a95161e9f459223790c921531e5297a07bfd30d8a768c39a2b7edad1",
  gripper_state: "sha256:86b80fe777093092a9cba46cd4670be44f5d80d5f9e1bf92fa98b2ae7d053188",
  end_effector_x: "sha256:32e0da8dd5f8c1ee17d234b0c5fda90fad093bd4ed54814ff9b41e02a6c56f28",
  end_effector_y: "sha256:4dd5e750a4de3a2fcc7170dab47523021ae7f3e9c886f8ce2fb9a7cd03eeaf01",
  end_effector_z: "sha256:d66212abf5b76ac785d51ae92a02199bbc652ec4550531757a134260232b081f",
  contact_force: "sha256:5082de8245b534e5346b6da2c7498315c50a7167a16a4fd9a09428254dea72fb",
  target_x: "sha256:12450b466c1141df541044ea4939ba1e2195bc95c8df97e20cc78bfc5c2807f3",
  target_y: "sha256:ccde1d1b2fd3fc22f50434952310f6166ca3b00dc74954cefbffacbd5723c33a",
  target_z: "sha256:9d242d2cd1441fa15339353a32891c65bbd5fd8f8aee7dc802343a369a7f75b4",
});

const LABEL_COLUMN_ROOTS = Object.freeze({
  episode_id: "sha256:bf9bdef4ff998ca31abbcb32cb85e94e20f9e282cb58c2d1a787868de9514a2d",
  logged_success: "sha256:893c172baa019a7bc919e5b8255d39258346a9953f305d0b115076f2cc26cbed",
  actually_succeeded: "sha256:faa5057eb5bad6eadd8d8137527e152a892414ea390623e2267f91e2426ad809",
  failure_mode: "sha256:f925e3843a78effe9549a6733271306fcfcac10a1221b6e6557296844e580b93",
  base_dataset: "sha256:da8eeba388fa92abe2b38d1bb2a161356cb64982b0e763eba4e73ca39e942f95",
  split: "sha256:d52a1f25f7a2c716115acbc3df674e5ef5be716c7c37768e654559ee4bb4309f",
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `HAPTAL_MISALIGNMENT_${code}`
    : `HAPTAL_MISALIGNMENT_${code}:${detail}`);
}

export function haptalMisalignmentSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return haptalMisalignmentSha256(Buffer.from(
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
      || BigInt(bytes.length) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    return bytes;
  } finally { closeSync(descriptor); }
}

function hashRegular(root, relative, maximumBytes, exactBytes) {
  const target = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const sha = createHash("sha256");
  const git = createHash("sha1");
  git.update(`blob ${exactBytes}\0`);
  const chunk = Buffer.allocUnsafe(256 * 1024);
  let total = 0;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    for (;;) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      const view = chunk.subarray(0, count);
      sha.update(view); git.update(view); total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || total !== exactBytes) fail("FILE_CHANGED_DURING_READ", relative);
    return { bytes: total, sha256: `sha256:${sha.digest("hex")}`,
      gitOid: git.digest("hex") };
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

function rootLines(lines) {
  return haptalMisalignmentSha256(Buffer.from(`${lines.join("\n")}\n`, "utf8"));
}

function addCount(counts, key, amount = 1) {
  counts[key] = (counts[key] ?? 0) + amount;
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
        return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : result;
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
      const value = this.bytes.readDoubleLE(this.offset); this.offset += 8;
      return value;
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
  const state = { offset: 0 };
  const readVarint = () => {
    let result = 0;
    let shift = 0;
    for (let count = 0; count < 5; count += 1) {
      if (state.offset >= bytes.length) fail("SNAPPY_TRUNCATED");
      const byte = bytes[state.offset++]; result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    fail("SNAPPY_LENGTH_INVALID");
  };
  const declared = readVarint();
  if (declared !== expectedBytes) fail("SNAPPY_DECLARED_SIZE_INVALID");
  const output = Buffer.allocUnsafe(declared);
  let written = 0;
  while (state.offset < bytes.length) {
    const tag = bytes[state.offset++];
    const kind = tag & 3;
    if (kind === 0) {
      let length = tag >>> 2;
      if (length < 60) length += 1;
      else {
        const count = length - 59;
        if (count < 1 || count > 4 || state.offset + count > bytes.length) {
          fail("SNAPPY_LITERAL_LENGTH_INVALID");
        }
        length = 1;
        let encoded = 0;
        for (let index = 0; index < count; index += 1) {
          encoded |= bytes[state.offset++] << index * 8;
        }
        length += encoded >>> 0;
      }
      if (state.offset + length > bytes.length || written + length > output.length) {
        fail("SNAPPY_LITERAL_RANGE_INVALID");
      }
      bytes.copy(output, written, state.offset, state.offset + length);
      state.offset += length; written += length;
    } else {
      let length;
      let back;
      if (kind === 1) {
        if (state.offset >= bytes.length) fail("SNAPPY_COPY_TRUNCATED");
        length = 4 + (tag >>> 2 & 7);
        back = (tag & 0xe0) << 3 | bytes[state.offset++];
      } else if (kind === 2) {
        if (state.offset + 2 > bytes.length) fail("SNAPPY_COPY_TRUNCATED");
        length = 1 + (tag >>> 2);
        back = bytes.readUInt16LE(state.offset); state.offset += 2;
      } else {
        if (state.offset + 4 > bytes.length) fail("SNAPPY_COPY_TRUNCATED");
        length = 1 + (tag >>> 2);
        back = bytes.readUInt32LE(state.offset); state.offset += 4;
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
    result += (byte & 0x7f) * 2 ** shift;
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
  if (physicalType === 0) {
    const length = Math.ceil(count / 8);
    if (length > bytes.length) fail("PARQUET_BOOLEAN_TRUNCATED");
    for (let index = 0; index < count; index += 1) {
      values.push(Boolean(bytes[Math.floor(index / 8)] >>> (index % 8) & 1));
    }
    return { values, bytes: length };
  }
  for (let index = 0; index < count; index += 1) {
    if (physicalType === 1) {
      if (offset + 4 > bytes.length) fail("PARQUET_INT32_TRUNCATED");
      values.push(bytes.readInt32LE(offset)); offset += 4;
    } else if (physicalType === 2) {
      if (offset + 8 > bytes.length) fail("PARQUET_INT64_TRUNCATED");
      const value = bytes.readBigInt64LE(offset); offset += 8;
      if (value < BigInt(Number.MIN_SAFE_INTEGER)
        || value > BigInt(Number.MAX_SAFE_INTEGER)) fail("PARQUET_INT64_UNSAFE");
      values.push(Number(value));
    } else if (physicalType === 5) {
      if (offset + 8 > bytes.length) fail("PARQUET_DOUBLE_TRUNCATED");
      values.push(bytes.readDoubleLE(offset)); offset += 8;
    } else if (physicalType === 6) {
      if (offset + 4 > bytes.length) fail("PARQUET_BYTE_ARRAY_TRUNCATED");
      const length = bytes.readUInt32LE(offset); offset += 4;
      if (offset + length > bytes.length) fail("PARQUET_BYTE_ARRAY_RANGE_INVALID");
      values.push(bytes.subarray(offset, offset + length)); offset += length;
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

function parseParquetMetadata(bytes, specification) {
  if (bytes.length !== specification.bytes
    || haptalMisalignmentSha256(bytes) !== specification.sha256
    || !bytes.subarray(0, 4).equals(Buffer.from("PAR1", "ascii"))
    || !bytes.subarray(-4).equals(Buffer.from("PAR1", "ascii"))) {
    fail("PARQUET_FILE_INVALID", specification.name);
  }
  const footerBytes = bytes.readUInt32LE(bytes.length - 8);
  const footerOffset = bytes.length - 8 - footerBytes;
  if (footerOffset < 4) fail("PARQUET_FOOTER_RANGE_INVALID");
  const reader = new CompactReader(bytes, footerOffset);
  const metadata = reader.struct();
  if (reader.offset !== bytes.length - 8 || metadata[1] !== 2
    || metadata[3] !== specification.rows || !Array.isArray(metadata[2])
    || !Array.isArray(metadata[4]) || metadata[4].length !== 1
    || strictUtf8(metadata[6], "PARQUET_CREATED_BY_INVALID")
      !== "parquet-cpp-arrow version 24.0.0") fail("PARQUET_METADATA_INVALID");
  const schemaNames = parquetSchemaNames(metadata[2]);
  if (!same(schemaNames, specification.columns.map((column) => column.name))) {
    fail("PARQUET_SCHEMA_PROFILE_INVALID");
  }
  const rowGroup = metadata[4][0];
  if (rowGroup[3] !== specification.rows || !Array.isArray(rowGroup[1])
    || rowGroup[1].length !== specification.columns.length) {
    fail("PARQUET_ROW_GROUP_INVALID");
  }
  const columns = rowGroup[1].map((chunk, index) => {
    const value = chunk[3];
    const expected = specification.columns[index];
    if (!exactObject(value) || !Array.isArray(value[3]) || value[4] !== 1
      || value[1] !== expected.physicalType || !Array.isArray(value[2])
      || !value[2].every((encoding) => [0, 3, 8].includes(encoding))) {
      fail("PARQUET_COLUMN_METADATA_INVALID", expected.name);
    }
    const columnPath = value[3].map((part) => strictUtf8(part,
      "PARQUET_PATH_INVALID"));
    if (!same(columnPath, [expected.name]) || value[5] !== specification.rows) {
      fail("PARQUET_COLUMN_PROFILE_INVALID", expected.name);
    }
    return { name: expected.name, kind: expected.kind,
      physicalType: value[1], encodings: value[2], path: columnPath,
      codec: value[4], numValues: value[5], uncompressedBytes: value[6],
      compressedBytes: value[7], dataOffset: value[9],
      dictionaryOffset: value[11] ?? null };
  });
  return { footerOffset, footerBytes, columns };
}

function decodeColumnPages(bytes, column) {
  const start = column.dictionaryOffset ?? column.dataOffset;
  const end = start + column.compressedBytes;
  if (start < 4 || end > bytes.length - 8) fail("PARQUET_COLUMN_RANGE_INVALID");
  let offset = start;
  let dictionary = null;
  const values = [];
  let pageCount = 0;
  let dataPages = 0;
  let dictionaryPages = 0;
  while (offset < end) {
    const reader = new CompactReader(bytes, offset);
    const header = reader.struct();
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
      dictionary = decoded.values; dictionaryPages += 1;
    } else {
      const data = header[5];
      if (!exactObject(data) || ![0, 8].includes(data[2])
        || data[3] !== 3 || data[4] !== 3) fail("PARQUET_DATA_HEADER_INVALID");
      const count = data[1];
      let cursor = 0;
      const definition = decodeHybrid(page.subarray(cursor), 1, count, true);
      cursor += definition.bytes;
      if (definition.values.some((value) => ![0, 1].includes(value))) {
        fail("PARQUET_DEFINITION_INVALID");
      }
      const definedCount = definition.values.filter((value) => value === 1).length;
      let decoded;
      if (data[2] === 8) {
        if (dictionary === null || cursor >= page.length) {
          fail("PARQUET_DICTIONARY_DATA_INVALID");
        }
        const bitWidth = page[cursor++];
        const indices = decodeHybrid(page.subarray(cursor), bitWidth,
          definedCount, false);
        cursor += indices.bytes;
        if (indices.values.some((index) => index < 0 || index >= dictionary.length)) {
          fail("PARQUET_DICTIONARY_INDEX_INVALID");
        }
        decoded = indices.values.map((index) => dictionary[index]);
      } else {
        const plain = plainValues(page.subarray(cursor), column.physicalType,
          definedCount);
        cursor += plain.bytes; decoded = plain.values;
      }
      if (cursor !== page.length) fail("PARQUET_DATA_TRAILING_BYTES", column.name);
      let decodedOffset = 0;
      for (const definitionLevel of definition.values) {
        values.push(definitionLevel === 0 ? null : decoded[decodedOffset++]);
      }
      if (decodedOffset !== decoded.length) fail("PARQUET_DEFINED_COUNT_INVALID");
      dataPages += 1;
    }
    offset = reader.offset + header[3]; pageCount += 1;
  }
  if (offset !== end || values.length !== column.numValues) {
    fail("PARQUET_COLUMN_COUNT_INVALID", column.name);
  }
  return { values, pageCount, dataPages, dictionaryPages,
    dictionaryValues: dictionary?.length ?? 0 };
}

function typedColumnRoot(values, kind) {
  const hash = createHash("sha256");
  const scratch = Buffer.allocUnsafe(8);
  for (const value of values) {
    if (value === null) { hash.update(Buffer.from([0])); continue; }
    hash.update(Buffer.from([1]));
    if (kind === "string") {
      if (!Buffer.isBuffer(value)) fail("PARQUET_STRING_STORAGE_INVALID");
      const length = Buffer.allocUnsafe(4); length.writeUInt32BE(value.length);
      hash.update(length); hash.update(value);
    } else if (kind === "int32") {
      if (!Number.isSafeInteger(value)) fail("PARQUET_INT32_VALUE_INVALID");
      scratch.writeInt32LE(value, 0); hash.update(scratch.subarray(0, 4));
    } else if (kind === "double") {
      if (typeof value !== "number") fail("PARQUET_DOUBLE_VALUE_INVALID");
      scratch.writeDoubleLE(value, 0); hash.update(scratch);
    } else if (kind === "boolean") {
      if (typeof value !== "boolean") fail("PARQUET_BOOLEAN_VALUE_INVALID");
      hash.update(Buffer.from([value ? 1 : 0]));
    } else fail("PARQUET_KIND_INVALID", kind);
  }
  return `sha256:${hash.digest("hex")}`;
}

function replayParquet(bytes, specification) {
  const parsed = parseParquetMetadata(bytes, specification);
  const columns = {};
  const projection = {};
  for (const metadata of parsed.columns) {
    const decoded = decodeColumnPages(bytes, metadata);
    const values = metadata.kind === "string"
      ? decoded.values.map((value) => value === null ? null
        : strictUtf8(value, "PARQUET_STRING_UTF8_INVALID"))
      : decoded.values;
    const root = typedColumnRoot(decoded.values, metadata.kind);
    if (root !== specification.roots[metadata.name]) {
      fail("PARQUET_COLUMN_ROOT_INVALID", metadata.name);
    }
    columns[metadata.name] = values;
    projection[metadata.name] = {
      physicalType: metadata.physicalType, logicalKind: metadata.kind,
      rows: values.length, nulls: values.filter((value) => value === null).length,
      encodings: metadata.encodings, compressedBytes: metadata.compressedBytes,
      uncompressedBytes: metadata.uncompressedBytes,
      pageCount: decoded.pageCount, dataPages: decoded.dataPages,
      dictionaryPages: decoded.dictionaryPages,
      dictionaryValues: decoded.dictionaryValues, columnRoot: root,
    };
  }
  const combinedRoot = rootLines(specification.columns.map((column) =>
    `${column.name}\0${projection[column.name].columnRoot}`));
  if (combinedRoot !== specification.combinedRoot) {
    fail("PARQUET_COMBINED_ROOT_INVALID", specification.name);
  }
  return { columns, projection: {
    file: specification.name, bytes: bytes.length,
    sha256: haptalMisalignmentSha256(bytes), rows: specification.rows,
    columns: specification.columns.map((column) => column.name), rowGroups: 1,
    createdBy: "parquet-cpp-arrow version 24.0.0",
    footerBytes: parsed.footerBytes, footerOffset: parsed.footerOffset,
    columnDetails: projection, combinedColumnRoot: combinedRoot,
    allColumnsFullyDecoded: true,
  } };
}

const EPISODE_PARQUET = Object.freeze({ name: "episodes.parquet",
  bytes: 14_392_520, sha256: FILES.find((file) => file.path === "episodes.parquet").sha256,
  rows: 51_172, columns: EPISODE_COLUMNS, roots: EPISODE_COLUMN_ROOTS,
  combinedRoot: "sha256:874598d7f05b0aa61f465131bdab2e312ecf38dd5601e82e48cfa5082a28c619" });
const LABEL_PARQUET = Object.freeze({ name: "labels.parquet", bytes: 5_455,
  sha256: FILES.find((file) => file.path === "labels.parquet").sha256,
  rows: 150, columns: LABEL_COLUMNS, roots: LABEL_COLUMN_ROOTS,
  combinedRoot: "sha256:a23fe083f16d924c894121057de065e946ce2cb3bf1cbd937f70894edf707bb3" });

function metadataProjection(recordBytes, treeBytes) {
  if (recordBytes.length !== 1_963
    || haptalMisalignmentSha256(recordBytes) !== RECORD_SHA256
    || treeBytes.length !== 913
    || haptalMisalignmentSha256(treeBytes) !== TREE_SHA256) {
    fail("METADATA_BYTES_INVALID");
  }
  const record = parseJson(recordBytes, "RECORD_JSON_INVALID");
  const tree = parseJson(treeBytes, "TREE_JSON_INVALID");
  if (record.id !== HAPTAL_MISALIGNMENT_DATASET_ID
    || record.sha !== HAPTAL_MISALIGNMENT_REVISION
    || record.author !== "HaptalAI" || record.private !== false
    || record.gated !== false || record.disabled !== false
    || record.createdAt !== "2026-05-21T07:13:09.000Z"
    || record.lastModified !== "2026-06-09T23:03:52.000Z"
    || record.usedStorage !== 201_772_598
    || record.cardData?.license !== "apache-2.0"
    || record.cardData?.paper !== "arxiv:2606.03134"
    || !same(record.cardData?.size_categories, ["1K<n<10K"])
    || !record.tags?.includes("license:apache-2.0")
    || !record.tags.includes("size_categories:10K<n<100K")
    || !Array.isArray(record.siblings)
    || !same(record.siblings.map((entry) => entry.rfilename),
      FILES.map((entry) => entry.path))) fail("RECORD_PROFILE_INVALID");
  if (!Array.isArray(tree) || tree.length !== FILES.length) {
    fail("TREE_PROFILE_INVALID");
  }
  const entries = tree.map((entry, index) => {
    const expected = FILES[index];
    if (entry.type !== "file" || entry.path !== expected.path
      || entry.oid !== expected.oid || entry.size !== expected.bytes
      || !same(entry.lfs ?? null, expected.lfs)) {
      fail("TREE_ENTRY_INVALID", expected.path);
    }
    if (expected.path === "episodes.parquet") {
      if (entry.xetHash
        !== "f8f2d27500532ca16082aaffb812148765563330f287cf558f985c2b21a4b40d") {
        fail("TREE_XET_HASH_INVALID");
      }
    } else if (entry.xetHash !== undefined) fail("TREE_XET_UNEXPECTED", expected.path);
    return { path: entry.path, bytes: entry.size, oid: entry.oid,
      lfs: entry.lfs ?? null, xetHash: entry.xetHash ?? null };
  });
  const treeRoot = digest(TREE_ROOT_DOMAIN, entries);
  return { record: {
    datasetId: record.id, revision: record.sha, author: record.author,
    createdAt: record.createdAt, lastModified: record.lastModified,
    public: true, gated: false, disabled: false,
    recordUsedStorageBytes: record.usedStorage,
    cardLicenseClaim: record.cardData.license,
    cardPaperClaim: record.cardData.paper,
    cardSizeCategoryClaim: record.cardData.size_categories[0],
    apiTagSizeCategoryClaim: "10K<n<100K",
    siblingPaths: record.siblings.length,
  }, tree: { entries, files: entries.length, directories: 0,
    fileBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    lfsFiles: entries.filter((entry) => entry.lfs !== null).length,
    xetFiles: entries.filter((entry) => entry.xetHash !== null).length,
    treeRoot } };
}

export function inspectHaptalMisalignmentMetadata(recordBytes, treeBytes) {
  return deepFreeze(metadataProjection(recordBytes, treeBytes));
}

function exactCounts(actual, expected, code) {
  if (!same(actual, expected)) fail(code);
}

function replayCorpus(episodeBytes, labelBytes) {
  const episodes = replayParquet(episodeBytes, EPISODE_PARQUET);
  const labels = replayParquet(labelBytes, LABEL_PARQUET);
  const ec = episodes.columns;
  const lc = labels.columns;
  const labelIds = lc.episode_id;
  if (new Set(labelIds).size !== 150
    || labelIds.some((id) => typeof id !== "string"
      || !/^(?:true_success|phantom_grasp|misplaced_target|incomplete_insertion|premature_success)_\d{4}$/u.test(id))
    || rootLines(labelIds)
      !== "sha256:0bbb534e0e9848ec0e68dd39ebdacc4d1c822e63239049c3e503d453eff7629b") {
    fail("LABEL_ID_CENSUS_INVALID");
  }
  if (lc.logged_success.some((value) => value !== true)
    || lc.actually_succeeded.some((value) => typeof value !== "boolean")
    || lc.failure_mode.some((value) => !["none", "phantom_grasp",
      "misplaced_target", "incomplete_insertion", "premature_success"].includes(value))
    || lc.base_dataset.some((value) => !["lerobot/aloha_sim_transfer_cube_human",
      "lerobot/aloha_sim_insertion_human", "lerobot/xarm_lift_medium_replay",
      "lerobot/xarm_push_medium_replay"].includes(value))
    || lc.split.some((value) => !["train", "test"].includes(value))) {
    fail("LABEL_VALUE_DOMAIN_INVALID");
  }
  const failureCounts = {};
  const splitCounts = {};
  const baseCounts = {};
  const outcomeCounts = { false: 0, true: 0 };
  const splitOutcomeCounts = {};
  const modeSplitCounts = {};
  const modeBaseCounts = {};
  const labelById = new Map();
  for (let index = 0; index < labelIds.length; index += 1) {
    const id = labelIds[index];
    const mode = lc.failure_mode[index];
    const actual = lc.actually_succeeded[index];
    const prefix = id.slice(0, id.lastIndexOf("_"));
    const expectedMode = prefix === "true_success" ? "none" : prefix;
    if (mode !== expectedMode || actual !== (mode === "none")) {
      fail("SYNTHETIC_LABEL_ID_CONSISTENCY_INVALID", id);
    }
    const row = { id, loggedSuccess: true, actuallySucceeded: actual,
      failureMode: mode, baseDataset: lc.base_dataset[index],
      split: lc.split[index] };
    labelById.set(id, row);
    addCount(failureCounts, mode); addCount(splitCounts, row.split);
    addCount(baseCounts, row.baseDataset); addCount(outcomeCounts, String(actual));
    addCount(splitOutcomeCounts, `${row.split}/${actual ? "success" : "failure"}`);
    addCount(modeSplitCounts, `${mode}/${row.split}`);
    addCount(modeBaseCounts, `${mode}/${row.baseDataset}`);
  }
  exactCounts(failureCounts, { incomplete_insertion: 22, misplaced_target: 23,
    none: 60, phantom_grasp: 23, premature_success: 22 },
  "FAILURE_MODE_COUNTS_INVALID");
  exactCounts(splitCounts, { test: 40, train: 110 }, "SPLIT_COUNTS_INVALID");
  exactCounts(baseCounts, {
    "lerobot/aloha_sim_insertion_human": 38,
    "lerobot/aloha_sim_transfer_cube_human": 42,
    "lerobot/xarm_lift_medium_replay": 38,
    "lerobot/xarm_push_medium_replay": 32,
  }, "BASE_DATASET_COUNTS_INVALID");
  exactCounts(outcomeCounts, { false: 90, true: 60 }, "OUTCOME_COUNTS_INVALID");
  exactCounts(splitOutcomeCounts, { "test/failure": 25, "test/success": 15,
    "train/failure": 65, "train/success": 45 },
  "SPLIT_OUTCOME_COUNTS_INVALID");
  exactCounts(modeSplitCounts, {
    "incomplete_insertion/test": 5, "incomplete_insertion/train": 17,
    "misplaced_target/test": 8, "misplaced_target/train": 15,
    "none/test": 15, "none/train": 45,
    "phantom_grasp/test": 8, "phantom_grasp/train": 15,
    "premature_success/test": 4, "premature_success/train": 18,
  }, "MODE_SPLIT_COUNTS_INVALID");
  exactCounts(modeBaseCounts, {
    "incomplete_insertion/lerobot/aloha_sim_insertion_human": 8,
    "incomplete_insertion/lerobot/aloha_sim_transfer_cube_human": 5,
    "incomplete_insertion/lerobot/xarm_lift_medium_replay": 5,
    "incomplete_insertion/lerobot/xarm_push_medium_replay": 4,
    "misplaced_target/lerobot/aloha_sim_insertion_human": 5,
    "misplaced_target/lerobot/aloha_sim_transfer_cube_human": 7,
    "misplaced_target/lerobot/xarm_lift_medium_replay": 1,
    "misplaced_target/lerobot/xarm_push_medium_replay": 10,
    "none/lerobot/aloha_sim_insertion_human": 15,
    "none/lerobot/aloha_sim_transfer_cube_human": 20,
    "none/lerobot/xarm_lift_medium_replay": 15,
    "none/lerobot/xarm_push_medium_replay": 10,
    "phantom_grasp/lerobot/aloha_sim_insertion_human": 7,
    "phantom_grasp/lerobot/aloha_sim_transfer_cube_human": 7,
    "phantom_grasp/lerobot/xarm_lift_medium_replay": 5,
    "phantom_grasp/lerobot/xarm_push_medium_replay": 4,
    "premature_success/lerobot/aloha_sim_insertion_human": 3,
    "premature_success/lerobot/aloha_sim_transfer_cube_human": 3,
    "premature_success/lerobot/xarm_lift_medium_replay": 12,
    "premature_success/lerobot/xarm_push_medium_replay": 4,
  }, "MODE_BASE_COUNTS_INVALID");

  if (rootLines(ec.episode_id)
    !== "sha256:57346256aaf8748424e96c0c9e1bd7b008b698578ef4cdc3c6b852458e6d6d27") {
    fail("TRAJECTORY_ID_ORDER_ROOT_INVALID");
  }
  const episodeOrder = [];
  const episodeLengths = new Map();
  let current = null;
  for (let index = 0; index < ec.episode_id.length; index += 1) {
    const id = ec.episode_id[index];
    if (id !== current) {
      if (episodeLengths.has(id)) fail("EPISODE_ROWS_NONCONTIGUOUS", id);
      current = id; episodeOrder.push(id); episodeLengths.set(id, 0);
    }
    const expectedTimestep = episodeLengths.get(id);
    if (ec.timestep[index] !== expectedTimestep) {
      fail("TIMESTEP_SEQUENCE_INVALID", `${id}/${index}`);
    }
    episodeLengths.set(id, expectedTimestep + 1);
  }
  if (!same(episodeOrder, labelIds) || episodeOrder.length !== 150
    || [...episodeLengths.values()].reduce((sum, value) => sum + value, 0) !== 51_172
    || Math.min(...episodeLengths.values()) !== 175
    || Math.max(...episodeLengths.values()) !== 525) {
    fail("EPISODE_LABEL_CROSSWALK_INVALID");
  }
  const baseRanges = {
    "lerobot/aloha_sim_insertion_human": [475, 525],
    "lerobot/aloha_sim_transfer_cube_human": [375, 425],
    "lerobot/xarm_lift_medium_replay": [175, 225],
    "lerobot/xarm_push_medium_replay": [225, 275],
  };
  const episodeSummaryLines = [];
  for (const id of episodeOrder) {
    const label = labelById.get(id);
    const length = episodeLengths.get(id);
    const [minimum, maximum] = baseRanges[label.baseDataset];
    if (length < minimum || length > maximum) fail("EPISODE_LENGTH_RANGE_INVALID", id);
    episodeSummaryLines.push(`${id}\0${length}\0${label.failureMode}\0${label.baseDataset}\0${label.split}`);
  }
  const episodeSummaryRoot = rootLines(episodeSummaryLines);
  if (episodeSummaryRoot
    !== "sha256:6d72ff2d2e49dcb0cc61df5a6714ef5a44c90ed5a4d96e9b56aa249e2037da3a") {
    fail("EPISODE_SUMMARY_ROOT_INVALID");
  }

  const baseTimestepRows = {};
  const modeTimestepRows = {};
  const splitTimestepRows = {};
  let xarmNullRows = 0;
  let targetConstantEpisodes = 0;
  let rowOffset = 0;
  const requiredNumeric = EPISODE_COLUMNS.slice(2).map((column) => column.name);
  for (const id of episodeOrder) {
    const label = labelById.get(id);
    const length = episodeLengths.get(id);
    addCount(baseTimestepRows, label.baseDataset, length);
    addCount(modeTimestepRows, label.failureMode, length);
    addCount(splitTimestepRows, label.split, length);
    const xarm = label.baseDataset.includes("/xarm_");
    if (xarm) xarmNullRows += length;
    for (let relative = 0; relative < length; relative += 1) {
      const index = rowOffset + relative;
      for (const name of requiredNumeric) {
        const match = /^joint_(\d+)_(?:pos|vel)$/u.exec(name);
        const shouldBeNull = xarm && match !== null && Number(match[1]) >= 7;
        if ((ec[name][index] === null) !== shouldBeNull) {
          fail("SYNTHETIC_SIGNAL_NULL_PROFILE_INVALID", `${id}/${name}`);
        }
      }
    }
    const targetConstant = ["target_x", "target_y", "target_z"].every((name) => {
      const first = ec[name][rowOffset];
      for (let index = rowOffset + 1; index < rowOffset + length; index += 1) {
        if (!Object.is(ec[name][index], first)) return false;
      }
      return true;
    });
    if (targetConstant) targetConstantEpisodes += 1;
    rowOffset += length;
  }
  if (rowOffset !== 51_172 || xarmNullRows !== 15_398
    || targetConstantEpisodes !== 150) fail("TRAJECTORY_SHAPE_PROFILE_INVALID");
  exactCounts(baseTimestepRows, {
    "lerobot/aloha_sim_insertion_human": 18_981,
    "lerobot/aloha_sim_transfer_cube_human": 16_793,
    "lerobot/xarm_lift_medium_replay": 7_519,
    "lerobot/xarm_push_medium_replay": 7_879,
  }, "BASE_TIMESTEP_COUNTS_INVALID");
  exactCounts(modeTimestepRows, { incomplete_insertion: 7_903,
    misplaced_target: 8_002, none: 20_949, phantom_grasp: 8_279,
    premature_success: 6_039 }, "MODE_TIMESTEP_COUNTS_INVALID");
  exactCounts(splitTimestepRows, { test: 12_843, train: 38_329 },
    "SPLIT_TIMESTEP_COUNTS_INVALID");
  const extraJointNullCounts = {};
  for (let joint = 7; joint < 14; joint += 1) {
    for (const suffix of ["pos", "vel"]) {
      const name = `joint_${joint}_${suffix}`;
      extraJointNullCounts[name] = ec[name].filter((value) => value === null).length;
      if (extraJointNullCounts[name] !== 15_398) {
        fail("EXTRA_JOINT_NULL_COUNT_INVALID", name);
      }
    }
  }
  return { episodes: episodes.projection, labels: labels.projection,
    census: {
      syntheticEpisodes: 150, syntheticTimestepRows: 51_172,
      minimumTimesteps: 175, maximumTimesteps: 525,
      labelRows: 150, uniqueEpisodeIds: 150,
      episodeRowsContiguous: true, timestepsZeroBasedContiguous: true,
      episodeLabelIdSetsIdentical: true, episodeAndLabelOrderIdentical: true,
      labelOrderRoot:
        "sha256:0bbb534e0e9848ec0e68dd39ebdacc4d1c822e63239049c3e503d453eff7629b",
      trajectoryEpisodeOrderRoot:
        "sha256:57346256aaf8748424e96c0c9e1bd7b008b698578ef4cdc3c6b852458e6d6d27",
      episodeSummaryRoot, failureModeCounts: failureCounts,
      splitCounts, baseDatasetCounts: baseCounts, publisherOutcomeCounts: outcomeCounts,
      splitOutcomeCounts, modeSplitCounts, modeBaseCounts,
      baseDatasetTimestepRows: baseTimestepRows,
      failureModeTimestepRows: modeTimestepRows,
      splitTimestepRows, xarmPaddedTimestepRows: xarmNullRows,
      extraJointNullCells: xarmNullRows * 14,
      extraJointNullCounts, targetConstantEpisodes,
      allLoggedSuccessPublisherFlagsTrue: true,
      actuallySucceededMatchesInjectedClassForAllLabels: true,
      episodeIdPrefixRevealsFailureModeRows: 150,
      episodeIdPrefixPerfectlyRevealsActuallySucceededRows: 150,
    } };
}

export function inspectHaptalMisalignmentParquet(episodeBytes, labelBytes) {
  return deepFreeze(replayCorpus(episodeBytes, labelBytes));
}

function replayTextFiles(root) {
  const readme = strictUtf8(readRegular(root, "files/README.md",
    MAX_SOURCE_FILE_BYTES, 12_598), "README_UTF8_INVALID");
  const generator = strictUtf8(readRegular(root,
    "files/generate_misalignment_dataset.py", MAX_SOURCE_FILE_BYTES, 16_484),
  "GENERATOR_UTF8_INVALID");
  const baseline = strictUtf8(readRegular(root, "files/baseline.py",
    MAX_SOURCE_FILE_BYTES, 13_173), "BASELINE_UTF8_INVALID");
  const scorer = strictUtf8(readRegular(root, "files/score.py",
    MAX_SOURCE_FILE_BYTES, 4_175), "SCORER_UTF8_INVALID");
  const attributes = strictUtf8(readRegular(root, "files/.gitattributes",
    MAX_SOURCE_FILE_BYTES, 1_053), "GITATTRIBUTES_UTF8_INVALID");
  if (!readme.includes("# Haptal Misalignment Failure Benchmark v1.1")
    || !readme.includes("The dataset contains 2,000 synthetic episodes")
    || !readme.includes("print(episodes.shape)       # (678291, 38)")
    || !readme.includes("800 true successes + 300 × 4 misalignment failures = 2,000 episodes total")
    || !readme.includes("Train | 1,600 | 640 | 960")
    || !readme.includes("Test | 400 | 160 | 240")
    || !readme.includes("HaptalAI/misalignment-benchmark-v2")
    || !readme.includes("title     = {Haptal Misalignment Failure Benchmark v1.0}")
    || !readme.includes("Base trajectory statistics are derived from LeRobot datasets released under the **MIT License**")
    || !generator.includes("Produces 2000 synthetic robot episodes")
    || !generator.includes('"true_success":         800')
    || !generator.includes('"premature_success":    300')
    || !generator.includes("master_rng = np.random.default_rng(seed)")
    || !generator.includes('"logged_success":    True')
    || !generator.includes('"actually_succeeded": cls == "true_success"')
    || !generator.includes("save_parquet(episodes_df, out_dir / \"episodes.parquet\")")
    || !baseline.includes("RandomForestClassifier")
    || !baseline.includes("n_estimators=300")
    || !scorer.includes('merged = gt.merge(preds, on="episode_id", how="inner")')
    || !scorer.includes("have no prediction — excluded")
    || !scorer.includes('["predicted_actually_succeeded"].astype(bool)')
    || !attributes.includes("ep_01.parquet filter=lfs diff=lfs merge=lfs -text")
    || !attributes.includes("ep_20.parquet filter=lfs diff=lfs merge=lfs -text")
    || !attributes.includes("episodes.parquet filter=lfs diff=lfs merge=lfs -text")) {
    fail("TEXT_SOURCE_PROFILE_INVALID");
  }
  return {
    readme: {
      headingVersionClaim: "v1.1", citationVersionClaim: "v1.0",
      seriesVersionClaim: "v2", claimedEpisodes: 2_000,
      claimedTimestepRows: 678_291, claimedTrainEpisodes: 1_600,
      claimedTestEpisodes: 400, claimedTrueSuccesses: 800,
      claimedInjectedFailures: 1_200,
      loadExampleDatasetId: "HaptalAI/misalignment-benchmark-v2",
      loadExampleMatchesCurrentDatasetId: false,
      publisherRealRobotDataDerivationClaimPresent: true,
      publisherPhysicsGroundedRangeClaimPresent: true,
      upstreamMitLicenseClaimPresent: true,
    },
    generator: {
      configuredSyntheticEpisodes: 2_000,
      configuredClassCounts: { true_success: 800, phantom_grasp: 300,
        misplaced_target: 300, incomplete_insertion: 300,
        premature_success: 300 },
      configuredSeed: 42, configuredTrainFraction: 0.8,
      readsUpstreamTrajectoryFiles: false,
      upstreamTrajectoryBytesPresentInFixedRepository: false,
      currentParquetEpisodeRows: 150,
      currentBytesMatchIncludedGeneratorDenominator: false,
      current150EpisodeSelectionCodePresent: false,
      generatedLoggedSuccessConstant: true,
      generatedActuallySucceededFromClassName: true,
      executedDuringAcquisitionOrReplay: false,
    },
    baseline: {
      randomForestEstimatorsDeclared: 300,
      publisherMetricsPresentInReadme: true,
      publisherMetricsReexecuted: false,
      publisherMetricsIndependentlyEstablished: false,
      executedDuringAcquisitionOrReplay: false,
    },
    scorer: {
      innerJoinPredictionsToGroundTruth: true,
      missingPredictionsExcludedFromMetricDenominator: true,
      exactTestPredictionCensusRequired: false,
      duplicatePredictionIdsRejected: false,
      extraPredictionIdsRejected: false,
      strictStringBooleanParsing: false,
      headlineMetricDenominatorGameableByPartialSubmission: true,
      executedDuringAcquisitionOrReplay: false,
    },
    gitattributes: {
      historicalEpisodeShardPatterns: 20,
      historicalEpisodeShardFilesPresentAtFixedRevision: 0,
      episodesParquetLfsPatternPresent: true,
      labelsParquetLfsPatternPresent: false,
    },
    allPythonFilesInert: true,
  };
}

const CORE_PATHS = Object.freeze([
  "metadata/dataset-record-before.json",
  "metadata/dataset-record-after.json",
  "metadata/full-tree-before.json",
  "metadata/full-tree-after.json",
  ...FILES.map((file) => `files/${file.path}`),
]);

const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:834fbc8c38adba0ad57016a52d52be2d52310fbc147d2f8bb320f93aa2452e64";

function sourceEntry(root, relative, maximumBytes, exactBytes, expectedSha256) {
  const measured = hashRegular(root, relative, maximumBytes, exactBytes);
  if (measured.sha256 !== expectedSha256) fail("SOURCE_ENTRY_DIGEST_INVALID", relative);
  return { path: relative, bytes: measured.bytes, sha256: measured.sha256 };
}

function collectCoreSource(sourceDirectory, expectedExtraPaths = []) {
  const root = path.resolve(sourceDirectory);
  if (!same(walk(root), sorted([...CORE_PATHS, ...expectedExtraPaths]))) {
    fail("SOURCE_LAYOUT_INVALID");
  }
  const recordBefore = readRegular(root,
    "metadata/dataset-record-before.json", MAX_METADATA_BYTES, 1_963);
  const recordAfter = readRegular(root,
    "metadata/dataset-record-after.json", MAX_METADATA_BYTES, 1_963);
  const treeBefore = readRegular(root,
    "metadata/full-tree-before.json", MAX_METADATA_BYTES, 913);
  const treeAfter = readRegular(root,
    "metadata/full-tree-after.json", MAX_METADATA_BYTES, 913);
  if (!recordBefore.equals(recordAfter) || !treeBefore.equals(treeAfter)) {
    fail("ACQUISITION_BRACKET_CHANGED");
  }
  const metadata = metadataProjection(recordBefore, treeBefore);
  const entries = [
    sourceEntry(root, "metadata/dataset-record-before.json", MAX_METADATA_BYTES,
      1_963, RECORD_SHA256),
    sourceEntry(root, "metadata/dataset-record-after.json", MAX_METADATA_BYTES,
      1_963, RECORD_SHA256),
    sourceEntry(root, "metadata/full-tree-before.json", MAX_METADATA_BYTES,
      913, TREE_SHA256),
    sourceEntry(root, "metadata/full-tree-after.json", MAX_METADATA_BYTES,
      913, TREE_SHA256),
  ];
  for (const specification of FILES) {
    const relative = `files/${specification.path}`;
    const measured = hashRegular(root, relative, MAX_SOURCE_FILE_BYTES,
      specification.bytes);
    if (measured.sha256 !== specification.sha256
      || specification.lfs === null && measured.gitOid !== specification.oid
      || specification.lfs !== null
        && measured.sha256 !== `sha256:${specification.lfs.oid}`) {
      fail("REPOSITORY_FILE_DIGEST_INVALID", specification.path);
    }
    entries.push({ path: relative, bytes: measured.bytes,
      sha256: measured.sha256, oid: specification.oid,
      lfs: specification.lfs });
  }
  const corpus = replayCorpus(
    readRegular(root, "files/episodes.parquet", MAX_SOURCE_FILE_BYTES,
      EPISODE_PARQUET.bytes),
    readRegular(root, "files/labels.parquet", MAX_SOURCE_FILE_BYTES,
      LABEL_PARQUET.bytes));
  const text = replayTextFiles(root);
  return { root, metadata, entries, corpus, text };
}

function sourceManifestBody(collected) {
  const entries = [...collected.entries]
    .sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: SOURCE_SCHEMA, datasetId: HAPTAL_MISALIGNMENT_DATASET_ID,
    revision: HAPTAL_MISALIGNMENT_REVISION,
    fixedTreeFiles: collected.metadata.tree.files,
    fixedTreeBytes: collected.metadata.tree.fileBytes,
    fixedTreeRoot: collected.metadata.tree.treeRoot,
    sourceFiles: entries.length, entries,
    syntheticEpisodes: collected.corpus.census.syntheticEpisodes,
    syntheticTimestepRows: collected.corpus.census.syntheticTimestepRows,
    labelRows: collected.corpus.census.labelRows,
    episodeColumnRoot: collected.corpus.episodes.combinedColumnRoot,
    labelColumnRoot: collected.corpus.labels.combinedColumnRoot,
    episodeSummaryRoot: collected.corpus.census.episodeSummaryRoot,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, entries),
  };
}

export function createHaptalMisalignmentSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectCoreSource(sourceDirectory, []);
  const body = sourceManifestBody(collected);
  return deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

function collectCompleteSource(sourceDirectory) {
  const collected = collectCoreSource(sourceDirectory, ["source-manifest.json"]);
  const body = sourceManifestBody(collected);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const sourceManifestBytes = readRegular(collected.root,
    "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(sourceManifestBytes)) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  if (sourceManifest.sourceManifestHash !== EXPECTED_SOURCE_MANIFEST_HASH) {
    fail("SOURCE_MANIFEST_PIN_INVALID", sourceManifest.sourceManifestHash);
  }
  return { ...collected, sourceManifest, sourceManifestBytes };
}

function reportBodyFromSource(source) {
  const corpus = source.corpus;
  return {
    schema: HAPTAL_MISALIGNMENT_REPORT_SCHEMA,
    disposition: HAPTAL_MISALIGNMENT_DISPOSITION,
    source: {
      datasetId: HAPTAL_MISALIGNMENT_DATASET_ID,
      revision: HAPTAL_MISALIGNMENT_REVISION,
      createdAt: source.metadata.record.createdAt,
      lastModified: source.metadata.record.lastModified,
      public: true, gated: false, disabled: false,
      recordBeforeAfterByteIdentical: true,
      treeBeforeAfterByteIdentical: true,
      recordSha256: RECORD_SHA256, treeSha256: TREE_SHA256,
      fixedTreeFiles: source.metadata.tree.files,
      fixedTreeDirectories: source.metadata.tree.directories,
      fixedTreeBytes: source.metadata.tree.fileBytes,
      fixedTreeLfsFiles: source.metadata.tree.lfsFiles,
      fixedTreeXetFiles: source.metadata.tree.xetFiles,
      fixedTreeRoot: source.metadata.tree.treeRoot,
      recordUsedStorageBytes: source.metadata.record.recordUsedStorageBytes,
      recordUsedStorageIsNotCurrentTreeBytes: true,
      completeFixedRepositoryPayloadAcquired: true,
      sourceManifestHash: source.sourceManifest.sourceManifestHash,
      sourceManifestFileSha256:
        haptalMisalignmentSha256(source.sourceManifestBytes),
      sourceRoot: source.sourceManifest.sourceRoot,
    },
    parquetReplay: {
      episodes: corpus.episodes,
      labels: corpus.labels,
      allPhysicalColumnsDecodedFromCurrentBytes: true,
      allDictionaryAndDataPagesDecoded: true,
      allSnappyBlocksDecoded: true,
      sourceCodeOrParquetEmbeddedCodeExecuted: false,
    },
    sourceNativeCensus: corpus.census,
    documentationAndGeneratorDrift: {
      readmeClaimedEpisodes: source.text.readme.claimedEpisodes,
      generatorConfiguredEpisodes: source.text.generator.configuredSyntheticEpisodes,
      currentSourceNativeSyntheticEpisodes: corpus.census.syntheticEpisodes,
      readmeClaimedTimestepRows: source.text.readme.claimedTimestepRows,
      currentSourceNativeSyntheticTimestepRows: corpus.census.syntheticTimestepRows,
      readmeClaimedTrainEpisodes: source.text.readme.claimedTrainEpisodes,
      currentTrainEpisodes: corpus.census.splitCounts.train,
      readmeClaimedTestEpisodes: source.text.readme.claimedTestEpisodes,
      currentTestEpisodes: corpus.census.splitCounts.test,
      readmeClaimedTrueSuccesses: source.text.readme.claimedTrueSuccesses,
      currentPublisherTrueLabels: corpus.census.publisherOutcomeCounts.true,
      readmeClaimedInjectedFailures: source.text.readme.claimedInjectedFailures,
      currentPublisherFailureLabels: corpus.census.publisherOutcomeCounts.false,
      currentBytesMatchReadmeDenominators: false,
      currentBytesMatchIncludedGeneratorDenominator: false,
      current150EpisodeSelectionCodePresent: false,
      readmeHeadingVersionClaim: source.text.readme.headingVersionClaim,
      readmeCitationVersionClaim: source.text.readme.citationVersionClaim,
      generatorSeriesVersionClaim: source.text.readme.seriesVersionClaim,
      readmeLoadExampleDatasetId: source.text.readme.loadExampleDatasetId,
      readmeLoadExampleMatchesCurrentDatasetId:
        source.text.readme.loadExampleMatchesCurrentDatasetId,
      cardSizeCategoryClaim: source.metadata.record.cardSizeCategoryClaim,
      apiTagSizeCategoryClaim: source.metadata.record.apiTagSizeCategoryClaim,
      gitattributesHistoricalEpisodeShardPatterns:
        source.text.gitattributes.historicalEpisodeShardPatterns,
      historicalEpisodeShardFilesPresentAtFixedRevision:
        source.text.gitattributes.historicalEpisodeShardFilesPresentAtFixedRevision,
      currentBytesSupersedeNarrativeDenominatorsForThisArtifact: true,
    },
    syntheticGenerationBoundary: {
      sourceNativeSyntheticTrajectoryEpisodes: corpus.census.syntheticEpisodes,
      sourceNativeSyntheticTimestepRows: corpus.census.syntheticTimestepRows,
      publisherInjectedLabelRows: corpus.census.labelRows,
      publisherGeneratedLoggedSuccessFlags: corpus.census.labelRows,
      loggedSuccessFlagsObservedFromRobotTelemetry: 0,
      currentRepositoryUpstreamTrajectoryBytes: 0,
      includedGeneratorReadsUpstreamTrajectoryFiles: false,
      publisherRealRobotDataDerivationClaimPresent:
        source.text.readme.publisherRealRobotDataDerivationClaimPresent,
      publisherPhysicsGroundedRangeClaimPresent:
        source.text.readme.publisherPhysicsGroundedRangeClaimPresent,
      upstreamDerivationIndependentlyReproduced: false,
      physicsGroundingIndependentlyEstablished: false,
      allSignalsSynthetic: true,
      syntheticEpisodesArePhysicalExecutions: false,
      syntheticActuallySucceededIsRealWorldOutcome: false,
    },
    benchmarkIntegrity: {
      episodeIdContainsInjectedClassPrefixRows:
        corpus.census.episodeIdPrefixRevealsFailureModeRows,
      episodeIdPrefixPerfectlyRevealsTargetRows:
        corpus.census.episodeIdPrefixPerfectlyRevealsActuallySucceededRows,
      predictionTargetLeakPresent: true,
      labelsHiddenButTargetStillLeakedByEpisodeId: true,
      baselineResultsPublisherClaimsOnly: true,
      baselineExecutedDuringReplay: false,
      baselineResultsIndependentlyReproduced: false,
      scorer: source.text.scorer,
      scorerExecutedDuringReplay: false,
      publisherHarnessOutcomeIsIndependentOutcome: false,
    },
    denominatorRegistry: {
      FIXED_TREE_FILES: source.metadata.tree.files,
      FIXED_TREE_BYTES: source.metadata.tree.fileBytes,
      CURRENT_SYNTHETIC_EPISODES: corpus.census.syntheticEpisodes,
      CURRENT_SYNTHETIC_TIMESTEP_ROWS: corpus.census.syntheticTimestepRows,
      CURRENT_LABEL_ROWS: corpus.census.labelRows,
      README_EPISODE_CLAIM: source.text.readme.claimedEpisodes,
      GENERATOR_CONFIGURED_EPISODES:
        source.text.generator.configuredSyntheticEpisodes,
      publisherClaimsAndCurrentPhysicalRowsMustNotBeMerged: true,
      timestepRowsAreNotAdditionalEpisodes: true,
      labelsAreOneToOneWithCurrentSyntheticEpisodes: true,
    },
    outcomeBoundary: {
      publisherInjectedActuallySucceededLabels: corpus.census.labelRows,
      publisherInjectedTrueLabels: corpus.census.publisherOutcomeCounts.true,
      publisherInjectedFalseLabels: corpus.census.publisherOutcomeCounts.false,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      physicalEffectRows: 0, completePhysicalEpisodeRows: 0,
      robotTelemetrySuccessRows: 0, retryRows: 0, recoveryRows: 0,
      longitudinalRows: 0,
    },
    rightsPrivacyAndUse: {
      rights: {
        datasetCardLicenseClaim: HAPTAL_MISALIGNMENT_LICENSE,
        datasetApiLicenseTagPresent: true,
        repositoryLicenseFilePresent: false,
        readmeUpstreamMitClaimPresent:
          source.text.readme.upstreamMitLicenseClaimPresent,
        upstreamBaseDatasetBytesPresent: false,
        upstreamBaseDatasetRightsIndependentlyVerified: false,
        useSpecificTrainingAuthorizationEstablished: false,
        rightsDisposition: "FAIL_CLOSED", legalConclusionEstablished: false,
        authorizedTrainingRows: 0,
      },
      privacy: {
        rawSourcePrivate: true, noPiiGuaranteed: false,
        readmeContainsNamedContactAndEmail: true,
        rawEpisodeIdsOrSignalRowsProjectedIntoReport: false,
        privateSourceFilesMode: "0600", privateSourceDirectoriesMode: "0700",
      },
      use: {
        quarantineEvaluationOnly: true, offlineTrainingRows: 0,
        productionTrainingRows: 0, networkAdmissionRows: 0,
        authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
      },
    },
    zeroClaimBoundary: {
      physicalSourceEpisodes: 0, robotTelemetrySuccessRows: 0,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      physicalEffectRows: 0, completePhysicalEpisodeRows: 0,
      retryRows: 0, recoveryRows: 0, longitudinalRows: 0,
      delegationRows: 0, authorizedTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      authorityDelta: 0, autonomousActionAuthorized: false,
    },
  };
}

export function buildHaptalMisalignmentReportFromSource(sourceDirectory) {
  const source = collectCompleteSource(sourceDirectory);
  const body = reportBodyFromSource(source);
  return deepFreeze({ ...body, artifactHash: digest(REPORT_DOMAIN, body) });
}

function reportErrors(report) {
  const errors = [];
  if (!exactObject(report) || report.schema !== HAPTAL_MISALIGNMENT_REPORT_SCHEMA) {
    return ["SCHEMA_INVALID"];
  }
  if (report.disposition !== HAPTAL_MISALIGNMENT_DISPOSITION
    || report.source?.datasetId !== HAPTAL_MISALIGNMENT_DATASET_ID
    || report.source?.revision !== HAPTAL_MISALIGNMENT_REVISION
    || report.source?.fixedTreeFiles !== 7
    || report.source?.fixedTreeBytes !== 14_445_458
    || report.sourceNativeCensus?.syntheticEpisodes !== 150
    || report.sourceNativeCensus?.syntheticTimestepRows !== 51_172
    || report.sourceNativeCensus?.labelRows !== 150) {
    errors.push("SOURCE_DENOMINATOR_BOUNDARY");
  }
  if (report.benchmarkIntegrity?.predictionTargetLeakPresent !== true
    || report.documentationAndGeneratorDrift?.currentBytesMatchReadmeDenominators
      !== false
    || report.syntheticGenerationBoundary?.allSignalsSynthetic !== true) {
    errors.push("SYNTHETIC_INTEGRITY_BOUNDARY");
  }
  const zero = report.zeroClaimBoundary;
  if (!exactObject(zero) || Object.entries(zero).some(([key, value]) =>
    key === "autonomousActionAuthorized" ? value !== false : value !== 0)) {
    errors.push("ZERO_CLAIM_BOUNDARY");
  }
  const rights = report.rightsPrivacyAndUse;
  if (rights?.rights?.datasetCardLicenseClaim !== HAPTAL_MISALIGNMENT_LICENSE
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

export function verifyHaptalMisalignmentReport(report) {
  const errors = reportErrors(report);
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function createHaptalMisalignmentReceipt(report, reportBytes,
  manifestBytes) {
  const checked = verifyHaptalMisalignmentReport(report);
  if (!checked.ok) fail("REPORT_INVALID", checked.errors.join(","));
  const body = {
    schema: HAPTAL_MISALIGNMENT_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileBytes: reportBytes.length,
    reportFileSha256: haptalMisalignmentSha256(reportBytes),
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileBytes: manifestBytes.length,
    sourceManifestFileSha256: haptalMisalignmentSha256(manifestBytes),
    disposition: HAPTAL_MISALIGNMENT_DISPOSITION,
    fixedTreeFiles: 7, fixedTreeBytes: 14_445_458,
    syntheticEpisodes: 150, syntheticTimestepRows: 51_172,
    publisherInjectedLabelRows: 150, independentOutcomeRows: 0,
    completePhysicalEpisodeRows: 0, recoveryRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    authorityDelta: 0, receiptWrittenLast: true, noClobber: true,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyHaptalMisalignmentSourceDirectory(sourceDirectory) {
  try {
    const source = collectCompleteSource(sourceDirectory);
    return deepFreeze({ ok: true, metadata: source.metadata,
      sourceManifest: source.sourceManifest,
      verificationLevel: "FULL_FIXED_REPOSITORY_AND_PARQUET_SOURCE_REDERIVED" });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyHaptalMisalignmentArtifactDirectory(directory) {
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
    const report = buildHaptalMisalignmentReportFromSource(
      checkedPath(root, "source"));
    const expectedReportBytes = serialize(report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createHaptalMisalignmentReceipt(report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) {
      fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    }
    return deepFreeze({ ok: true, report, receipt,
      reportFileSha256: haptalMisalignmentSha256(reportBytes),
      receiptFileSha256: haptalMisalignmentSha256(receiptBytes),
      verificationLevel: "FULL_FIXED_REPOSITORY_AND_PARQUET_SOURCE_REDERIVED" });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeHaptalMisalignmentArtifact(value) {
  return serialize(value);
}
