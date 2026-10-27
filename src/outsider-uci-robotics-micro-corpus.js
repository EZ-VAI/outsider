/*
 * UCI Robotics Micro-Corpus v1.
 *
 * Five byte-pinned UCI sources are replayed into five typed, non-additive
 * populations. Source labels and telemetry remain research evidence only:
 * they do not establish delegation, independent outcomes, longitudinal
 * follow-up, authority, CEU, production-training clearance, or permission to
 * execute an action.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const UCI_ROBOTICS_MICRO_CORPUS_SCHEMA
  = "outsider/uci-robotics-micro-corpus/v1";
export const UCI_ROBOTICS_SOURCE_MANIFEST_SCHEMA
  = "outsider/uci-robotics-pinned-source/v1";
export const UCI_ROBOTICS_RUN_RECEIPT_SCHEMA
  = "outsider/uci-robotics-micro-corpus-run-receipt/v1";
export const UCI_ROBOTICS_FROZEN_AT = "2026-08-29T00:00:00.000Z";

const UCI_ORIGIN = "https://archive.ics.uci.edu";
const UCI_API = `${UCI_ORIGIN}/api/dataset`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_MANIFEST_BYTES = 512 * 1024;
const EXPECTED_REMOTE_FILES = 15;
const EXPECTED_REMOTE_BYTES = 4_600_773;
const EXPECTED_ARCHIVE_BYTES = 4_550_929;
const EXPECTED_API_BYTES_PER_BRACKET = 24_922;
const FULL_REPLAY_SCHEMA = "outsider/uci-robotics-full-content-replay/v1";
const EXPECTED_FULL_REPLAY_HASH
  = "sha256:4d6aeca0cbfb6517c4601abe9fd390181f06f3b512b60433bf48efdea50ba5ff";
const TRANSIENT_HTTP_STATUSES = Object.freeze([408, 425, 429, 500, 502, 503, 504]);
const RETRY_BACKOFF_MILLISECONDS = Object.freeze([1000, 4000]);
const FETCH_ATTEMPT_TIMEOUT_MILLISECONDS = 180_000;

const PROFILES = Object.freeze([
  {
    key: "963-ur3-cobotops", id: 963, name: "UR3 CobotOps",
    repositoryUrl: "https://archive.ics.uci.edu/dataset/963/ur3+cobotops",
    downloadUrl: "https://archive.ics.uci.edu/static/public/963/ur3%2Bcobotops.zip",
    doi: "10.24432/C5J891", lastUpdated: "Thu Sep 19 2024",
    apiInstances: 7409, apiFeatures: 20, apiBytes: 5027,
    apiSha256: "sha256:bd21f254b0f00dfe41b7102b416c177c4c6e0e49f83eca7a505703b8f6031940",
    archiveBytes: 1767936,
    archiveSha256: "sha256:233334eeb5370e594ea621796ca2d693bd4980cc2bb24fa749b1b633a4993c8d",
    denominatorClass: "MECHANICAL_SYSTEM_OPERATION_ROW", denominatorUnits: 7409,
  },
  {
    key: "138-robot-execution-failures", id: 138, name: "Robot Execution Failures",
    repositoryUrl: "https://archive.ics.uci.edu/dataset/138/robot+execution+failures",
    downloadUrl:
      "https://archive.ics.uci.edu/static/public/138/robot%2Bexecution%2Bfailures.zip",
    doi: "10.24432/C5M89N", lastUpdated: "Fri Apr 23 1999",
    apiInstances: 463, apiFeatures: 90, apiBytes: 2505,
    apiSha256: "sha256:64582e4c5bd353867eeffd05ddec5eb02d8cc5ff1d8c6ca97d4c28938c3c46ea",
    archiveBytes: 59365,
    archiveSha256: "sha256:cdfbe0b260f4a21c5249fe0da4b1baf4041959663a9182253885ee1f41a4568e",
    denominatorClass: "POST_FAILURE_LEARNING_PROBLEM_WINDOW", denominatorUnits: 463,
  },
  {
    key: "135-pioneer-1-mobile-robot-data", id: 135,
    name: "Pioneer-1 Mobile Robot Data",
    repositoryUrl: "https://archive.ics.uci.edu/dataset/135/pioneer+1+mobile+robot+data",
    downloadUrl:
      "https://archive.ics.uci.edu/static/public/135/pioneer%2B1%2Bmobile%2Brobot%2Bdata.zip",
    doi: "10.24432/C5BS5T", lastUpdated: "Thu Jan 28 1999",
    apiInstances: 0, apiFeatures: 0, apiBytes: 6489,
    apiSha256: "sha256:0a46b587a68ec28801e123b492fa3a7f6fcbadb614ece22638f39b9652d8d33e",
    archiveBytes: 237992,
    archiveSha256: "sha256:947f1314974d15ae3e58802392e82f6c3c9e262f96f740aa41011527eb90e08a",
    denominatorClass: "SOURCE_DEFINED_PIONEER_EXPERIENCE", denominatorUnits: 160,
  },
  {
    key: "66-mobile-robots", id: 66, name: "Mobile Robots",
    repositoryUrl: "https://archive.ics.uci.edu/dataset/66/mobile+robots",
    downloadUrl: "https://archive.ics.uci.edu/static/public/66/mobile%2Brobots.zip",
    doi: "10.24432/C5G881", lastUpdated: "Sat Jul 15 1995",
    apiInstances: 0, apiFeatures: 0, apiBytes: 1637,
    apiSha256: "sha256:42817582e46d0bafc44b8a96559708662abd5aa015cf7ff93c460ce5d954c3e6",
    archiveBytes: 1531468,
    archiveSha256: "sha256:25301af20fc8ae0970d347056d50436bca1ff6a96bf820437d854b7c6d61b173",
    denominatorClass: "MOBILE_ROBOT_TRACE", denominatorUnits: 83,
  },
  {
    key: "194-wall-following-robot-navigation", id: 194,
    name: "Wall-Following Robot Navigation Data",
    repositoryUrl:
      "https://archive.ics.uci.edu/dataset/194/wall+following+robot+navigation+data",
    downloadUrl:
      "https://archive.ics.uci.edu/static/public/194/wall%2Bfollowing%2Brobot%2Bnavigation%2Bdata.zip",
    doi: "10.24432/C57C8W", lastUpdated: "Wed Aug 04 2010",
    apiInstances: 5456, apiFeatures: 0, apiBytes: 9264,
    apiSha256: "sha256:a6c143179244d6dd5ac6c58aea07f7155647276b7b9b10e8ff414a9507292e2c",
    archiveBytes: 954168,
    archiveSha256: "sha256:7c1a3838be678585570fa7fa675217ee626b3aa277bb187dde627418b5e95ed2",
    denominatorClass: "NAVIGATION_TIME_STEP", denominatorUnits: 5456,
  },
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `UCI_ROBOTICS_${code}` : `UCI_ROBOTICS_${code}:${detail}`);
}

export function uciRoboticsSha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return uciRoboticsSha256Bytes(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`);
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equalCanonical(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function safeJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function apiProjection(profile, bytes) {
  if (bytes.length !== profile.apiBytes || uciRoboticsSha256Bytes(bytes) !== profile.apiSha256) {
    fail("API_BYTES_CHANGED", profile.id);
  }
  const response = safeJson(bytes, "API_JSON_INVALID");
  const data = response?.data;
  if (response?.status !== 200 || response?.statusText !== "OK" || !exactObject(data)
    || data.uci_id !== profile.id || data.name !== profile.name
    || data.repository_url !== profile.repositoryUrl || data.dataset_doi !== profile.doi
    || data.last_updated !== profile.lastUpdated || data.num_instances !== profile.apiInstances
    || data.num_features !== profile.apiFeatures || data.data_url !== null) {
    fail("API_PROFILE_CHANGED", profile.id);
  }
  return {
    uciId: profile.id,
    name: profile.name,
    repositoryUrl: profile.repositoryUrl,
    doi: profile.doi,
    lastUpdated: profile.lastUpdated,
    declaredInstances: profile.apiInstances,
    declaredFeatures: profile.apiFeatures,
    hasMissingValues: data.has_missing_values,
    missingValuesSymbol: data.missing_values_symbol,
    variableMetadataRows: Array.isArray(data.variables) ? data.variables.length : 0,
    licenseFieldPresentInApiPayload: Object.hasOwn(data, "license"),
  };
}

function retryPause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MILLISECONDS.length; attempt += 1) {
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_ATTEMPT_TIMEOUT_MILLISECONDS);
    try {
      response = await fetchImpl(url, { redirect: "follow", headers: {
        accept: "application/json, application/zip, application/octet-stream;q=0.9",
        "user-agent": "outsider-uci-robotics-micro-corpus/1.0",
      }, signal: controller.signal });
    } catch (error) {
      clearTimeout(timeout);
      if (attempt < RETRY_BACKOFF_MILLISECONDS.length) {
        await retryPause(RETRY_BACKOFF_MILLISECONDS[attempt]);
        continue;
      }
      fail("FETCH_TRANSPORT_FAILED", `${url}:${error?.cause?.code ?? error?.message ?? error}`);
    }
    if (!response?.ok) {
      clearTimeout(timeout);
      if (TRANSIENT_HTTP_STATUSES.includes(response?.status)
        && attempt < RETRY_BACKOFF_MILLISECONDS.length) {
        try { await response.body?.cancel?.(); } catch { /* retry remains bounded */ }
        await retryPause(RETRY_BACKOFF_MILLISECONDS[attempt]);
        continue;
      }
      fail(`FETCH_${response?.status ?? "FAILED"}`, url);
    }
    const declared = response.headers?.get?.("content-length");
    if (declared != null && (!/^[0-9]+$/u.test(declared)
      || Number(declared) > maximumBytes)) {
      clearTimeout(timeout);
      fail("FETCH_DECLARED_SIZE_INVALID", url);
    }
    const reader = response.body?.getReader?.();
    if (!reader) {
      clearTimeout(timeout);
      fail("FETCH_BODY_MISSING", url);
    }
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximumBytes) {
          await reader.cancel();
          fail("FETCH_SIZE_INVALID", url);
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      clearTimeout(timeout);
      if (String(error?.message ?? error).startsWith("UCI_ROBOTICS_")) throw error;
      if (attempt < RETRY_BACKOFF_MILLISECONDS.length) {
        try { await reader.cancel(); } catch { /* retry remains bounded */ }
        await retryPause(RETRY_BACKOFF_MILLISECONDS[attempt]);
        continue;
      }
      fail("FETCH_BODY_TRANSPORT_FAILED", `${url}:${error?.message ?? error}`);
    }
    clearTimeout(timeout);
    if (total < 1) fail("FETCH_EMPTY", url);
    return Buffer.concat(chunks, total);
  }
  fail("FETCH_RETRY_EXHAUSTED", url);
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

function safeSourceTarget(root, profile, fileName) {
  if (!PROFILES.includes(profile) || !["api-before.json", "api-after.json", "download.zip"]
    .includes(fileName)) fail("SOURCE_PATH_INVALID");
  const target = path.resolve(root, profile.key, fileName);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) fail("SOURCE_PATH_ESCAPE");
  return target;
}

function writePrivate(target, bytes) {
  ensurePrivateDirectory(path.dirname(target));
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(target, 0o600);
}

export async function acquirePinnedUciRoboticsSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const datasets = [];
    for (const profile of PROFILES) {
      const apiUrl = `${UCI_API}?id=${profile.id}`;
      const beforeBytes = await boundedFetch(apiUrl, profile.apiBytes, fetchImpl);
      const before = apiProjection(profile, beforeBytes);
      const archiveBytes = await boundedFetch(profile.downloadUrl, profile.archiveBytes, fetchImpl);
      if (archiveBytes.length !== profile.archiveBytes
        || uciRoboticsSha256Bytes(archiveBytes) !== profile.archiveSha256) {
        fail("ARCHIVE_BYTES_CHANGED", profile.id);
      }
      const afterBytes = await boundedFetch(apiUrl, profile.apiBytes, fetchImpl);
      const after = apiProjection(profile, afterBytes);
      if (!beforeBytes.equals(afterBytes) || !equalCanonical(before, after)) {
        fail("API_CHANGED_DURING_ACQUISITION", profile.id);
      }
      writePrivate(safeSourceTarget(temporary, profile, "api-before.json"), beforeBytes);
      writePrivate(safeSourceTarget(temporary, profile, "download.zip"), archiveBytes);
      writePrivate(safeSourceTarget(temporary, profile, "api-after.json"), afterBytes);
      datasets.push({
        key: profile.key,
        uciId: profile.id,
        name: profile.name,
        doi: profile.doi,
        lastUpdated: profile.lastUpdated,
        repositoryUrl: profile.repositoryUrl,
        apiUrl,
        downloadUrl: profile.downloadUrl,
        apiBefore: { path: `${profile.key}/api-before.json`, bytes: beforeBytes.length,
          sha256: uciRoboticsSha256Bytes(beforeBytes) },
        archive: { path: `${profile.key}/download.zip`, bytes: archiveBytes.length,
          sha256: uciRoboticsSha256Bytes(archiveBytes) },
        apiAfter: { path: `${profile.key}/api-after.json`, bytes: afterBytes.length,
          sha256: uciRoboticsSha256Bytes(afterBytes) },
        apiByteIdenticalDuringAcquisition: true,
        apiProjection: before,
        licenseClaim: {
          identifier: "CC-BY-4.0",
          displayName: "Creative Commons Attribution 4.0 International",
          claimSource: "UCI_OFFICIAL_DATASET_PAGE",
          bytePinnedInApiPayload: false,
          legalConclusion: false,
        },
        denominatorClass: profile.denominatorClass,
        denominatorUnits: profile.denominatorUnits,
      });
    }
    const manifestBody = {
      schema: UCI_ROBOTICS_SOURCE_MANIFEST_SCHEMA,
      capturedAt: UCI_ROBOTICS_FROZEN_AT,
      sourceAuthority: "UCI_MACHINE_LEARNING_REPOSITORY",
      selectedDatasetCount: 5,
      selectedRemoteFileCount: EXPECTED_REMOTE_FILES,
      selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
      apiBracketedBeforeAndAfterArchiveDownload: true,
      exactApiBytesStableForEveryDataset: true,
      boundedTransientRetryPolicy: {
        maximumAttemptsPerRequest: 3,
        perAttemptTimeoutMilliseconds: FETCH_ATTEMPT_TIMEOUT_MILLISECONDS,
        backoffMilliseconds: RETRY_BACKOFF_MILLISECONDS,
        retryableHttpStatuses: TRANSIENT_HTTP_STATUSES,
      },
      transportAttested: false,
      declaredFiveDatasetScopeExhausted: true,
      uciRepositoryUniverseExhausted: false,
      globalExhaustion: false,
      datasets,
    };
    const manifest = { ...manifestBody,
      manifestHash: digest(`${UCI_ROBOTICS_SOURCE_MANIFEST_SCHEMA}/manifest`, manifestBody) };
    writePrivate(path.join(temporary, "acquisition-manifest.json"), canonicalBytes(manifest));
    renameSync(temporary, target);
    return { sourceDirectory: target, manifest,
      manifestFileSha256: uciRoboticsSha256Bytes(readFileSync(
        path.join(target, "acquisition-manifest.json"))) };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function recursiveSourceEntries(root, relative = "") {
  const files = [];
  const directories = [relative];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail("SOURCE_SYMLINK", child);
    if (entry.isDirectory()) {
      const nested = recursiveSourceEntries(root, child);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else if (entry.isFile()) files.push(child);
    else fail("SOURCE_SPECIAL_FILE", child);
  }
  return { files: files.sort(), directories: directories.sort() };
}

function stableReadFile(target, expectedBytes) {
  const initial = lstatSync(target, { bigint: true });
  if (!initial.isFile() || initial.isSymbolicLink()
    || initial.size !== BigInt(expectedBytes) || (Number(initial.mode) & 0o777) !== 0o600) {
    fail("SOURCE_FILE_UNSAFE", target);
  }
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(target, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || before.dev !== finalPath.dev || before.ino !== finalPath.ino
      || before.size !== finalPath.size || before.mtimeNs !== finalPath.mtimeNs
      || before.ctimeNs !== finalPath.ctimeNs || bytes.length !== expectedBytes) {
      fail("SOURCE_FILE_CHANGED", target);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function assertPrivateDirectories(root, directories) {
  for (const relative of directories) {
    const target = relative === "" ? root : path.join(root, relative);
    const observed = lstatSync(target);
    if (!observed.isDirectory() || observed.isSymbolicLink()
      || (observed.mode & 0o777) !== 0o700) fail("SOURCE_DIRECTORY_UNSAFE", relative);
  }
}

function expectedManifestDataset(profile, root) {
  const beforeBytes = stableReadFile(safeSourceTarget(root, profile, "api-before.json"),
    profile.apiBytes);
  const archiveBytes = stableReadFile(safeSourceTarget(root, profile, "download.zip"),
    profile.archiveBytes);
  const afterBytes = stableReadFile(safeSourceTarget(root, profile, "api-after.json"),
    profile.apiBytes);
  const before = apiProjection(profile, beforeBytes);
  const after = apiProjection(profile, afterBytes);
  if (!beforeBytes.equals(afterBytes) || !equalCanonical(before, after)
    || uciRoboticsSha256Bytes(archiveBytes) !== profile.archiveSha256) {
    fail("SOURCE_DATASET_BYTES_INVALID", profile.id);
  }
  return {
    key: profile.key, uciId: profile.id, name: profile.name, doi: profile.doi,
    lastUpdated: profile.lastUpdated, repositoryUrl: profile.repositoryUrl,
    apiUrl: `${UCI_API}?id=${profile.id}`, downloadUrl: profile.downloadUrl,
    apiBefore: { path: `${profile.key}/api-before.json`, bytes: profile.apiBytes,
      sha256: profile.apiSha256 },
    archive: { path: `${profile.key}/download.zip`, bytes: profile.archiveBytes,
      sha256: profile.archiveSha256 },
    apiAfter: { path: `${profile.key}/api-after.json`, bytes: profile.apiBytes,
      sha256: profile.apiSha256 },
    apiByteIdenticalDuringAcquisition: true,
    apiProjection: before,
    licenseClaim: {
      identifier: "CC-BY-4.0",
      displayName: "Creative Commons Attribution 4.0 International",
      claimSource: "UCI_OFFICIAL_DATASET_PAGE",
      bytePinnedInApiPayload: false,
      legalConclusion: false,
    },
    denominatorClass: profile.denominatorClass,
    denominatorUnits: profile.denominatorUnits,
  };
}

export function verifyUciRoboticsSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("SOURCE_DIRECTORY_UNSAFE");
  const observed = recursiveSourceEntries(root);
  assertPrivateDirectories(root, observed.directories);
  const expectedFiles = ["acquisition-manifest.json", ...PROFILES.flatMap((profile) => [
    `${profile.key}/api-before.json`, `${profile.key}/api-after.json`,
    `${profile.key}/download.zip`,
  ])].sort();
  if (!equalCanonical(observed.files, expectedFiles)) fail("SOURCE_FILE_SET_INVALID");
  const manifestPath = path.join(root, "acquisition-manifest.json");
  const manifestSize = statSync(manifestPath).size;
  if (!Number.isSafeInteger(manifestSize) || manifestSize < 1
    || manifestSize > MAX_MANIFEST_BYTES) fail("SOURCE_MANIFEST_SIZE_INVALID");
  const manifestBytes = stableReadFile(manifestPath, manifestSize);
  const manifest = safeJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID");
  if (!exactObject(manifest) || manifest.schema !== UCI_ROBOTICS_SOURCE_MANIFEST_SCHEMA
    || manifest.capturedAt !== UCI_ROBOTICS_FROZEN_AT
    || manifest.sourceAuthority !== "UCI_MACHINE_LEARNING_REPOSITORY"
    || manifest.selectedDatasetCount !== 5
    || manifest.selectedRemoteFileCount !== EXPECTED_REMOTE_FILES
    || manifest.selectedRemoteBytes !== EXPECTED_REMOTE_BYTES
    || manifest.apiBracketedBeforeAndAfterArchiveDownload !== true
    || manifest.exactApiBytesStableForEveryDataset !== true
    || !equalCanonical(manifest.boundedTransientRetryPolicy, {
      maximumAttemptsPerRequest: 3,
      perAttemptTimeoutMilliseconds: FETCH_ATTEMPT_TIMEOUT_MILLISECONDS,
      backoffMilliseconds: RETRY_BACKOFF_MILLISECONDS,
      retryableHttpStatuses: TRANSIENT_HTTP_STATUSES,
    })
    || manifest.transportAttested !== false
    || manifest.declaredFiveDatasetScopeExhausted !== true
    || manifest.uciRepositoryUniverseExhausted !== false
    || manifest.globalExhaustion !== false || !Array.isArray(manifest.datasets)
    || manifest.datasets.length !== 5 || !HASH.test(manifest.manifestHash ?? "")) {
    fail("SOURCE_MANIFEST_INVALID");
  }
  const { manifestHash, ...body } = manifest;
  if (manifestHash !== digest(`${UCI_ROBOTICS_SOURCE_MANIFEST_SCHEMA}/manifest`, body)) {
    fail("SOURCE_MANIFEST_HASH_INVALID");
  }
  const expectedDatasets = PROFILES.map((profile) => expectedManifestDataset(profile, root));
  if (!equalCanonical(manifest.datasets, expectedDatasets)) fail("SOURCE_MANIFEST_DATASETS_INVALID");
  return { ok: true, sourceDirectory: root, manifest,
    manifestFileSha256: uciRoboticsSha256Bytes(manifestBytes),
    verifiedRemoteFileCount: EXPECTED_REMOTE_FILES,
    verifiedRemoteBytes: EXPECTED_REMOTE_BYTES };
}

const PYTHON_REPLAY = String.raw`
import collections, csv, datetime, gzip, hashlib, io, json, math, os, re
import subprocess, sys, tarfile, tempfile, zipfile
import xml.etree.ElementTree as ET

def require(ok, code):
    if not ok: raise ValueError(code)

def sha(data): return 'sha256:' + hashlib.sha256(data).hexdigest()

def checked_zip(data, expected):
    z=zipfile.ZipFile(io.BytesIO(data))
    require(z.testzip() is None, 'ZIP_CRC')
    infos=z.infolist()
    require(len(infos)==len(expected), 'ZIP_MEMBER_COUNT')
    observed={i.filename:i.file_size for i in infos}
    require(observed==expected, 'ZIP_INVENTORY')
    for i in infos:
        require(not i.flag_bits & 1 and not i.is_dir(), 'ZIP_ENCRYPTED_OR_DIRECTORY')
        parts=i.filename.replace('\\','/').split('/')
        require(i.filename and not i.filename.startswith(('/', '\\'))
                and '..' not in parts and '\x00' not in i.filename, 'ZIP_PATH')
        mode=(i.external_attr >> 16) & 0o170000
        require(mode not in (0o120000,0o060000), 'ZIP_SPECIAL')
        require(len(z.read(i.filename))==i.file_size, 'ZIP_READ')
    return z

def xlsx_value(cell, shared, ns):
    typ=cell.get('t'); v=cell.find('m:v',ns)
    if typ=='inlineStr':
        return ''.join((t.text or '') for t in cell.findall('.//m:t',ns))
    if v is None: return None
    text=v.text or ''
    if typ=='s': return shared[int(text)]
    if typ=='b': return text=='1'
    if typ in ('str','e'): return text
    number=float(text)
    return int(number) if number.is_integer() else number

def column_index(reference):
    letters=re.match(r'[A-Z]+',reference).group(0); value=0
    for c in letters:value=value*26+ord(c)-64
    return value-1

def parse_963(archive):
    outer=checked_zip(archive,{'dataset_02052023.xlsx':1771022})
    xlsx=outer.read('dataset_02052023.xlsx')
    expected={'[Content_Types].xml':1168,'_rels/.rels':588,'xl/workbook.xml':1974,
      'xl/_rels/workbook.xml.rels':698,'xl/worksheets/sheet1.xml':6770342,
      'xl/theme/theme1.xml':8390,'xl/styles.xml':17572,'xl/sharedStrings.xml':298908,
      'docProps/core.xml':624,'docProps/app.xml':807}
    book=checked_zip(xlsx,expected)
    ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    wb=ET.fromstring(book.read('xl/workbook.xml'))
    sheets=wb.find('m:sheets',ns)
    require(len(sheets)==1 and sheets[0].get('name')=='data','XLSX_SHEETS')
    strings=ET.fromstring(book.read('xl/sharedStrings.xml'))
    shared=[''.join((t.text or '') for t in si.findall('.//m:t',ns)) for si in strings]
    sheet=ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
    require(sheet.find('m:dimension',ns).get('ref')=='A1:AI7410','XLSX_DIMENSION')
    require(len(sheet.findall('.//m:f',ns))==0,'XLSX_FORMULA')
    rows=[]
    for node in sheet.findall('.//m:sheetData/m:row',ns):
        row=[None]*35
        for cell in node.findall('m:c',ns):
            idx=column_index(cell.get('r')); require(idx<35,'XLSX_CELL_RANGE')
            row[idx]=xlsx_value(cell,shared,ns)
        rows.append(row)
    headers=['Num','Timestamp','Current_J0','Temperature_T0','Current_J1','Temperature_J1',
      'Current_J2','Temperature_J2','Current_J3','Temperature_J3','Current_J4',
      'Temperature_J4','Current_J5','Temperature_J5','Speed_J0','Speed_J1','Speed_J2',
      'Speed_J3','Speed_J4','Speed_J5','Tool_current','cycle ',
      'Robot_ProtectiveStop','grip_lost']
    require(len(rows)==7410 and rows[0][:24]==headers and rows[0][24:]==[None]*11,
            'XLSX_ROWS_HEADERS')
    data=rows[1:]; missing=collections.Counter(); quoted=0; times=[]; cycles=[]
    protective=collections.Counter(); grip=collections.Counter()
    for index,row in enumerate(data,1):
        require(row[0]==index and isinstance(row[1],str) and row[24:]==[None]*11,
                'XLSX_ROW_SCHEMA')
        raw=row[1]
        if raw.startswith('"') and raw.endswith('"'): quoted+=1; raw=raw[1:-1]
        times.append(datetime.datetime.fromisoformat(raw.replace('Z','+00:00')))
        miss=tuple(headers[i] for i in range(2,24) if row[i] is None)
        if miss: missing[miss]+=1
        for value in row[2:21]:
            require(value is None or (isinstance(value,(int,float)) and math.isfinite(value)),
                    'XLSX_FEATURE_TYPE')
        require(isinstance(row[21],int) and row[21]>0,'XLSX_CYCLE')
        require(row[22] in (True,False,None) and row[23] in (True,False),'XLSX_TARGET')
        cycles.append(row[21]);protective[str(row[22])]+=1;grip[str(row[23])]+=1
    require(all(b>a for a,b in zip(times,times[1:])),'XLSX_TIME_ORDER')
    expected_missing={
      tuple(headers[2:21]+[headers[22]]):46,
      tuple(headers[3:21]+[headers[22]]):8}
    require(missing==expected_missing and quoted==863,'XLSX_ANOMALY_PROFILE')
    gaps=sorted(set(range(1,265))-set(cycles))
    require(len(set(cycles))==240 and gaps==[74,*range(129,150),187,244],
            'XLSX_CYCLE_PROFILE')
    require(protective=={'False':7077,'True':278,'None':54}
            and grip=={'False':7166,'True':243},'XLSX_TARGET_COUNTS')
    return {'uciId':963,'denominatorClass':'MECHANICAL_SYSTEM_OPERATION_ROW',
      'denominatorUnits':7409,'archiveMembers':1,'workbookSheets':1,'sheetName':'data',
      'worksheetRowsIncludingHeader':7410,'worksheetColumns':35,'populatedColumns':24,
      'apiFeatureColumns':20,'targetColumns':2,'identifierColumns':2,
      'mechanicalRows':7409,'formulaCells':0,'strictlyIncreasingTimestamps':True,
      'literalQuotedTimestampCells':quoted,'missingMechanicalRows':54,
      'missingPatternRows':{'ALL_19_TELEMETRY_AND_PROTECTIVE_STOP':46,
                            '18_TELEMETRY_EXCEPT_CURRENT_J0_AND_PROTECTIVE_STOP':8},
      'sourceCycleIdentifiers':240,'cycleIdentifierGaps':24,
      'protectiveStopClaims':{'false':7077,'true':278,'missing':54},
      'gripLostClaims':{'false':7166,'true':243},
      'anomalies':{'trailingBlankWorksheetColumns':11,
        'quotedTimestampCells':863,'missingRows':54,'nonContiguousCycleIdentifiers':24},
      'sourceDefinedEpisodes':0,'outsiderProspectiveEpisodes':0}

def parse_138(archive):
    expected={'a.out':24404,'format.c':540,'lp1.data':27345,'lp2.data':14606,
      'lp3.data':14512,'lp4.data':33619,'lp5.data':49158,'robot':4679,
      'robotfailure.data.html':6106,'robotfailure.html':1236}
    z=checked_zip(archive,expected)
    expected_counts={
      'lp1.data':{'normal':21,'collision':17,'obstruction':34,'fr_collision':16},
      'lp2.data':{'normal':20,'front_col':6,'right_col':5,'left_col':9,'back_col':7},
      'lp3.data':{'ok':20,'slightly_moved':9,'moved':15,'lost':3},
      'lp4.data':{'normal':24,'collision':72,'obstruction':21},
      'lp5.data':{'normal':44,'bottom_collision':26,'bottom_obstruction':21,
                  'collision_in_part':47,'collision_in_tool':26}}
    per={};payloads=[];sets={}
    for name in [f'lp{i}.data' for i in range(1,6)]:
        text=z.read(name).decode('ascii'); nonblank=[x.strip() for x in text.splitlines() if x.strip()]
        require(len(nonblank)%16==0,'FAILURE_BLOCK_WIDTH')
        labels=collections.Counter(); hashes=[]
        for start in range(0,len(nonblank),16):
            label=nonblank[start]; samples=nonblank[start+1:start+16]
            require(len(samples)==15,'FAILURE_SAMPLE_COUNT')
            for sample in samples:
                values=sample.split();require(len(values)==6,'FAILURE_AXIS_COUNT')
                for value in values: int(value)
            labels[label]+=1
            h=hashlib.sha256(('\n'.join(samples)).encode()).hexdigest()
            hashes.append(h);payloads.append((name,h))
        require(dict(labels)==expected_counts[name],'FAILURE_CLASS_COUNTS')
        per[name]={'windows':len(hashes),'classCounts':dict(sorted(labels.items()))}
        sets[name]=set(hashes)
    groups=collections.defaultdict(list)
    for name,h in payloads:groups[h].append(name)
    require(len(payloads)==463 and len(groups)==251
            and sum(len(v)>1 for v in groups.values())==162
            and sum(len(v)-1 for v in groups.values())==212,'FAILURE_DUPLICATION')
    overlaps={f'{a}:{b}':len(sets[a]&sets[b]) for a,b in
      [('lp2.data','lp3.data'),('lp2.data','lp5.data'),('lp3.data','lp5.data'),
       ('lp4.data','lp5.data')]}
    require(overlaps=={'lp2.data:lp3.data':46,'lp2.data:lp5.data':45,
      'lp3.data:lp5.data':45,'lp4.data:lp5.data':116},'FAILURE_OVERLAPS')
    for name in ['format.c','robot','robotfailure.data.html','robotfailure.html']:
        z.read(name).decode('latin1')
    return {'uciId':138,'denominatorClass':'POST_FAILURE_LEARNING_PROBLEM_WINDOW',
      'denominatorUnits':463,'archiveMembers':10,'learningProblems':5,
      'windowsPerLearningProblem':per,'postFailureWindows':463,
      'samplesPerWindow':15,'forceTorqueAxesPerSample':6,'featuresPerWindow':90,
      'sampleRows':6945,'numericValues':62505,'uniqueNumericWindowPayloads':251,
      'duplicateNumericPayloadGroups':162,'duplicateLearningProblemInstanceExcess':212,
      'pairwiseNumericPayloadOverlaps':overlaps,'normalOrOkClassWindows':129,
      'executableNamedCompanionMembers':1,'companionExecutablesExecuted':0,
      'anomalies':{'learningProblemsReuseNumericWindows':True,
        'uniquePhysicalFailureEventsEstablished':False,
        'normalOrOkLabelsWithinPostDetectionWindows':129},
      'sourceDefinedEpisodes':0,'outsiderProspectiveEpisodes':0}

def parse_135(archive):
    expected={'gripper.data.gz':15195,'move.data.gz':163658,'pioneer.data.html':9963,
      'pioneer.html':1036,'pioneer.names':6909,'turn.data.gz':51650}
    z=checked_zip(archive,expected)
    specs={'move.data.gz':('MOVE-',6129,102,35,48,80),
      'turn.data.gz':('TURN-',2324,42,15,39,71),
      'gripper.data.gz':('GRIPPER-',697,16,7,38,52)}
    per={};total_rows=total_exp=total_desc=0
    for name,(prefix,row_count,exp_count,desc_count,min_rows,max_rows) in specs.items():
        raw=gzip.decompress(z.read(name)); text=raw.decode('ascii')
        rows=list(csv.reader(io.StringIO(text)));require(len(rows)==row_count,'PIONEER_ROWS')
        groups=collections.defaultdict(list)
        for index,row in enumerate(rows):
            require(len(row)==38 and row[0].startswith(prefix),'PIONEER_SCHEMA')
            numbers=[float(value) for value in row[2:]]
            require(all(math.isfinite(value) for value in numbers),'PIONEER_FINITE')
            groups[row[0]].append((index,row[1],numbers[0]))
        require(len(groups)==exp_count,'PIONEER_EXPERIENCES')
        descriptions=set();lengths=[]
        for values in groups.values():
            require(len(set(v[1] for v in values))==1,'PIONEER_DESCRIPTION_CHANGE')
            require(all(b[0]==a[0]+1 for a,b in zip(values,values[1:])),
                    'PIONEER_NONCONTIGUOUS')
            require(all(abs((b[2]-a[2])-0.1)<1e-7 for a,b in zip(values,values[1:])),
                    'PIONEER_SAMPLE_INTERVAL')
            descriptions.add(values[0][1]);lengths.append(len(values))
        require(len(descriptions)==desc_count and min(lengths)==min_rows
                and max(lengths)==max_rows,'PIONEER_PROFILE')
        per[name]={'observationRows':row_count,'experiences':exp_count,
          'symbolicDescriptionGroups':desc_count,'minimumRowsPerExperience':min_rows,
          'maximumRowsPerExperience':max_rows,'columns':38}
        total_rows+=row_count;total_exp+=exp_count;total_desc+=desc_count
    for name in ['pioneer.data.html','pioneer.html','pioneer.names']:
        z.read(name).decode('latin1')
    require((total_rows,total_exp,total_desc)==(9150,160,57),'PIONEER_TOTALS')
    return {'uciId':135,'denominatorClass':'SOURCE_DEFINED_PIONEER_EXPERIENCE',
      'denominatorUnits':160,'archiveMembers':6,'compressedObservationFiles':3,
      'perFile':per,'observationRows':9150,'sourceDefinedExperiences':160,
      'columnsPerObservation':38,'sampleIntervalMilliseconds':100,
      'symbolicDescriptionGroups':57,'malformedRows':0,'missingNumericValues':0,
      'anomalies':{'symbolicDescriptionsAreRepeatedDesignLabels':True,
        'publisherVisualDescriptionAccuracyCaveat':True,
        'independentOutcomeLabelsPresent':False},
      'episodeLikeSourceExperiences':160,'outsiderProspectiveEpisodes':0}

MOBILE_NESTED={
 'Bfsets.tar.Z':(7077888,{'BF_set1':669296,'BF_set2':509880,'BF_set3':433303,
                         'Measurements':5457827}),
 'Higherlevels.tar.Z':(24576,{'BasicActs':2431,'Opc-all.ex':1155,'PercFeat':2270,
                              'Piaf-all.ex':4459,'pdirections.bg':5060,'time-perc.bg':988}),
 'Pfeatures.tar.Z':(32768,{'Door.ex':6062,'SG.ex':19348}),
 'SGfeatures.tar.Z':(1015808,{'SG_concave.ex':38410,'SG_convex.ex':56289,
   'SG_jump.ex':87331,'SG_line.ex':567167,'sclass_123.bg':238222,'succ':20695}),
 'Sfeatures.tar.Z':(188416,{'S_concave.ex':12979,'S_convex.ex':16946,
                            'S_jump.ex':23695,'S_line.ex':125052})}
MOBILE_FACTS={'Bfsets.tar.Z/BF_set1':14261,'Bfsets.tar.Z/BF_set2':10336,
 'Bfsets.tar.Z/BF_set3':7693,'Bfsets.tar.Z/Measurements':81546,
 'Higherlevels.tar.Z/BasicActs':85,'Higherlevels.tar.Z/Opc-all.ex':30,
 'Higherlevels.tar.Z/PercFeat':50,'Higherlevels.tar.Z/Piaf-all.ex':65,
 'Higherlevels.tar.Z/pdirections.bg':54,'Higherlevels.tar.Z/time-perc.bg':12,
 'Pfeatures.tar.Z/Door.ex':156,'Pfeatures.tar.Z/SG.ex':362,
 'SGfeatures.tar.Z/SG_concave.ex':702,'SGfeatures.tar.Z/SG_convex.ex':1056,
 'SGfeatures.tar.Z/SG_jump.ex':1746,'SGfeatures.tar.Z/SG_line.ex':11509,
 'SGfeatures.tar.Z/sclass_123.bg':5964,'SGfeatures.tar.Z/succ':1320,
 'Sfeatures.tar.Z/S_concave.ex':363,'Sfeatures.tar.Z/S_convex.ex':490,
 'Sfeatures.tar.Z/S_jump.ex':728,'Sfeatures.tar.Z/S_line.ex':3802}

def parse_66(archive,gzip_binary):
    z=checked_zip(archive,{'Index':131,'mobile-robots.names':6619,
                           'mobile-robots.tar.gz':1528419})
    z.read('Index').decode('latin1');z.read('mobile-robots.names').decode('latin1')
    outer=tarfile.open(fileobj=io.BytesIO(z.read('mobile-robots.tar.gz')),mode='r:gz')
    outer_expected={'Bfsets.tar.Z':1347405,'Data.info':6613,'Higherlevels.tar.Z':6159,
      'Pfeatures.tar.Z':6388,'SGfeatures.tar.Z':144056,'Sfeatures.tar.Z':34046}
    members={m.name:m for m in outer.getmembers() if m.isfile()}
    require({n:m.size for n,m in members.items()}==outer_expected,'MOBILE_OUTER_TAR')
    info=outer.extractfile(members['Data.info']).read().decode('latin1')
    require('Learning Concepts from Sensor Data of a Mobile Robot' in info,'MOBILE_INFO')
    trace_sets={};fact_counts={};nested_count=0;measurements=None
    with tempfile.TemporaryDirectory(prefix='uci-mobile-replay-') as temporary:
      os.chmod(temporary,0o700)
      for archive_name,(tar_bytes,inventory) in MOBILE_NESTED.items():
        compressed=outer.extractfile(members[archive_name]).read()
        target=os.path.join(temporary,archive_name)
        fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as handle:handle.write(compressed)
        run=subprocess.run([gzip_binary,'-dc',target],stdout=subprocess.PIPE,
          stderr=subprocess.PIPE,timeout=60,env={'PATH':'/usr/bin:/bin'})
        require(run.returncode==0 and len(run.stdout)==tar_bytes,'MOBILE_UNCOMPRESS')
        nested=tarfile.open(fileobj=io.BytesIO(run.stdout),mode='r:')
        nested_members={m.name:m for m in nested.getmembers() if m.isfile()}
        require({n:m.size for n,m in nested_members.items()}==inventory,'MOBILE_NESTED_TAR')
        nested_count+=len(nested_members)
        for member_name,member in nested_members.items():
            raw=nested.extractfile(member).read();text=raw.decode('latin1')
            key=f'{archive_name}/{member_name}'
            traces=set(map(int,re.findall(r'\bt(\d+)\b',text)))
            facts=[line for line in text.splitlines() if line.strip()
                   and not line.lstrip().startswith(('%','#'))]
            trace_sets[key]=traces;fact_counts[key]=len(facts)
            if member_name=='Measurements':measurements=(text,facts)
    require(nested_count==22 and fact_counts==MOBILE_FACTS,'MOBILE_FACT_PROFILE')
    text,facts=measurements
    pattern=re.compile(r'^messung\(t(\d+),\s*(\d+),\s*s(\d+),\s*(.+)\)\.$')
    parsed=[];measurement_widths=collections.Counter()
    for line in facts:
        match=pattern.match(line.strip());require(match is not None,'MOBILE_MEASUREMENT_SCHEMA')
        values=match.groups(); numeric=[float(value.strip()) for value in values[3].split(',')]
        measurement_widths[len(numeric)]+=1
        require(all(math.isfinite(value) for value in numeric),'MOBILE_MEASUREMENT_FINITE')
        parsed.append(tuple(map(int,values[:3])))
    require(measurement_widths=={6:81536,5:10},'MOBILE_MEASUREMENT_WIDTHS')
    raw_traces=set(item[0] for item in parsed);all_traces=set().union(*trace_sets.values())
    raw_times=set((item[0],item[1]) for item in parsed);sensors=set(item[2] for item in parsed)
    require(len(parsed)==81546 and len(raw_traces)==78 and len(raw_times)==5529
            and sensors==set(range(24)) and len(all_traces)==83,'MOBILE_MEASUREMENTS')
    require([len(trace_sets[f'Bfsets.tar.Z/BF_set{i}']) for i in range(1,4)]
            ==[78,74,78],'MOBILE_BF_COVERAGE')
    return {'uciId':66,'denominatorClass':'MOBILE_ROBOT_TRACE','denominatorUnits':83,
      'outerZipMembers':3,'outerTarMembers':6,'legacyCompressArchives':5,
      'nestedReplayFiles':22,'rawMeasurementRows':81546,'rawMeasurementTraces':78,
      'higherLevelOnlyTraces':5,'mobileRobotTraces':83,'rawTraceTimePoints':5529,
      'sensorChannels':24,'numericFieldsPerMeasurement':{'six':81536,'five':10},
      'basicFeatureTraceCoverage':[78,74,78],
      'derivedFactCounts':dict(sorted(fact_counts.items())),
      'derivedFactsAdditive':False,
      'anomalies':{'legacyUnixCompressArchives':5,
        'derivedRepresentationsOverlapRawTraces':True,
        'basicFeatureSet2MissingRawTraces':4,'fiveNumericFieldMeasurementRows':10},
      'sourceDefinedEpisodes':0,'outsiderProspectiveEpisodes':0}

def parse_wall_rows(raw,width):
    rows=[]
    for line in raw.decode('ascii').splitlines():
        parts=[part.strip() for part in line.split(',')]
        require(len(parts)==width+1,'WALL_WIDTH')
        values=[float(value) for value in parts[:-1]]
        require(all(math.isfinite(value) for value in values),'WALL_FINITE')
        rows.append((values,parts[-1]))
    require(len(rows)==5456,'WALL_ROWS')
    return rows

def parse_194(archive):
    expected={'AllData.zip':320115,'Wall-Following_Robot_Navigation.zip':320115,
      'Wall-following.names':8706,'sensor_readings_2.data':150229,
      'sensor_readings_24.data':875878,'sensor_readings_4.data':221158}
    z=checked_zip(archive,expected)
    nested_expected={'sensor_readings_2.data':150229,'sensor_readings_4.data':221158,
      'sensor_readings_24.data':875878,'Wall-following.names':8706}
    all_data=z.read('AllData.zip');wall_zip=z.read('Wall-Following_Robot_Navigation.zip')
    require(all_data==wall_zip,'WALL_NESTED_ZIPS_DIFFER')
    for nested_bytes in [all_data,wall_zip]:
        nested=checked_zip(nested_bytes,nested_expected)
        for name in nested_expected:require(nested.read(name)==z.read(name),'WALL_NESTED_ROOT')
    rows2=parse_wall_rows(z.read('sensor_readings_2.data'),2)
    rows4=parse_wall_rows(z.read('sensor_readings_4.data'),4)
    rows24=parse_wall_rows(z.read('sensor_readings_24.data'),24)
    labels=collections.Counter()
    for index,((two,label2),(four,label4),(twenty_four,label24)) in enumerate(
            zip(rows2,rows4,rows24)):
        require(label2==label4==label24,'WALL_LABEL_ALIGNMENT')
        require(two==four[:2],'WALL_TWO_VIEW')
        expected_four=[min(twenty_four[10:15]),min(twenty_four[17:20]),
                       min(twenty_four[4:9]),min(twenty_four[22:24])]
        require(four==expected_four,'WALL_FOUR_VIEW')
        labels[label24]+=1
    expected_labels={'Move-Forward':2205,'Sharp-Right-Turn':2097,
      'Slight-Right-Turn':826,'Slight-Left-Turn':328}
    require(dict(labels)==expected_labels,'WALL_LABEL_COUNTS')
    z.read('Wall-following.names').decode('latin1')
    return {'uciId':194,'denominatorClass':'NAVIGATION_TIME_STEP',
      'denominatorUnits':5456,'outerArchiveMembers':6,'navigationTimeSteps':5456,
      'featureViewsPerTimeStep':3,'viewFeatureWidths':[2,4,24],
      'representationRowsNotAdditive':16368,'classClaims':dict(sorted(labels.items())),
      'twoFeatureViewMatchesFourFeaturePrefix':True,
      'fourFeatureViewMatchesTwentyFourSensorMinima':True,
      'archiveLevelCopiesOfEachRepresentation':3,
      'anomalies':{'byteIdenticalNestedZipAliases':2,
        'rootAndNestedRepresentationCopies':3,
        'representationsAreSameTimeStepsNotIndependentRows':True},
      'sourceDefinedEpisodes':0,'outsiderProspectiveEpisodes':0}

def main():
    require(len(sys.argv)==7,'ARGS')
    paths=sys.argv[1:6];gzip_binary=sys.argv[6]
    archives=[open(p,'rb').read() for p in paths]
    summaries=[parse_963(archives[0]),parse_138(archives[1]),parse_135(archives[2]),
               parse_66(archives[3],gzip_binary),parse_194(archives[4])]
    print(json.dumps({'schema':'outsider/uci-robotics-full-content-replay/v1',
      'sources':summaries},sort_keys=True,separators=(',',':')))

if __name__=='__main__':main()

`;

const EXPECTED_DENOMINATOR_POPULATIONS = Object.freeze([
  {
    uciId: 963,
    sourceName: "UR3 CobotOps",
    denominatorClass: "MECHANICAL_SYSTEM_OPERATION_ROW",
    units: 7409,
    populationType: "MECHANICAL_ROW",
    episodeStatus: "NOT_AN_EPISODE",
    unitDefinition: "ONE_XLSX_DATA_ROW_AFTER_HEADER",
  },
  {
    uciId: 138,
    sourceName: "Robot Execution Failures",
    denominatorClass: "POST_FAILURE_LEARNING_PROBLEM_WINDOW",
    units: 463,
    populationType: "POST_FAILURE_WINDOW",
    episodeStatus: "NOT_AN_EPISODE",
    unitDefinition: "ONE_SOURCE_LEARNING_PROBLEM_WINDOW_OF_15_FORCE_TORQUE_SAMPLES",
  },
  {
    uciId: 135,
    sourceName: "Pioneer-1 Mobile Robot Data",
    denominatorClass: "SOURCE_DEFINED_PIONEER_EXPERIENCE",
    units: 160,
    populationType: "SOURCE_DEFINED_EXPERIENCE",
    episodeStatus: "EPISODE_LIKE_NOT_OUTSIDER_PROSPECTIVE_EPISODE",
    unitDefinition: "ONE_CONTIGUOUS_SOURCE_EXPERIENCE_IDENTIFIER_SEGMENT",
  },
  {
    uciId: 66,
    sourceName: "Mobile Robots",
    denominatorClass: "MOBILE_ROBOT_TRACE",
    units: 83,
    populationType: "MOBILE_TRACE",
    episodeStatus: "NOT_AN_EPISODE",
    unitDefinition: "ONE_UNIQUE_TRACE_IDENTIFIER_ACROSS_RAW_AND_DERIVED_FILES",
  },
  {
    uciId: 194,
    sourceName: "Wall-Following Robot Navigation Data",
    denominatorClass: "NAVIGATION_TIME_STEP",
    units: 5456,
    populationType: "NAVIGATION_STEP",
    episodeStatus: "NOT_AN_EPISODE",
    unitDefinition: "ONE_ROW_ALIGNED_STEP_SHARED_BY_THE_2_4_AND_24_FEATURE_VIEWS",
  },
]);

const EXPECTED_RIGHTS_RECORDS = Object.freeze(PROFILES.map((profile) => ({
  uciId: profile.id,
  name: profile.name,
  doi: profile.doi,
  lastUpdated: profile.lastUpdated,
  licenseClaim: "CC-BY-4.0",
  licenseClaimSource: "UCI_OFFICIAL_DATASET_PAGE",
  licenseClaimBytePinnedInApiPayload: false,
  legalConclusion: false,
})));

const EXPECTED_SEGMENT_BOUNDARY = Object.freeze({
  additiveAcrossSources: false,
  additiveAcrossSegments: false,
  completeIndependentEpisodeIntersection: 0,
  opportunityCensus: {
    prospectiveOpportunityRecords: 0,
    independentlyObservedOpportunityRecords: 0,
  },
  delegationAuthorization: {
    delegationRecords: 0,
    authorityRecords: 0,
    authorizedRecords: 0,
  },
  action: {
    outsiderAuthorizedActionRecords: 0,
    actionsDispatchedByArtifact: 0,
    actionsExecutedByArtifact: 0,
  },
  effect: {
    independentPhysicalEffectRecords: 0,
    independentObjectStateEffectRecords: 0,
  },
  outcome: {
    independentOutcomeRecords: 0,
  },
  recovery: {
    independentRecoveryChains: 0,
  },
  longitudinal: {
    independentlyTrackedRecords: 0,
  },
});

const EXPECTED_TRAINING_BOUNDARY = Object.freeze({
  artifactUseBoundary: "OFFLINE_EVALUATION_AND_RESEARCH_ONLY",
  offlineEvaluationPerformed: true,
  offlineCorpusReplayPerformed: true,
  offlineModelFittingPerformed: false,
  offlineModelFittingRows: 0,
  authorizedTraining: false,
  authorizedTrainingRows: 0,
  authorizedTrainingJobs: 0,
  authorizedTrainingPerformed: false,
  productionTraining: false,
  productionTrainingRows: 0,
  policyOptimizationPerformed: false,
  modelWeightsProduced: false,
});

const EXPECTED_AUTHORITY_BOUNDARY = Object.freeze({
  delegationRecords: 0,
  networkContributionRecords: 0,
  authorityRecords: 0,
  authorizedActionRecords: 0,
  actionsDispatched: 0,
  actionsExecutedByArtifact: 0,
  independentOutcomeRecords: 0,
  longitudinalRecords: 0,
  CEURecords: 0,
  creditUnitsMinted: 0,
  productionTrainingRows: 0,
  authorityDelta: 0,
  executable: false,
});

const EXPECTED_PRIVACY_PROJECTION = Object.freeze({
  rawSourceTextProjectedRows: 0,
  rawTelemetryProjectedRows: 0,
  rawTelemetryProjectedValues: 0,
  humanIdentifierProjectedRows: 0,
  networkProjectionRows: 0,
  trainingProjectionRows: 0,
});

const EXPECTED_LIMITATIONS = Object.freeze({
  sourceNativeClassLabelsAreIndependentOutcomeTruth: false,
  forceTorqueWindowsEstablishUniquePhysicalFailures: false,
  mechanicalRowsEstablishEpisodes: false,
  pioneerExperienceSegmentsEstablishProspectiveDelegation: false,
  mobileTraceIdentifiersEstablishLongitudinalFollowUp: false,
  navigationDirectionLabelsEstablishAuthorizedActions: false,
  crossDomainAggregationAllowed: false,
});

export const UCI_ROBOTICS_MICRO_CORPUS_CONSTANTS = Object.freeze({
  datasetCount: 5,
  selectedRemoteFileCount: EXPECTED_REMOTE_FILES,
  selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
  archiveBytes: EXPECTED_ARCHIVE_BYTES,
  apiBytesPerBracket: EXPECTED_API_BYTES_PER_BRACKET,
  expectedFullReplayHash: EXPECTED_FULL_REPLAY_HASH,
  denominatorPopulations: EXPECTED_DENOMINATOR_POPULATIONS,
});

function fullReplayHash(replay) {
  return digest(FULL_REPLAY_SCHEMA + "/replay", replay);
}

function archivePath(sourceDirectory, profile) {
  return safeSourceTarget(sourceDirectory, profile, "download.zip");
}

export function extractUciRoboticsMicroCorpus(sourceDirectory, options = {}) {
  const checked = verifyUciRoboticsSourceDirectory(sourceDirectory);
  const pythonExecutable = options.pythonExecutable ?? ".venv/bin/python";
  const gzipBinary = options.gzipBinary ?? "/usr/bin/gzip";
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1
    || gzipBinary !== "/usr/bin/gzip") fail("REPLAY_EXECUTABLE_INVALID");
  const result = spawnSync(pythonExecutable, [
    "-c", PYTHON_REPLAY,
    ...PROFILES.map((profile) => archivePath(checked.sourceDirectory, profile)),
    gzipBinary,
  ], {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      PYTHONNOUSERSITE: "1",
      LC_ALL: "C",
    },
  });
  if (result.error || result.status !== 0 || result.signal != null) {
    fail("FULL_REPLAY_FAILED",
      result.error?.message ?? result.stderr?.trim() ?? ("status-" + result.status));
  }
  if (result.stderr !== "") fail("FULL_REPLAY_STDERR", result.stderr.trim());
  let replay;
  try { replay = JSON.parse(result.stdout); }
  catch { fail("FULL_REPLAY_JSON_INVALID"); }
  if (!exactObject(replay) || replay.schema !== FULL_REPLAY_SCHEMA
    || !Array.isArray(replay.sources) || replay.sources.length !== 5) {
    fail("FULL_REPLAY_STRUCTURE_INVALID");
  }
  if (!equalCanonical(replay.sources.map((entry) => ({
      uciId: entry.uciId,
      denominatorClass: entry.denominatorClass,
      denominatorUnits: entry.denominatorUnits,
    })), PROFILES.map((profile) => ({
      uciId: profile.id,
      denominatorClass: profile.denominatorClass,
      denominatorUnits: profile.denominatorUnits,
    })))) {
    fail("FULL_REPLAY_TYPED_POPULATION_INVALID");
  }
  const observedReplayHash = fullReplayHash(replay);
  if (observedReplayHash !== EXPECTED_FULL_REPLAY_HASH) {
    fail("FULL_REPLAY_PROFILE_INVALID", observedReplayHash);
  }
  return { checked, replay, replayHash: EXPECTED_FULL_REPLAY_HASH };
}

function buildReport(extracted) {
  const manifest = extracted.checked.manifest;
  const body = {
    schema: UCI_ROBOTICS_MICRO_CORPUS_SCHEMA,
    createdAt: UCI_ROBOTICS_FROZEN_AT,
    corpusBinding: {
      sourceAuthority: "UCI_MACHINE_LEARNING_REPOSITORY",
      selectedDatasetCount: 5,
      selectedUciIds: PROFILES.map((profile) => profile.id),
      sourceManifestHash: manifest.manifestHash,
      sourceManifestFileSha256: extracted.checked.manifestFileSha256,
    },
    sourceReplay: {
      verificationLevel: "FULL_BYTE_AND_CONTENT_REPLAY",
      fullSourceReplayRequired: true,
      fullSourceReplayPerformed: true,
      officialApiSnapshots: 10,
      officialArchives: 5,
      selectedRemoteFileCount: EXPECTED_REMOTE_FILES,
      selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
      archiveBytes: EXPECTED_ARCHIVE_BYTES,
      apiBytesPerBracket: EXPECTED_API_BYTES_PER_BRACKET,
      apiByteIdenticalWithinEachBeforeAfterBracket: true,
      executableNamedSourceMembers: 1,
      executableNamedSourceMembersExecuted: 0,
      transportAttested: false,
      replaySchema: FULL_REPLAY_SCHEMA,
      replayHash: extracted.replayHash,
      perSource: extracted.replay.sources,
    },
    declaredScope: {
      fiveNamedDatasetSelectionExhausted: true,
      exactArchiveAndApiBracketClosureExhausted: true,
      externalDiscoveryPerformed: false,
      uciRepositoryUniverseExhausted: false,
      globalExhaustion: false,
    },
    rightsAndUseClearance: {
      sourceClaims: EXPECTED_RIGHTS_RECORDS,
      allFiveOfficialDatasetPagesClaimCcBy40: true,
      apiPayloadsContainLicenseField: false,
      legalConclusion: false,
      privacyClearanceAdjudicated: false,
      revisionSpecificUseClearanceAdjudicated: false,
      productionUseClearanceAdjudicated: false,
      authorizedTrainingClearanceAdjudicated: false,
      artifactUseBoundary: "OFFLINE_EVALUATION_AND_RESEARCH_ONLY",
    },
    denominatorRegistry: {
      populations: EXPECTED_DENOMINATOR_POPULATIONS,
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
      representationRowsAcrossSourcesAdditive: false,
      sourceNativeRowsAndExperiencesCommensurate: false,
    },
    segmentCoverageAttribution: EXPECTED_SEGMENT_BOUNDARY,
    privacyAndProjection: EXPECTED_PRIVACY_PROJECTION,
    modelAndTrainingBoundary: EXPECTED_TRAINING_BOUNDARY,
    authorityBoundary: EXPECTED_AUTHORITY_BOUNDARY,
    limitations: EXPECTED_LIMITATIONS,
  };
  return { ...body,
    artifactHash: digest(UCI_ROBOTICS_MICRO_CORPUS_SCHEMA + "/artifact", body) };
}

export function buildUciRoboticsMicroCorpusFromSource(sourceDirectory, options = {}) {
  return buildReport(extractUciRoboticsMicroCorpus(sourceDirectory, options));
}

function addError(errors, condition, code) {
  if (!condition) errors.push(code);
}

function exactTopLevelKeys(report) {
  return exactObject(report) && equalCanonical(Object.keys(report).sort(), [
    "artifactHash", "authorityBoundary", "corpusBinding", "createdAt", "declaredScope",
    "denominatorRegistry", "limitations", "modelAndTrainingBoundary",
    "privacyAndProjection", "rightsAndUseClearance", "schema",
    "segmentCoverageAttribution", "sourceReplay",
  ].sort());
}

export function verifyUciRoboticsMicroCorpusReport(report) {
  const errors = [];
  try {
    addError(errors, exactTopLevelKeys(report), "TOP_LEVEL_SHAPE");
    if (!exactObject(report)) return { ok: false, errors };
    const { artifactHash, ...body } = report;
    addError(errors, report.schema === UCI_ROBOTICS_MICRO_CORPUS_SCHEMA, "SCHEMA");
    addError(errors, report.createdAt === UCI_ROBOTICS_FROZEN_AT, "CREATED_AT");
    addError(errors, HASH.test(artifactHash ?? "")
      && artifactHash === digest(UCI_ROBOTICS_MICRO_CORPUS_SCHEMA + "/artifact", body),
    "ARTIFACT_HASH");
    addError(errors, report.corpusBinding?.sourceAuthority
      === "UCI_MACHINE_LEARNING_REPOSITORY"
      && report.corpusBinding?.selectedDatasetCount === 5
      && equalCanonical(report.corpusBinding?.selectedUciIds, PROFILES.map((p) => p.id))
      && HASH.test(report.corpusBinding?.sourceManifestHash ?? "")
      && HASH.test(report.corpusBinding?.sourceManifestFileSha256 ?? ""), "CORPUS_BINDING");
    addError(errors, report.sourceReplay?.verificationLevel
      === "FULL_BYTE_AND_CONTENT_REPLAY"
      && report.sourceReplay?.fullSourceReplayRequired === true
      && report.sourceReplay?.fullSourceReplayPerformed === true
      && report.sourceReplay?.officialApiSnapshots === 10
      && report.sourceReplay?.officialArchives === 5
      && report.sourceReplay?.selectedRemoteFileCount === EXPECTED_REMOTE_FILES
      && report.sourceReplay?.selectedRemoteBytes === EXPECTED_REMOTE_BYTES
      && report.sourceReplay?.archiveBytes === EXPECTED_ARCHIVE_BYTES
      && report.sourceReplay?.apiBytesPerBracket === EXPECTED_API_BYTES_PER_BRACKET
      && report.sourceReplay?.apiByteIdenticalWithinEachBeforeAfterBracket === true
      && report.sourceReplay?.executableNamedSourceMembers === 1
      && report.sourceReplay?.executableNamedSourceMembersExecuted === 0
      && report.sourceReplay?.transportAttested === false
      && report.sourceReplay?.replaySchema === FULL_REPLAY_SCHEMA
      && report.sourceReplay?.replayHash === EXPECTED_FULL_REPLAY_HASH
      && fullReplayHash({ schema: report.sourceReplay?.replaySchema,
        sources: report.sourceReplay?.perSource }) === EXPECTED_FULL_REPLAY_HASH,
    "SOURCE_REPLAY");
    addError(errors, equalCanonical(report.declaredScope, {
      fiveNamedDatasetSelectionExhausted: true,
      exactArchiveAndApiBracketClosureExhausted: true,
      externalDiscoveryPerformed: false,
      uciRepositoryUniverseExhausted: false,
      globalExhaustion: false,
    }), "EXHAUSTION_BOUNDARY");
    addError(errors, equalCanonical(report.rightsAndUseClearance, {
      sourceClaims: EXPECTED_RIGHTS_RECORDS,
      allFiveOfficialDatasetPagesClaimCcBy40: true,
      apiPayloadsContainLicenseField: false,
      legalConclusion: false,
      privacyClearanceAdjudicated: false,
      revisionSpecificUseClearanceAdjudicated: false,
      productionUseClearanceAdjudicated: false,
      authorizedTrainingClearanceAdjudicated: false,
      artifactUseBoundary: "OFFLINE_EVALUATION_AND_RESEARCH_ONLY",
    }), "RIGHTS_AND_USE");
    addError(errors, equalCanonical(report.denominatorRegistry, {
      populations: EXPECTED_DENOMINATOR_POPULATIONS,
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
      representationRowsAcrossSourcesAdditive: false,
      sourceNativeRowsAndExperiencesCommensurate: false,
    }), "DENOMINATOR_BOUNDARY");
    addError(errors, equalCanonical(report.segmentCoverageAttribution,
      EXPECTED_SEGMENT_BOUNDARY), "SEGMENT_BOUNDARY");
    addError(errors, equalCanonical(report.privacyAndProjection,
      EXPECTED_PRIVACY_PROJECTION), "PRIVACY_PROJECTION");
    addError(errors, equalCanonical(report.modelAndTrainingBoundary,
      EXPECTED_TRAINING_BOUNDARY), "TRAINING_BOUNDARY");
    addError(errors, equalCanonical(report.authorityBoundary,
      EXPECTED_AUTHORITY_BOUNDARY), "AUTHORITY_BOUNDARY");
    addError(errors, equalCanonical(report.limitations, EXPECTED_LIMITATIONS), "LIMITATIONS");
  } catch (error) {
    errors.push("VERIFY_EXCEPTION:" + (error?.message ?? error));
  }
  return { ok: errors.length === 0, errors };
}

export function verifyUciRoboticsMicroCorpusWithSource(report, sourceDirectory, options = {}) {
  const reportCheck = verifyUciRoboticsMicroCorpusReport(report);
  const errors = [...reportCheck.errors];
  try {
    const rebuilt = buildUciRoboticsMicroCorpusFromSource(sourceDirectory, options);
    addError(errors, equalCanonical(rebuilt, report), "SOURCE_EXACT_REBUILD");
  } catch (error) {
    errors.push("SOURCE_REBUILD_EXCEPTION:" + (error?.message ?? error));
  }
  return { ok: errors.length === 0, errors };
}

export function buildUciRoboticsMicroCorpusRunReceipt(report, reportBytes,
  sourceManifestHash) {
  if (!Buffer.isBuffer(reportBytes) || !HASH.test(sourceManifestHash ?? "")
    || !verifyUciRoboticsMicroCorpusReport(report).ok
    || !reportBytes.equals(canonicalBytes(report))
    || report.corpusBinding.sourceManifestHash !== sourceManifestHash) {
    fail("RUN_RECEIPT_INPUT_INVALID");
  }
  const body = {
    schema: UCI_ROBOTICS_RUN_RECEIPT_SCHEMA,
    createdAt: UCI_ROBOTICS_FROZEN_AT,
    command: "node scripts/acquire-uci-robotics-micro-corpus.mjs",
    report: {
      path: "uci-robotics-micro-corpus.json",
      bytes: reportBytes.length,
      sha256: uciRoboticsSha256Bytes(reportBytes),
      artifactHash: report.artifactHash,
    },
    sourceManifestHash,
    sourceReplay: {
      exactSourceRebuildPerformed: true,
      replayHash: EXPECTED_FULL_REPLAY_HASH,
      selectedRemoteFileCount: EXPECTED_REMOTE_FILES,
      selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
    },
    denominatorBoundary: {
      typedPopulationCount: 5,
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
    },
    zeroClaimBoundary: {
      independentOutcomeRecords: 0,
      longitudinalRecords: 0,
      delegationRecords: 0,
      networkContributionRecords: 0,
      authorityRecords: 0,
      CEURecords: 0,
      authorizedTrainingRows: 0,
      productionTrainingRows: 0,
    },
    publication: {
      reportPublishedBeforeReceipt: true,
      receiptWrittenLast: true,
      filesMode: "0600",
      directoriesMode: "0700",
      noClobber: true,
    },
  };
  return { ...body,
    receiptHash: digest(UCI_ROBOTICS_RUN_RECEIPT_SCHEMA + "/receipt", body) };
}

export function verifyUciRoboticsMicroCorpusRunReceipt(receipt, reportBytes) {
  const errors = [];
  try {
    addError(errors, exactObject(receipt), "RECEIPT_NOT_OBJECT");
    if (!exactObject(receipt) || !Buffer.isBuffer(reportBytes)) {
      return { ok: false, errors };
    }
    const { receiptHash, ...body } = receipt;
    addError(errors, receipt.schema === UCI_ROBOTICS_RUN_RECEIPT_SCHEMA, "SCHEMA");
    addError(errors, receipt.createdAt === UCI_ROBOTICS_FROZEN_AT, "CREATED_AT");
    addError(errors, HASH.test(receiptHash ?? "")
      && receiptHash === digest(UCI_ROBOTICS_RUN_RECEIPT_SCHEMA + "/receipt", body),
    "RECEIPT_HASH");
    const report = safeJson(reportBytes, "RUN_REPORT_JSON_INVALID");
    const checked = verifyUciRoboticsMicroCorpusReport(report);
    addError(errors, checked.ok && reportBytes.equals(canonicalBytes(report)), "REPORT_BYTES");
    addError(errors, equalCanonical(receipt.report, {
      path: "uci-robotics-micro-corpus.json",
      bytes: reportBytes.length,
      sha256: uciRoboticsSha256Bytes(reportBytes),
      artifactHash: report.artifactHash,
    }), "REPORT_BINDING");
    addError(errors, receipt.sourceManifestHash === report.corpusBinding?.sourceManifestHash,
      "SOURCE_MANIFEST_BINDING");
    addError(errors, equalCanonical(receipt.sourceReplay, {
      exactSourceRebuildPerformed: true,
      replayHash: EXPECTED_FULL_REPLAY_HASH,
      selectedRemoteFileCount: EXPECTED_REMOTE_FILES,
      selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
    }), "SOURCE_REPLAY");
    addError(errors, equalCanonical(receipt.denominatorBoundary, {
      typedPopulationCount: 5,
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
    }), "DENOMINATOR_BOUNDARY");
    addError(errors, equalCanonical(receipt.zeroClaimBoundary, {
      independentOutcomeRecords: 0,
      longitudinalRecords: 0,
      delegationRecords: 0,
      networkContributionRecords: 0,
      authorityRecords: 0,
      CEURecords: 0,
      authorizedTrainingRows: 0,
      productionTrainingRows: 0,
    }), "ZERO_CLAIM_BOUNDARY");
    addError(errors, equalCanonical(receipt.publication, {
      reportPublishedBeforeReceipt: true,
      receiptWrittenLast: true,
      filesMode: "0600",
      directoriesMode: "0700",
      noClobber: true,
    }), "PUBLICATION_BOUNDARY");
  } catch (error) {
    errors.push("VERIFY_EXCEPTION:" + (error?.message ?? error));
  }
  return { ok: errors.length === 0, errors };
}
