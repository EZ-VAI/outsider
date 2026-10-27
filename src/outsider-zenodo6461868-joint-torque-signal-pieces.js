/*
 * Bounded, byte-pinned intake for Zenodo record 6461868.
 *
 * The publisher defines every CSV row as one 1.024 second, 1 kHz, 1024-sample
 * joint-torque signal piece.  This slice retains the first complete row from
 * each publisher class for joint 1 plus the complete README.  A local torque
 * window and its publisher label are not promoted to a task outcome, recovery,
 * delegation, authority, network contribution, or training authorization.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmSync, rmdirSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const ZENODO_6461868_RECORD_ID = 6_461_868;
export const ZENODO_6461868_DOI = "10.5281/zenodo.6461868";
export const ZENODO_6461868_LICENSE = "CC-BY-4.0";
export const ZENODO_6461868_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const ZENODO_6461868_SOURCE_SCHEMA
  = "outsider/zenodo-6461868-joint-torque-pinned-source/v1";
export const ZENODO_6461868_INVENTORY_SCHEMA
  = "outsider/zenodo-6461868-file-inventory/v1";
export const ZENODO_6461868_REPORT_SCHEMA
  = "outsider/zenodo-6461868-joint-torque-signal-pieces/v1";
export const ZENODO_6461868_RECEIPT_SCHEMA
  = "outsider/zenodo-6461868-joint-torque-run-receipt/v1";

const RECORD_URL = `https://zenodo.org/api/records/${ZENODO_6461868_RECORD_ID}`;
const RECORD_BYTES = 11_867;
const RECORD_SHA256
  = "sha256:d069dddea72f3693f532d0615262b121b14c5045632c856313ffe5e81850ad97";
const RECORD_CREATED = "2022-04-14T21:29:44.914199+00:00";
const RECORD_UPDATED = "2025-04-24T07:24:12.954128+00:00";
const TITLE
  = "The Robot Joint Torque Measurements for Accidental Collisions and Intentional Contacts";
const TOTAL_REMOTE_BYTES = 3_685_671_213;
const FETCH_TIMEOUT_MS = 180_000;
const FETCH_ATTEMPTS = 3;
const RETRYABLE_STATUS = Object.freeze([408, 425, 429, 500, 502, 503, 504]);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MD5 = /^md5:[a-f0-9]{32}$/u;
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

const FILES = Object.freeze([
  ["ReadMe.md", 1_539, "5dd92198-3eb1-4cc3-8b6a-0d3f620589d9",
    "md5:fcc45128324a41449236c464bddeb5d7"],
  ["cls-joint-1.csv", 128_041_914, "e0db9343-1781-4e04-a740-05479597ae31",
    "md5:8e4cbb723f4b25125ef311e7c0564704"],
  ["cls-joint-2.csv", 126_526_851, "d34aeb6f-40e3-4f6a-81f5-95c75a7c90c3",
    "md5:c846659e304a74f3e79eecba59df8966"],
  ["cls-joint-3.csv", 127_912_669, "36761259-9635-44ec-bfd8-b47b57b60fd3",
    "md5:6660098766beded0d96fb0fad964e25c"],
  ["cls-joint-4.csv", 128_588_564, "d376d7ea-0cfc-46b1-a36c-1f00aaab20b5",
    "md5:3e8d9a0f8f3a42e99058b3f14fbe0737"],
  ["cls-joint-5.csv", 129_796_648, "5e49a3c2-99bf-4f2c-890f-5f68c9252868",
    "md5:f09ec7ad382d3216cf5dd704ed07e053"],
  ["cls-joint-6.csv", 128_250_543, "020e41c1-a469-4dc4-847f-161dd3075b79",
    "md5:22990eba1277baf425311f0802c2ad1e"],
  ["cls-joint-7.csv", 129_572_496, "aa383e3f-daeb-420e-9955-9b4bfb9d005e",
    "md5:ed66cc3fef1fd35eb6fb60d171ffde86"],
  ["ctc-joint-1.csv", 137_105_202, "8fff24ff-97d6-42c3-bd1e-cb69ffa4fa34",
    "md5:de187b890a64de09adbbda53f8dbdfc0"],
  ["ctc-joint-2.csv", 135_230_652, "5656c8e7-1742-4a7a-92a2-b95963552b59",
    "md5:88461a691f3b2eb1e070abe54632afc4"],
  ["ctc-joint-3.csv", 137_127_545, "b5ae5e86-cecb-4084-a7d7-4be1f87c8f51",
    "md5:0bfbfdd354118e2f4d67f55165f8b388"],
  ["ctc-joint-4.csv", 137_042_156, "a4accc86-b87c-4e5f-a830-21080e609b8c",
    "md5:46be1b372a525cc29c12ad7f47967464"],
  ["ctc-joint-5.csv", 139_676_793, "f794dbba-8b78-4c03-a257-133a7e2a2f37",
    "md5:29bab2812f9e1b19f69c0cca1e97dc42"],
  ["ctc-joint-6.csv", 137_970_835, "386cf0f4-d618-4948-8fe6-0add67d96943",
    "md5:68514cfe22569b4cce9e93d9162ec154"],
  ["ctc-joint-7.csv", 140_449_887, "1a21b30d-f305-4d6a-ae59-4d697c4f5d7c",
    "md5:064b481dc2f17252685a555fdf375537"],
  ["fre-joint-1.csv", 260_695_040, "d78e5c87-595d-49da-83ae-23deaa593479",
    "md5:9387508c41a47e002cf013628e866d61"],
  ["fre-joint-2.csv", 256_618_433, "31130469-60e1-46ba-a482-5884622c91dd",
    "md5:af39fe87936c37e7eeaaa9377ab13c65"],
  ["fre-joint-3.csv", 258_733_365, "f09b5752-fd96-4d42-9b86-51f62948bd1c",
    "md5:98646bc975124079484c7bcfd29a564a"],
  ["fre-joint-4.csv", 260_786_304, "9bffa5bf-22d3-4894-84f2-0c13efd9f906",
    "md5:5823edefdbb581a032a17865b895e252"],
  ["fre-joint-5.csv", 263_386_710, "dad71581-1611-47f2-951c-28fb3f439703",
    "md5:623bf162a341fdada5931954eaac8ad7"],
  ["fre-joint-6.csv", 260_082_453, "4e193b68-2e90-45d9-af5d-c88c90d49577",
    "md5:2778da9a92af34795d92dfd11a8b0f9e"],
  ["fre-joint-7.csv", 262_074_614, "e7e0b533-917c-4723-836c-02a6e55b2943",
    "md5:0634d3386bc9a2b36fab8e76a8d693a1"],
].map(([key, sizeBytes, id, publisherMd5Claim]) => Object.freeze({
  key, sizeBytes, id, publisherMd5Claim,
  contentUrl: `${RECORD_URL}/files/${key}/content`,
})));

const ROWS = Object.freeze([
  Object.freeze({
    classCode: "cls", publisherClassLabel: "ACCIDENTAL_COLLISION",
    fileKey: "cls-joint-1.csv", localPath: "raw/cls-joint-1-row0.csv",
    rangeStart: 0, rangeEnd: 18_341, bytes: 18_342,
    sha256: "sha256:5ec7041050e6181721f0389d9c208388ba906638b5213c4a4fa0bd6381bdab47",
    first: 0.231078769555404, last: 0.426174249043777,
    minimum: 0.000198808023617381, maximum: 0.670690779099152,
    mean: 0.2570083337150524, rms: 0.2727599251241747,
    publisherEventTimeSeconds: 0.256,
  }),
  Object.freeze({
    classCode: "ctc", publisherClassLabel: "INTENTIONAL_CONTACT",
    fileKey: "ctc-joint-1.csv", localPath: "raw/ctc-joint-1-row0.csv",
    rangeStart: 0, rangeEnd: 17_792, bytes: 17_793,
    sha256: "sha256:c722e349dbf31a04028ea29cb80aafcbfb0ea1ab74ef79179d2a10b9733c8720",
    first: 0.251829500785186, last: 0.274817962655709,
    minimum: 0.00392055093319643, maximum: 6.98897070110767,
    mean: 2.249084185543732, rms: 3.1078529048521766,
    publisherEventTimeSeconds: 0.256,
  }),
  Object.freeze({
    classCode: "fre", publisherClassLabel: "CONTACT_FREE",
    fileKey: "fre-joint-1.csv", localPath: "raw/fre-joint-1-row0.csv",
    rangeStart: 0, rangeEnd: 18_304, bytes: 18_305,
    sha256: "sha256:158beba455c0a04524dd103fd6e4517dfaa29a6b87a8c20cf43a0bfb221e4b80",
    first: 0.453866000762298, last: 0.760756667247131,
    minimum: 0.0705574262049936, maximum: 0.964165266146972,
    mean: 0.5736444548623126, rms: 0.5933064874502775,
    publisherEventTimeSeconds: null,
  }),
]);

const README = Object.freeze({
  key: "ReadMe.md", localPath: "raw/ReadMe.md", bytes: 1_539,
  sha256: "sha256:6d382b37dffb1e4038c017242b566819ae8db665599f73964b04eb77f664fae5",
  md5: "md5:fcc45128324a41449236c464bddeb5d7",
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `ZENODO_6461868_${code}`
    : `ZENODO_6461868_${code}:${detail}`);
}

export function zenodo6461868Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function md5(bytes) {
  return `md5:${createHash("md5").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return zenodo6461868Sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function exactKeys(value, keys) {
  return exactObject(value) && same(sorted(Object.keys(value)), sorted(keys));
}

function safeJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function strictUtf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.startsWith("ZENODO_6461868_")) return "UNEXPECTED_ERROR";
  return message.slice("ZENODO_6461868_".length).split(":", 1)[0];
}

function checkedZenodoUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "zenodo.org"
    || url.username !== "" || url.password !== "") fail("URL_INVALID", value);
  return url;
}

function fileProjection(file) {
  return { key: file.key, sizeBytes: file.sizeBytes, id: file.id,
    publisherMd5Claim: file.publisherMd5Claim, contentUrl: file.contentUrl };
}

function recordProjection(record) {
  if (record?.id !== ZENODO_6461868_RECORD_ID || record?.conceptrecid !== "6461867"
    || record?.doi !== ZENODO_6461868_DOI || record?.revision !== 6
    || record?.created !== RECORD_CREATED || record?.updated !== RECORD_UPDATED
    || record?.status !== "published" || record?.metadata?.title !== TITLE
    || record?.metadata?.publication_date !== "2022-04-14"
    || Object.hasOwn(record?.metadata ?? {}, "version")
    || record?.metadata?.access_right !== "open"
    || record?.metadata?.license?.id !== "cc-by-4.0"
    || record?.metadata?.resource_type?.type !== "dataset"
    || !Array.isArray(record?.files) || record.files.length !== FILES.length) {
    fail("RECORD_PROFILE_CHANGED");
  }
  const description = String(record.metadata.description ?? "");
  for (const phrase of ["KUKA LWR4+", "accidental collision (cls)",
    "intentional manual contacts (ctc)", "free from contacts (fre)",
    "1.024s", "sampling rate 1kHz", "unit of the signal measurement is Nm",
    "M = 1024", "N = 6960", "N = 7583", "N = 14098"]) {
    if (!description.includes(phrase)) fail("RECORD_DESCRIPTION_CHANGED", phrase);
  }
  const remote = record.files.map((file) => ({ key: file.key, sizeBytes: file.size,
    id: file.id, publisherMd5Claim: file.checksum, contentUrl: file.links?.self }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const expected = FILES.map(fileProjection)
    .sort((left, right) => left.key.localeCompare(right.key));
  if (!same(remote, expected)) fail("RECORD_FILE_INVENTORY_CHANGED");
  return Object.freeze({ recordId: ZENODO_6461868_RECORD_ID,
    conceptRecordId: 6_461_867, doi: ZENODO_6461868_DOI, title: TITLE,
    publicationDate: "2022-04-14", created: RECORD_CREATED, updated: RECORD_UPDATED,
    revision: 6, datasetVersion: null, accessRight: "open",
    licenseClaim: ZENODO_6461868_LICENSE, files: remote });
}

function buildInventory(record) {
  const files = record.files;
  const classRows = { cls: 6_960, ctc: 7_583, fre: 14_098 };
  const classFiles = Object.fromEntries(["cls", "ctc", "fre"].map((classCode) => {
    const selected = files.filter((file) => file.key.startsWith(`${classCode}-`));
    return [classCode, { csvFiles: selected.length,
      remoteBytes: selected.reduce((sum, file) => sum + file.sizeBytes, 0),
      publisherRowsPerJointFile: classRows[classCode] }];
  }));
  const body = {
    schema: ZENODO_6461868_INVENTORY_SCHEMA,
    recordId: ZENODO_6461868_RECORD_ID,
    revision: 6,
    counts: { remoteObjects: files.length, csvFiles: 21, readmeFiles: 1,
      jointIdentifiers: 7, publisherClasses: 3, totalRemoteBytes: TOTAL_REMOTE_BYTES },
    classFiles,
    files,
    denominatorCaveat: {
      rowsAreSignalPiecesWithinEachJointFile: true,
      crossJointRowAlignmentVerifiedFromReleasedBytes: false,
      uniquePhysicalTrialCountAcrossJointFiles: null,
      jointIdentifiersAreNotAdditionalSignalPieces: true,
      multiplicationBySevenProhibited: true,
    },
  };
  if (!same(classFiles, {
    cls: { csvFiles: 7, remoteBytes: 898_689_685, publisherRowsPerJointFile: 6_960 },
    ctc: { csvFiles: 7, remoteBytes: 964_603_070, publisherRowsPerJointFile: 7_583 },
    fre: { csvFiles: 7, remoteBytes: 1_822_376_919,
      publisherRowsPerJointFile: 14_098 },
  }) || files.reduce((sum, file) => sum + file.sizeBytes, 0) !== TOTAL_REMOTE_BYTES) {
    fail("INVENTORY_COUNTS_CHANGED");
  }
  return Object.freeze({ ...body,
    inventoryHash: digest(`${ZENODO_6461868_INVENTORY_SCHEMA}/inventory`, body) });
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function streamResponse(response, expectedBytes) {
  if (!response.body) fail("FETCH_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) !== expectedBytes)) fail("FETCH_CONTENT_LENGTH_INVALID", declared);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > expectedBytes) {
      await reader.cancel();
      fail("FETCH_STREAM_SIZE_INVALID");
    }
    chunks.push(Buffer.from(value));
  }
  if (total !== expectedBytes) fail("FETCH_BODY_SIZE_INVALID", String(total));
  return Buffer.concat(chunks, total);
}

async function retry(operation) {
  let last = null;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) {
      const message = String(error?.message ?? error);
      if (message.startsWith("ZENODO_6461868_") && !message.includes("TRANSIENT")) {
        throw error;
      }
      last = error;
      if (attempt === FETCH_ATTEMPTS - 1) break;
      await pause(attempt === 0 ? 1_000 : 4_000);
    }
  }
  fail("FETCH_RETRIES_EXHAUSTED", String(last?.message ?? last));
}

async function fetchRecord(fetchImpl) {
  const url = checkedZenodoUrl(RECORD_URL);
  return retry(async (attempt) => {
    let response;
    try {
      response = await fetchImpl(url, { redirect: "error",
        headers: { accept: "application/json", "accept-encoding": "identity",
          "user-agent": "outsider-zenodo6461868-joint-torque/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) { throw new Error(`TRANSIENT:${String(error?.message ?? error)}`); }
    if (RETRYABLE_STATUS.includes(response.status)) {
      if (response.body) await response.body.cancel();
      throw new Error(`TRANSIENT:HTTP_${response.status}:ATTEMPT_${attempt}`);
    }
    if (response.status !== 200 || response.headers.get("content-encoding") !== null
      || new URL(response.url || url).origin !== url.origin) {
      fail("RECORD_HTTP_INVALID", String(response.status));
    }
    const bytes = await streamResponse(response, RECORD_BYTES);
    if (zenodo6461868Sha256(bytes) !== RECORD_SHA256) fail("RECORD_BYTES_CHANGED");
    return { bytes, value: safeJson(bytes, "RECORD_JSON_INVALID") };
  });
}

async function fetchWholeFile(file, fetchImpl) {
  const url = checkedZenodoUrl(file.contentUrl);
  return retry(async (attempt) => {
    let response;
    try {
      response = await fetchImpl(url, { redirect: "error",
        headers: { "accept-encoding": "identity",
          "user-agent": "outsider-zenodo6461868-joint-torque/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) { throw new Error(`TRANSIENT:${String(error?.message ?? error)}`); }
    if (RETRYABLE_STATUS.includes(response.status)) {
      if (response.body) await response.body.cancel();
      throw new Error(`TRANSIENT:HTTP_${response.status}:ATTEMPT_${attempt}`);
    }
    if (response.status !== 200 || response.headers.get("content-encoding") !== null
      || new URL(response.url || url).origin !== url.origin) {
      fail("WHOLE_FILE_HTTP_INVALID", `${file.key}:${response.status}`);
    }
    return streamResponse(response, file.sizeBytes);
  });
}

async function fetchRange(row, file, fetchImpl) {
  const url = checkedZenodoUrl(file.contentUrl);
  return retry(async (attempt) => {
    let response;
    try {
      response = await fetchImpl(url, { redirect: "error",
        headers: { range: `bytes=${row.rangeStart}-${row.rangeEnd}`,
          "accept-encoding": "identity",
          "user-agent": "outsider-zenodo6461868-joint-torque/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) { throw new Error(`TRANSIENT:${String(error?.message ?? error)}`); }
    if (RETRYABLE_STATUS.includes(response.status)) {
      if (response.body) await response.body.cancel();
      throw new Error(`TRANSIENT:HTTP_${response.status}:ATTEMPT_${attempt}`);
    }
    const contentRange = `bytes ${row.rangeStart}-${row.rangeEnd}/${file.sizeBytes}`;
    if (response.status !== 206 || response.headers.get("content-range") !== contentRange
      || response.headers.get("content-encoding") !== null
      || new URL(response.url || url).origin !== url.origin) {
      fail("STRICT_RANGE_UNSUPPORTED", `${file.key}:${response.status}`);
    }
    const bytes = await streamResponse(response, row.bytes);
    return Object.freeze({ bytes, contentRange, start: row.rangeStart, end: row.rangeEnd,
      sizeBytes: row.bytes, sha256: zenodo6461868Sha256(bytes) });
  });
}

function parseReadme(bytes) {
  if (bytes.length !== README.bytes || zenodo6461868Sha256(bytes) !== README.sha256
    || md5(bytes) !== README.md5) fail("README_BYTES_CHANGED");
  const text = strictUtf8(bytes, "README_UTF8_INVALID");
  for (const phrase of ["accidental collisions", "intentional contacts", "contact free",
    "external torques measured by the robot joint torque sensors", "**M** = 1024",
    "1.024s with sampling rate 1kHz", "**N** = 6960", "**N** = 7583",
    "**N** = 14098",
    "header=None"]) {
    if (!text.includes(phrase)) fail("README_SEMANTICS_CHANGED", phrase);
  }
  return Object.freeze({ bytes: bytes.length, sha256: zenodo6461868Sha256(bytes),
    md5: md5(bytes), delimiter: ",", headerPresent: false, samplesPerPiece: 1_024,
    durationSeconds: 1.024, sampleRateHz: 1_000,
    measuredQuantityPublisherClaim: "EXTERNAL_JOINT_TORQUE",
    signalUnitPublisherClaim: "Nm",
    classRowsPerJointFile: { cls: 6_960, ctc: 7_583, fre: 14_098 } });
}

function kahan(values, transform = (value) => value) {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = transform(value) - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}

function parseRow(bytes, specification) {
  if (bytes.length !== specification.bytes
    || zenodo6461868Sha256(bytes) !== specification.sha256
    || bytes.at(-2) !== 0x0d || bytes.at(-1) !== 0x0a
    || bytes.subarray(0, -2).includes(0x0a) || bytes.subarray(0, -2).includes(0x0d)) {
    fail("ROW_BYTES_CHANGED", specification.classCode);
  }
  const text = strictUtf8(bytes.subarray(0, -2), "ROW_UTF8_INVALID");
  const cells = text.split(",");
  if (cells.length !== 1_024 || cells.some((cell) => !DECIMAL.test(cell))) {
    fail("ROW_CSV_SHAPE_CHANGED", specification.classCode);
  }
  const values = cells.map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    fail("ROW_NONFINITE", specification.classCode);
  }
  const sum = kahan(values);
  const sumSquares = kahan(values, (value) => value * value);
  const summary = {
    classCode: specification.classCode,
    publisherClassLabel: specification.publisherClassLabel,
    jointIdentifier: 1,
    sourceFile: specification.fileKey,
    sourceRowZeroBased: 0,
    sourceRange: { start: specification.rangeStart, end: specification.rangeEnd,
      sizeBytes: specification.bytes, sha256: specification.sha256 },
    samples: values.length,
    durationSeconds: 1.024,
    sampleRateHz: 1_000,
    signalUnitPublisherClaim: "Nm",
    first: values[0], last: values.at(-1),
    minimum: Math.min(...values), maximum: Math.max(...values),
    mean: sum / values.length,
    rootMeanSquare: Math.sqrt(sumSquares / values.length),
    negativeSamples: values.filter((value) => value < 0).length,
    zeroSamples: values.filter((value) => value === 0).length,
    publisherEventTimeSeconds: specification.publisherEventTimeSeconds,
    publisherLabelIndependentGroundTruth: false,
  };
  const expected = { first: specification.first, last: specification.last,
    minimum: specification.minimum, maximum: specification.maximum,
    mean: specification.mean, rootMeanSquare: specification.rms };
  if (!same({ first: summary.first, last: summary.last, minimum: summary.minimum,
    maximum: summary.maximum, mean: summary.mean,
    rootMeanSquare: summary.rootMeanSquare }, expected)
    || summary.negativeSamples !== 0 || summary.zeroSamples !== 0) {
    fail("ROW_NUMERIC_PROFILE_CHANGED", specification.classCode);
  }
  return Object.freeze(summary);
}

function privateWrite(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function binding(pathname, bytes) {
  return { path: pathname, sizeBytes: bytes.length, sha256: zenodo6461868Sha256(bytes) };
}

function sourceRootFromBindings(bindings) {
  return digest(`${ZENODO_6461868_SOURCE_SCHEMA}/source-root`,
    [...bindings].sort((left, right) => left.path.localeCompare(right.path)));
}

export async function acquirePinnedZenodo6461868Source(outputDirectory, {
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
} = {}) {
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_INVALID");
  const root = path.resolve(outputDirectory);
  if (existsSync(root)) fail("SOURCE_TARGET_EXISTS", root);
  onProgress({ phase: "RECORD_BEFORE" });
  const before = await fetchRecord(fetchImpl);
  const record = recordProjection(before.value);
  onProgress({ phase: "FULL_README" });
  const readmeFile = FILES.find((file) => file.key === README.key);
  const readmeBytes = await fetchWholeFile(readmeFile, fetchImpl);
  parseReadme(readmeBytes);
  const selected = [];
  for (const row of ROWS) {
    onProgress({ phase: "SOURCE_NATIVE_ROW_RANGE", classCode: row.classCode });
    const file = FILES.find((value) => value.key === row.fileKey);
    const range = await fetchRange(row, file, fetchImpl);
    if (range.sha256 !== row.sha256) fail("ROW_RANGE_CHANGED", row.classCode);
    parseRow(range.bytes, row);
    selected.push({ row, file, range });
  }
  onProgress({ phase: "RECORD_AFTER" });
  const after = await fetchRecord(fetchImpl);
  if (!before.bytes.equals(after.bytes)
    || !same(record, recordProjection(after.value))) fail("RECORD_BRACKET_CHANGED");
  const inventory = buildInventory(record);
  const inventoryBytes = canonicalBytes(inventory);
  mkdirPrivate(root);
  mkdirPrivate(path.join(root, "raw"));
  mkdirPrivate(path.join(root, "source-support"));
  try {
    privateWrite(path.join(root, "source-support", "record-before.json"), before.bytes);
    privateWrite(path.join(root, "source-support", "record-after.json"), after.bytes);
    privateWrite(path.join(root, "file-inventory.json"), inventoryBytes);
    privateWrite(path.join(root, README.localPath), readmeBytes);
    for (const value of selected) privateWrite(path.join(root, value.row.localPath),
      value.range.bytes);
    const bytesByPath = new Map([
      ["file-inventory.json", inventoryBytes],
      ["source-support/record-before.json", before.bytes],
      ["source-support/record-after.json", after.bytes],
      [README.localPath, readmeBytes],
      ...selected.map((value) => [value.row.localPath, value.range.bytes]),
    ]);
    const bindings = [...bytesByPath].map(([pathname, bytes]) => binding(pathname, bytes))
      .sort((left, right) => left.path.localeCompare(right.path));
    const sourceRoot = sourceRootFromBindings(bindings);
    const body = {
      schema: ZENODO_6461868_SOURCE_SCHEMA,
      acquiredAt: ZENODO_6461868_FROZEN_AT,
      record,
      recordBracket: { before: binding("source-support/record-before.json", before.bytes),
        after: binding("source-support/record-after.json", after.bytes),
        exactBytesStable: true },
      inventory: { path: "file-inventory.json", inventoryHash: inventory.inventoryHash,
        completeOfficialFileInventory: true, remoteObjects: FILES.length,
        totalRemoteBytes: TOTAL_REMOTE_BYTES },
      readme: { sourceFile: README.key, localPath: README.localPath,
        wholeFileDownloaded: true, wholeFileMd5Verified: true,
        binding: binding(README.localPath, readmeBytes) },
      selection: {
        policy: "FIRST_COMPLETE_CRLF_TERMINATED_SOURCE_NATIVE_ROW_PER_CLASS_FOR_JOINT_1",
        jointIdentifier: 1,
        classCodes: ["cls", "ctc", "fre"],
        selectedRows: selected.map(({ row, file, range }) => ({
          classCode: row.classCode, publisherClassLabel: row.publisherClassLabel,
          sourceFile: file.key, sourceFileSizeBytes: file.sizeBytes,
          sourceWholeFilePublisherMd5Claim: file.publisherMd5Claim,
          sourceWholeFileMd5Verified: false, localPath: row.localPath,
          range: { start: range.start, end: range.end,
            contentRange: range.contentRange, sizeBytes: range.sizeBytes,
            sha256: range.sha256 }, sourceRowZeroBased: 0,
          completeSourceNativeSignalPiece: true })),
        fullCsvFilesDownloaded: false,
        selectedSignalPieces: 3,
        selectedTorqueSamples: 3_072,
      },
      bindings,
      sourceRoot,
    };
    const manifest = Object.freeze({ ...body,
      manifestHash: digest(`${ZENODO_6461868_SOURCE_SCHEMA}/manifest`, body) });
    privateWrite(path.join(root, "acquisition-manifest.json"), canonicalBytes(manifest));
    return verifyZenodo6461868SourceDirectory(root);
  } catch (error) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function requirePrivateDirectory(directory, names, snapshots) {
  const before = lstatSync(directory, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(directory)), sorted(names))) fail("SOURCE_DIRECTORY_INVALID");
  const after = lstatSync(directory, { bigint: true });
  if (!sameStat(before, after)) fail("SOURCE_DIRECTORY_CHANGED");
  snapshots.push({ path: directory, stat: after });
}

function readPrivateStable(root, relativePath, snapshots, maximumBytes) {
  const file = path.join(root, ...relativePath.split("/"));
  const before = lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || Number(before.mode & 0o777n) !== 0o600
    || before.size < 1n || before.size > BigInt(maximumBytes)) fail("SOURCE_FILE_INVALID");
  const descriptor = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameStat(before, opened)) fail("SOURCE_FILE_CHANGED");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(file, { bigint: true });
    if (!sameStat(opened, after) || !sameStat(opened, finalPath)) fail("SOURCE_FILE_CHANGED");
    snapshots.push({ path: file, stat: finalPath });
    return bytes;
  } finally { closeSync(descriptor); }
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    if (!sameStat(snapshot.stat, lstatSync(snapshot.path, { bigint: true }))) {
      fail("SOURCE_CHANGED_DURING_REPLAY");
    }
  }
}

export function verifyZenodo6461868SourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const snapshots = [];
  requirePrivateDirectory(root,
    ["acquisition-manifest.json", "file-inventory.json", "raw", "source-support"],
    snapshots);
  requirePrivateDirectory(path.join(root, "raw"),
    ["ReadMe.md", "cls-joint-1-row0.csv", "ctc-joint-1-row0.csv",
      "fre-joint-1-row0.csv"], snapshots);
  requirePrivateDirectory(path.join(root, "source-support"),
    ["record-after.json", "record-before.json"], snapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", snapshots,
    2 * 1024 * 1024);
  const inventoryBytes = readPrivateStable(root, "file-inventory.json", snapshots,
    2 * 1024 * 1024);
  const beforeBytes = readPrivateStable(root, "source-support/record-before.json", snapshots,
    RECORD_BYTES);
  const afterBytes = readPrivateStable(root, "source-support/record-after.json", snapshots,
    RECORD_BYTES);
  const readmeBytes = readPrivateStable(root, README.localPath, snapshots, README.bytes);
  const rowBytes = new Map(ROWS.map((row) => [row.classCode,
    readPrivateStable(root, row.localPath, snapshots, row.bytes)]));
  const manifest = safeJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID");
  const inventory = safeJson(inventoryBytes, "SOURCE_INVENTORY_JSON_INVALID");
  if (!manifestBytes.equals(canonicalBytes(manifest))
    || !inventoryBytes.equals(canonicalBytes(inventory))) fail("SOURCE_JSON_NOT_CANONICAL");
  if (!beforeBytes.equals(afterBytes) || beforeBytes.length !== RECORD_BYTES
    || zenodo6461868Sha256(beforeBytes) !== RECORD_SHA256) fail("SOURCE_RECORD_BRACKET_INVALID");
  const record = recordProjection(safeJson(beforeBytes, "SOURCE_RECORD_JSON_INVALID"));
  if (!same(record, recordProjection(safeJson(afterBytes, "SOURCE_RECORD_JSON_INVALID")))) {
    fail("SOURCE_RECORD_PROJECTION_CHANGED");
  }
  const rebuiltInventory = buildInventory(record);
  if (!same(inventory, rebuiltInventory)) fail("SOURCE_INVENTORY_REBUILD_MISMATCH");
  const readme = parseReadme(readmeBytes);
  const rows = ROWS.map((row) => parseRow(rowBytes.get(row.classCode), row));
  const bytesByPath = new Map([
    ["file-inventory.json", inventoryBytes],
    ["source-support/record-before.json", beforeBytes],
    ["source-support/record-after.json", afterBytes],
    [README.localPath, readmeBytes],
    ...ROWS.map((row) => [row.localPath, rowBytes.get(row.classCode)]),
  ]);
  const bindings = [...bytesByPath].map(([pathname, bytes]) => binding(pathname, bytes))
    .sort((left, right) => left.path.localeCompare(right.path));
  const sourceRoot = sourceRootFromBindings(bindings);
  const expectedRows = ROWS.map((row) => {
    const file = FILES.find((value) => value.key === row.fileKey);
    return { classCode: row.classCode, publisherClassLabel: row.publisherClassLabel,
      sourceFile: file.key, sourceFileSizeBytes: file.sizeBytes,
      sourceWholeFilePublisherMd5Claim: file.publisherMd5Claim,
      sourceWholeFileMd5Verified: false, localPath: row.localPath,
      range: { start: row.rangeStart, end: row.rangeEnd,
        contentRange: `bytes ${row.rangeStart}-${row.rangeEnd}/${file.sizeBytes}`,
        sizeBytes: row.bytes, sha256: row.sha256 }, sourceRowZeroBased: 0,
      completeSourceNativeSignalPiece: true };
  });
  const expectedSelection = {
    policy: "FIRST_COMPLETE_CRLF_TERMINATED_SOURCE_NATIVE_ROW_PER_CLASS_FOR_JOINT_1",
    jointIdentifier: 1, classCodes: ["cls", "ctc", "fre"],
    selectedRows: expectedRows, fullCsvFilesDownloaded: false,
    selectedSignalPieces: 3, selectedTorqueSamples: 3_072,
  };
  const { manifestHash, ...manifestBody } = manifest;
  if (!exactKeys(manifest, ["schema", "acquiredAt", "record", "recordBracket",
    "inventory", "readme", "selection", "bindings", "sourceRoot", "manifestHash"])
    || manifest.schema !== ZENODO_6461868_SOURCE_SCHEMA
    || manifest.acquiredAt !== ZENODO_6461868_FROZEN_AT
    || !same(manifest.record, record) || !same(manifest.bindings, bindings)
    || manifest.sourceRoot !== sourceRoot
    || manifestHash !== digest(`${ZENODO_6461868_SOURCE_SCHEMA}/manifest`, manifestBody)
    || !same(manifest.recordBracket, {
      before: binding("source-support/record-before.json", beforeBytes),
      after: binding("source-support/record-after.json", afterBytes), exactBytesStable: true })
    || !same(manifest.inventory, { path: "file-inventory.json",
      inventoryHash: inventory.inventoryHash, completeOfficialFileInventory: true,
      remoteObjects: 22, totalRemoteBytes: TOTAL_REMOTE_BYTES })
    || !same(manifest.readme, { sourceFile: README.key, localPath: README.localPath,
      wholeFileDownloaded: true, wholeFileMd5Verified: true,
      binding: binding(README.localPath, readmeBytes) })
    || !same(manifest.selection, expectedSelection)) fail("SOURCE_MANIFEST_INVALID");
  recheckSnapshots(snapshots);
  return Object.freeze({ ok: true, sourceDirectory: root,
    verificationLevel: "FULL_SELECTED_SOURCE_BYTE_REPLAY",
    manifest, manifestFileSha256: zenodo6461868Sha256(manifestBytes),
    inventory, sourceRoot, readme, rows,
    selectedRawBytes: README.bytes + ROWS.reduce((sum, row) => sum + row.bytes, 0) });
}

function sourceIdentity() {
  return { recordId: ZENODO_6461868_RECORD_ID, doi: ZENODO_6461868_DOI,
    title: TITLE, publicationDate: "2022-04-14", revision: 6,
    recordUpdated: RECORD_UPDATED, datasetVersion: null, accessRight: "open",
    zenodoLicenseClaim: ZENODO_6461868_LICENSE,
    officialRemoteObjects: 22, officialRemoteBytes: TOTAL_REMOTE_BYTES };
}

function denominatorRegistry() {
  return {
    populations: [
      { denominatorClass: "JOINT_TORQUE_SIGNAL_PIECE", units: 3,
        classPartitions: [
          { publisherClassLabel: "ACCIDENTAL_COLLISION", units: 1 },
          { publisherClassLabel: "INTENTIONAL_CONTACT", units: 1 },
          { publisherClassLabel: "CONTACT_FREE", units: 1 },
        ] },
      { denominatorClass: "TORQUE_SAMPLE_WITHIN_SELECTED_SIGNAL_PIECES", units: 3_072,
        additiveWithSignalPieces: false },
    ],
    selectedJointIdentifiers: [1],
    jointIdentifiersAreNotAdditionalSignalPieces: true,
    multiplicationByJointCountProhibited: true,
    crossJointUniquePhysicalTrialCount: null,
    crossDomainTotal: null,
    crossDomainAdditionProhibited: true,
  };
}

function zeroBoundary() {
  return { independentCollisionTruthRecords: 0, independentTaskEffectRecords: 0,
    independentTaskOutcomeRecords: 0, recoveryRecords: 0, delegationRecords: 0,
    authorityRecords: 0, longitudinalTaskOutcomeRecords: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkContributionRecords: 0, CEURecords: 0, authorityDelta: 0 };
}

export function buildZenodo6461868JointTorqueSignalPiecesFromSource(sourceDirectory) {
  const source = verifyZenodo6461868SourceDirectory(sourceDirectory);
  const body = {
    schema: ZENODO_6461868_REPORT_SCHEMA,
    generatedAt: ZENODO_6461868_FROZEN_AT,
    sourceIdentity: sourceIdentity(),
    declaredScope: {
      explicitCandidateUniverse: "ZENODO_RECORD_6461868_OFFICIAL_FILE_INVENTORY",
      completeOfficialFileInventoryReplayed: true,
      remoteObjects: 22,
      selectedJointIdentifiers: [1],
      selectedPublisherClasses: ["cls", "ctc", "fre"],
      selectedRowsPerClass: 1,
      fullCsvPayloadsExhausted: false,
      globalExhaustion: false,
    },
    selection: {
      policy: source.manifest.selection.policy,
      selectedSourceNativeSignalPieces: 3,
      selectedTorqueSamples: 3_072,
      completeRows: true,
      fullCsvFilesDownloaded: false,
      selectedBytesIncludingReadme: source.selectedRawBytes,
      selectionIsRepresentativeSampleClaim: false,
      selectionIsClassBalanceClaim: false,
    },
    publisherDatasetSchema: {
      robot: "KUKA_LWR4_PLUS",
      measuredQuantityClaim: source.readme.measuredQuantityPublisherClaim,
      unitClaim: source.readme.signalUnitPublisherClaim,
      samplesPerSignalPiece: source.readme.samplesPerPiece,
      durationSeconds: source.readme.durationSeconds,
      sampleRateHz: source.readme.sampleRateHz,
      classRowsPerJointFile: source.readme.classRowsPerJointFile,
      jointIdentifiers: [1, 2, 3, 4, 5, 6, 7],
      crossJointRowAlignmentVerifiedFromSelectedBytes: false,
      uniquePhysicalTrialCountAcrossJointFiles: null,
    },
    population: { selectedJointTorqueSignalPieces: 3,
      selectedTorqueSamplesWithinPieces: 3_072,
      selectedJointIdentifiers: 1,
      selectedPublisherClassPartitions: 3 },
    denominatorRegistry: denominatorRegistry(),
    mechanicalEvidence: {
      signalPieces: source.rows,
      publisherClassLabels: [
        { classCode: "cls", label: "ACCIDENTAL_COLLISION", selectedPieces: 1 },
        { classCode: "ctc", label: "INTENTIONAL_CONTACT", selectedPieces: 1 },
        { classCode: "fre", label: "CONTACT_FREE", selectedPieces: 1 },
      ],
      labelsArePublisherClaims: true,
      labelsIndependentlyVerified: false,
      localJointTorqueTelemetryPresent: true,
      fullRobotStatePresent: false,
      externalForceTorqueSensorPresent: false,
      taskSemanticsPresent: false,
      taskOutcomeSemanticsPresent: false,
      recoverySequencePresent: false,
      evidenceClass: "LOCAL_JOINT_TORQUE_COLLISION_CONTACT_CLASSIFICATION_WINDOW",
    },
    segmentCoverageAttribution: {
      mechanicalObservation: { jointTorqueSignalPieces: 3, torqueSamples: 3_072 },
      opportunityCensus: { prospectiveOpportunityRecords: 0 },
      delegationAuthorization: { delegationRecords: 0, authorityRecords: 0 },
      effect: { independentTaskEffectRecords: 0 },
      outcome: { independentTaskOutcomeRecords: 0 },
      recovery: { recoveryRecords: 0 },
      longitudinal: { longitudinalTaskOutcomeRecords: 0 },
      segmentsAreNotAdditive: true,
    },
    rightsPrivacyRevisionAndUse: {
      rights: { officialZenodoLicenseClaim: ZENODO_6461868_LICENSE,
        readmeResearchAccessStatementPresent: true, legalConclusion: false },
      privacy: { selectedCsvRowsNumericOnly: true,
        humanSubjectPrivacyClearanceEstablished: false,
        publicRedistributionCleared: false },
      revision: { zenodoRevision: 6, datasetVersion: null,
        recordBeforeAfterExactBytesStable: true },
      use: { offlineMechanicalEvaluationOnly: true, modelFittingPerformed: false,
        productionTrainingAuthorized: false, authorizedTrainingRows: 0 },
    },
    modelAndTrainingBoundary: { offlineModelFittingPerformed: false,
      authorizedTraining: false, authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0, authorizedTrainingPerformed: false },
    authorityAndNetworkBoundary: { delegationRecords: 0, authorityRecords: 0,
      authorityDelta: 0, networkContributionRecords: 0, CEURecords: 0 },
    zeroClaimBoundary: zeroBoundary(),
    sourceReplay: {
      verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      sourceManifestHash: source.manifest.manifestHash,
      sourceManifestFileSha256: source.manifestFileSha256,
      sourceRoot: source.sourceRoot,
      fileInventoryHash: source.inventory.inventoryHash,
      selectedRawBytes: source.selectedRawBytes,
      readmeReplayHash: digest(`${ZENODO_6461868_REPORT_SCHEMA}/readme`, source.readme),
      rowsReplayHash: digest(`${ZENODO_6461868_REPORT_SCHEMA}/rows`, source.rows),
      wholeSelectedCsvFilesDownloaded: false,
      wholeSelectedCsvMd5Verified: false,
      selectedRangesStrict206: true,
    },
  };
  body.sourceReplay.replayHash = digest(`${ZENODO_6461868_REPORT_SCHEMA}/source-replay`,
    body.sourceReplay);
  return Object.freeze({ ...body,
    artifactHash: digest(`${ZENODO_6461868_REPORT_SCHEMA}/artifact`, body) });
}

export function verifyZenodo6461868JointTorqueSignalPiecesReport(report) {
  const errors = [];
  try {
    if (!exactKeys(report, ["schema", "generatedAt", "sourceIdentity", "declaredScope",
      "selection", "publisherDatasetSchema", "population", "denominatorRegistry",
      "mechanicalEvidence", "segmentCoverageAttribution", "rightsPrivacyRevisionAndUse",
      "modelAndTrainingBoundary", "authorityAndNetworkBoundary", "zeroClaimBoundary",
      "sourceReplay", "artifactHash"])) fail("REPORT_SHAPE");
    const { artifactHash, ...body } = report;
    if (report.schema !== ZENODO_6461868_REPORT_SCHEMA
      || report.generatedAt !== ZENODO_6461868_FROZEN_AT
      || artifactHash !== digest(`${ZENODO_6461868_REPORT_SCHEMA}/artifact`, body)) {
      fail("ARTIFACT_HASH");
    }
    if (!same(report.sourceIdentity, sourceIdentity())) fail("SOURCE_IDENTITY_BOUNDARY");
    if (!same(report.denominatorRegistry, denominatorRegistry())
      || !same(report.population, { selectedJointTorqueSignalPieces: 3,
        selectedTorqueSamplesWithinPieces: 3_072, selectedJointIdentifiers: 1,
        selectedPublisherClassPartitions: 3 })) fail("DENOMINATOR_BOUNDARY");
    if (report.declaredScope.completeOfficialFileInventoryReplayed !== true
      || report.declaredScope.remoteObjects !== 22
      || report.declaredScope.selectedRowsPerClass !== 1
      || report.declaredScope.fullCsvPayloadsExhausted !== false
      || report.declaredScope.globalExhaustion !== false
      || report.selection.fullCsvFilesDownloaded !== false
      || report.selection.selectionIsRepresentativeSampleClaim !== false
      || report.selection.selectionIsClassBalanceClaim !== false
      || report.selection.selectedBytesIncludingReadme !== 55_979) fail("SCOPE_BOUNDARY");
    if (report.publisherDatasetSchema.samplesPerSignalPiece !== 1_024
      || report.publisherDatasetSchema.sampleRateHz !== 1_000
      || report.publisherDatasetSchema.durationSeconds !== 1.024
      || report.publisherDatasetSchema.unitClaim !== "Nm"
      || report.publisherDatasetSchema.crossJointRowAlignmentVerifiedFromSelectedBytes !== false
      || report.publisherDatasetSchema.uniquePhysicalTrialCountAcrossJointFiles !== null) {
      fail("PUBLISHER_SCHEMA_BOUNDARY");
    }
    if (report.mechanicalEvidence.signalPieces.length !== 3
      || report.mechanicalEvidence.signalPieces.some((piece) => piece.samples !== 1_024
        || piece.publisherLabelIndependentGroundTruth !== false)
      || report.mechanicalEvidence.labelsArePublisherClaims !== true
      || report.mechanicalEvidence.labelsIndependentlyVerified !== false
      || report.mechanicalEvidence.fullRobotStatePresent !== false
      || report.mechanicalEvidence.externalForceTorqueSensorPresent !== false
      || report.mechanicalEvidence.taskSemanticsPresent !== false
      || report.mechanicalEvidence.taskOutcomeSemanticsPresent !== false
      || report.mechanicalEvidence.recoverySequencePresent !== false) {
      fail("MECHANICAL_EVIDENCE_BOUNDARY");
    }
    if (report.segmentCoverageAttribution.segmentsAreNotAdditive !== true
      || report.segmentCoverageAttribution.effect.independentTaskEffectRecords !== 0
      || report.segmentCoverageAttribution.outcome.independentTaskOutcomeRecords !== 0
      || report.segmentCoverageAttribution.recovery.recoveryRecords !== 0
      || report.segmentCoverageAttribution.delegationAuthorization.delegationRecords !== 0
      || !same(report.zeroClaimBoundary, zeroBoundary())) fail("SEGMENT_ZERO_BOUNDARY");
    if (report.rightsPrivacyRevisionAndUse.rights.officialZenodoLicenseClaim
        !== ZENODO_6461868_LICENSE
      || report.rightsPrivacyRevisionAndUse.rights.legalConclusion !== false
      || report.rightsPrivacyRevisionAndUse.privacy.humanSubjectPrivacyClearanceEstablished
        !== false
      || report.rightsPrivacyRevisionAndUse.privacy.publicRedistributionCleared !== false
      || report.rightsPrivacyRevisionAndUse.use.productionTrainingAuthorized !== false
      || report.rightsPrivacyRevisionAndUse.use.authorizedTrainingRows !== 0
      || !same(report.modelAndTrainingBoundary, { offlineModelFittingPerformed: false,
        authorizedTraining: false, authorizedTrainingRows: 0, authorizedTrainingJobs: 0,
        authorizedTrainingPerformed: false })) fail("RIGHTS_PRIVACY_TRAINING_BOUNDARY");
    if (!same(report.authorityAndNetworkBoundary, { delegationRecords: 0,
      authorityRecords: 0, authorityDelta: 0, networkContributionRecords: 0,
      CEURecords: 0 })) fail("AUTHORITY_NETWORK_BOUNDARY");
    if (report.sourceReplay.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED"
      || !HASH.test(report.sourceReplay.sourceManifestHash)
      || !HASH.test(report.sourceReplay.sourceManifestFileSha256)
      || !HASH.test(report.sourceReplay.sourceRoot)
      || !HASH.test(report.sourceReplay.fileInventoryHash)
      || report.sourceReplay.selectedRawBytes !== 55_979
      || !HASH.test(report.sourceReplay.readmeReplayHash)
      || !HASH.test(report.sourceReplay.rowsReplayHash)
      || report.sourceReplay.wholeSelectedCsvFilesDownloaded !== false
      || report.sourceReplay.wholeSelectedCsvMd5Verified !== false
      || report.sourceReplay.selectedRangesStrict206 !== true) fail("SOURCE_REPLAY_BOUNDARY");
    const { replayHash, ...replayBody } = report.sourceReplay;
    if (replayHash !== digest(`${ZENODO_6461868_REPORT_SCHEMA}/source-replay`, replayBody)) {
      fail("SOURCE_REPLAY_HASH");
    }
  } catch (error) { errors.push(safeError(error)); }
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function verifyZenodo6461868JointTorqueSignalPiecesWithSource(report,
  sourceDirectory) {
  try {
    const standalone = verifyZenodo6461868JointTorqueSignalPiecesReport(report);
    if (!standalone.ok) fail("REPORT_INVALID", standalone.errors.join(","));
    const rebuilt = buildZenodo6461868JointTorqueSignalPiecesFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("FULL_SOURCE_REBUILD_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      artifactHash: report.artifactHash });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export function buildZenodo6461868JointTorqueRunReceipt(report, reportBytes) {
  const checked = verifyZenodo6461868JointTorqueSignalPiecesReport(report);
  if (!checked.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_INVALID");
  const body = {
    schema: ZENODO_6461868_RECEIPT_SCHEMA,
    completedAt: ZENODO_6461868_FROZEN_AT,
    artifact: { schema: report.schema, artifactHash: report.artifactHash,
      path: "zenodo6461868-joint-torque-signal-pieces.json",
      sizeBytes: reportBytes.length, fileSha256: zenodo6461868Sha256(reportBytes) },
    source: { sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      completeOfficialFileInventoryReplayed: true,
      fullCsvFilesDownloaded: false },
    denominatorBoundary: { signalPieces: 3, torqueSamples: 3_072,
      jointIdentifiersAreNotAdditionalSignalPieces: true,
      crossDomainTotal: null, crossDomainAdditionProhibited: true },
    zeroClaimBoundary: zeroBoundary(),
    publication: { reportPublishedBeforeReceipt: true, receiptWrittenLast: true,
      filesMode: "0600", directoriesMode: "0700", noClobber: true },
  };
  return Object.freeze({ ...body,
    receiptHash: digest(`${ZENODO_6461868_RECEIPT_SCHEMA}/receipt`, body) });
}

export function verifyZenodo6461868JointTorqueRunReceipt(receipt, reportBytes) {
  try {
    const report = safeJson(reportBytes, "RECEIPT_REPORT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_NOT_CANONICAL");
    const expected = buildZenodo6461868JointTorqueRunReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export function publishZenodo6461868JointTorqueArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || path.dirname(staging) !== path.dirname(target)) {
    fail("PUBLISH_DIRECTORIES_NOT_SIBLINGS");
  }
  const stat = lstatSync(staging, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(staging)),
      ["run-receipt.json", "source", "zenodo6461868-joint-torque-signal-pieces.json"])) {
    fail("PUBLISH_STAGING_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "zenodo6461868-joint-torque-signal-pieces.json"),
      path.join(target, "zenodo6461868-joint-torque-signal-pieces.json"));
    renameSync(path.join(staging, "run-receipt.json"), path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_TARGET_INCOMPLETE", target); }
  return target;
}

export function verifyZenodo6461868JointTorqueArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const snapshots = [];
    requirePrivateDirectory(root,
      ["run-receipt.json", "source", "zenodo6461868-joint-torque-signal-pieces.json"],
      snapshots);
    const reportBytes = readPrivateStable(root,
      "zenodo6461868-joint-torque-signal-pieces.json", snapshots, 8 * 1024 * 1024);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots,
      2 * 1024 * 1024);
    const report = safeJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = safeJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))
      || !receiptBytes.equals(canonicalBytes(receipt))) fail("ARTIFACT_JSON_NOT_CANONICAL");
    const replay = verifyZenodo6461868JointTorqueSignalPiecesWithSource(report,
      path.join(root, "source"));
    const receiptCheck = verifyZenodo6461868JointTorqueRunReceipt(receipt, reportBytes);
    if (!replay.ok || !receiptCheck.ok) fail("ARTIFACT_REPLAY_FAILED",
      replay.errors?.join(",") ?? receiptCheck.errors?.join(","));
    const reportStat = statSync(path.join(root,
      "zenodo6461868-joint-torque-signal-pieces.json"), { bigint: true });
    const receiptStat = statSync(path.join(root, "run-receipt.json"), { bigint: true });
    if (receiptStat.mtimeNs < reportStat.mtimeNs) fail("RECEIPT_NOT_LAST");
    recheckSnapshots(snapshots);
    return Object.freeze({ ok: true, verificationLevel: replay.verificationLevel,
      artifactHash: report.artifactHash, reportFileSha256: zenodo6461868Sha256(reportBytes),
      receiptHash: receipt.receiptHash, receiptFileSha256: zenodo6461868Sha256(receiptBytes),
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      selectedSignalPieces: 3, selectedTorqueSamples: 3_072,
      independentTaskOutcomeRecords: 0, recoveryRecords: 0,
      authorizedTrainingRows: 0, authorityDelta: 0 });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export const ZENODO_6461868_CONSTANTS = Object.freeze({
  recordUrl: RECORD_URL,
  recordBytes: RECORD_BYTES,
  recordSha256: RECORD_SHA256,
  totalRemoteBytes: TOTAL_REMOTE_BYTES,
  files: FILES,
  selectedRows: ROWS,
  readme: README,
});
