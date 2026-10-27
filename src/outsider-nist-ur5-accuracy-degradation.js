/*
 * Full, byte-pinned intake for the official NIST UR5 position-accuracy data.
 *
 * The 18 controller traces, their header workbook and the six published
 * external position-deviation values are kept as separate populations.  This
 * module does not turn condition traces into episodes, mechanical evidence
 * into task outcomes, or public-information terms into training authority.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const NIST_UR5_DOI = "10.18434/M31962";
export const NIST_UR5_DOI_URL = "https://doi.org/10.18434/M31962";
export const NIST_UR5_LANDING_URL
  = "https://www.nist.gov/el/intelligent-systems-division-73500/"
  + "degradation-measurement-robot-arm-position-accuracy";
export const NIST_UR5_RIGHTS_URL = "https://www.nist.gov/copyrights-disclaimers";
export const NIST_UR5_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const NIST_UR5_SOURCE_SCHEMA = "outsider/nist-ur5-accuracy-pinned-source/v1";
export const NIST_UR5_REPORT_SCHEMA = "outsider/nist-ur5-accuracy-degradation/v1";
export const NIST_UR5_RECEIPT_SCHEMA
  = "outsider/nist-ur5-accuracy-degradation-run-receipt/v1";

const NIST_ORIGIN = "https://www.nist.gov";
const DATA_ROOT = `${NIST_ORIGIN}/system/files/documents/2017/11/09`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_HTML_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 180_000;
const RETRY_BACKOFF_MS = Object.freeze([1_000, 4_000]);
const RETRYABLE_STATUS = Object.freeze([408, 425, 429, 500, 502, 503, 504]);
const EXPECTED_REMOTE_BYTES = 220_388_109;
const EXPECTED_CSV_BYTES = 220_364_905;
const EXPECTED_TRACE_ROWS = 153_658;
const EXPECTED_TRACE_NUMERIC_VALUES = 11_217_034;

const FILES = Object.freeze([
  {
    filename: "ur5testresult_header.xlsx", kind: "CONTROLLER_HEADER_WORKBOOK",
    bytes: 14_915,
    sha256: "sha256:5e2ccc1ccf58bb91469b9260dafaddef05257a5f2c24dcc511e88a3d72721e52",
    lastModified: "Tue, 21 May 2019 01:59:06 GMT",
  },
  {
    filename: "calculated_deviation_of_actual_position_to_nominal_position.xlsx",
    kind: "EXTERNAL_POSITION_DEVIATION_WORKBOOK", bytes: 8_289,
    sha256: "sha256:b8a57454e9b0f0ccf105bbf8108b11d5718b3b4db4776f49aa188fbcd92a4fa9",
    lastModified: "Tue, 21 May 2019 01:59:06 GMT",
  },
  {
    filename: "ur5testresult_halfspeed_payload1.6lb_1.csv", kind: "CONTROLLER_TRACE",
    bytes: 11_411_094,
    sha256: "sha256:646d81a7b5943b5cfbeae65cf1ea7cbcaad1044c0ab6d6b9ed039ce18814c156",
    lastModified: "Tue, 21 May 2019 01:58:58 GMT",
    coldStart: false, speed: "HALF", payloadPounds: 1.6, replicate: 1,
    rows: 7_906, firstTime: 10_578.16, lastTime: 10_641.4,
  },
  {
    filename: "ur5testresult_halfspeed_payload1.6lb_2.csv", kind: "CONTROLLER_TRACE",
    bytes: 10_670_538,
    sha256: "sha256:e7901db7d6af42867eb6703a8af91fd9c6d1e0976caee509842996127663b7db",
    lastModified: "Tue, 21 May 2019 01:58:58 GMT",
    coldStart: false, speed: "HALF", payloadPounds: 1.6, replicate: 2,
    rows: 7_441, firstTime: 10_827.6, lastTime: 10_887.12,
  },
  {
    filename: "ur5testresult_halfspeed_payload1.6lb_3.csv", kind: "CONTROLLER_TRACE",
    bytes: 15_117_359,
    sha256: "sha256:ff6d0480cce23b412890b9b1f36ad960de5108349214b95a7a864b603bd2fcfe",
    lastModified: "Tue, 21 May 2019 01:58:58 GMT",
    coldStart: false, speed: "HALF", payloadPounds: 1.6, replicate: 3,
    rows: 10_440, firstTime: 11_812.56, lastTime: 11_896.072,
  },
  {
    filename: "ur5testresult_fullspeed_payload1.6lb_1_1.csv", kind: "CONTROLLER_TRACE",
    bytes: 12_243_436,
    sha256: "sha256:d4b160a0dd4ef0429e1fba627622f02c634caf9227e109fd2b51fcec3fed448d",
    lastModified: "Tue, 21 May 2019 01:58:59 GMT",
    coldStart: false, speed: "FULL", payloadPounds: 1.6, replicate: 1,
    rows: 8_663, firstTime: 12_063.672, lastTime: 12_132.968,
    pageTitleFilename: "ur5testresult_fullspeed_payload1.6lb_1.csv",
  },
  {
    filename: "ur5testresult_fullspeed_payload1.6lb_2.csv", kind: "CONTROLLER_TRACE",
    bytes: 9_568_382,
    sha256: "sha256:29f464afda53514de50995ab7c791537c054a19769eb596d9d63d8cf4ab0708c",
    lastModified: "Tue, 21 May 2019 01:59:06 GMT",
    coldStart: false, speed: "FULL", payloadPounds: 1.6, replicate: 2,
    rows: 6_793, firstTime: 12_200.584, lastTime: 12_254.92,
  },
  {
    filename: "ur5testresult_fullspeed_payload1.6lb_3.csv", kind: "CONTROLLER_TRACE",
    bytes: 9_862_515,
    sha256: "sha256:dc5dc6c0a6e093ce3bf06d39cd6a5ae310ea3d6f7afed57919fabfd82e10a482",
    lastModified: "Tue, 21 May 2019 01:58:59 GMT",
    coldStart: false, speed: "FULL", payloadPounds: 1.6, replicate: 3,
    rows: 6_980, firstTime: 12_282.6, lastTime: 12_338.432,
  },
  {
    filename: "ur5testresult_halfspeed_payload4.5lb_1.csv", kind: "CONTROLLER_TRACE",
    bytes: 14_791_864,
    sha256: "sha256:d62b0e8af1960dcbb7dd8cfd4b15b92dd371da12b0156b535335d369fd92b017",
    lastModified: "Tue, 21 May 2019 01:59:00 GMT",
    coldStart: false, speed: "HALF", payloadPounds: 4.5, replicate: 1,
    rows: 10_186, firstTime: 13_867.472, lastTime: 13_948.952,
  },
  {
    filename: "ur5testresult_halfspeed_payload4.5lb_2.csv", kind: "CONTROLLER_TRACE",
    bytes: 14_373_302,
    sha256: "sha256:d67fca1266ab465f2edaab7df4c08f0ce4121a6b1d3c0df17d24ad9fe6e78b0e",
    lastModified: "Tue, 21 May 2019 01:59:01 GMT",
    coldStart: false, speed: "HALF", payloadPounds: 4.5, replicate: 2,
    rows: 9_893, firstTime: 14_011.592, lastTime: 14_090.728,
  },
  {
    filename: "ur5testresult_halfspeed_payload4.5lb_3.csv", kind: "CONTROLLER_TRACE",
    bytes: 14_357_748,
    sha256: "sha256:41e84c0ffcda0c7b9e6c961d774cbf88fd643b45ec2b59eeb703780239c1f70c",
    lastModified: "Tue, 21 May 2019 01:59:01 GMT",
    coldStart: false, speed: "HALF", payloadPounds: 4.5, replicate: 3,
    rows: 9_884, firstTime: 14_142.928, lastTime: 14_221.992,
  },
  {
    filename: "ur5testresult_fullspeed_payload4.5lb_1.csv", kind: "CONTROLLER_TRACE",
    bytes: 9_747_943,
    sha256: "sha256:b33b6e0089544f29bc8ef614f7c11b582b6e756d1d6e60ec40d4bb27f98c2e15",
    lastModified: "Tue, 21 May 2019 01:59:02 GMT",
    coldStart: false, speed: "FULL", payloadPounds: 4.5, replicate: 1,
    rows: 6_933, firstTime: 14_339.12, lastTime: 14_394.576,
  },
  {
    filename: "ur5testresult_fullspeed_payload4.5lb_2.csv", kind: "CONTROLLER_TRACE",
    bytes: 9_242_755,
    sha256: "sha256:f533dd081cf7382ef762c6dd73e5fe3d227d6d023b2e7de0d3bddf7e56277523",
    lastModified: "Tue, 21 May 2019 01:59:02 GMT",
    coldStart: false, speed: "FULL", payloadPounds: 4.5, replicate: 2,
    rows: 6_487, firstTime: 14_424.352, lastTime: 14_476.24,
  },
  {
    filename: "ur5testresult_fullspeed_payload4.5lb_3.csv", kind: "CONTROLLER_TRACE",
    bytes: 11_909_570,
    sha256: "sha256:f6d0dcdfadc097492b9c97de42e130740fcbb1977470630315c4edc97d0d7d81",
    lastModified: "Tue, 21 May 2019 01:59:03 GMT",
    coldStart: false, speed: "FULL", payloadPounds: 4.5, replicate: 3,
    rows: 8_354, firstTime: 14_503.168, lastTime: 14_569.992,
  },
  {
    filename: "ur5testresult_coldstart_halfspeed_payload4.5lb_1.csv",
    kind: "CONTROLLER_TRACE", bytes: 14_996_879,
    sha256: "sha256:aeff969d17525ba2c1f5563cf860f16688a5c3ba834c4d3cc9433054a838f01d",
    lastModified: "Tue, 21 May 2019 01:59:03 GMT",
    coldStart: true, speed: "HALF", payloadPounds: 4.5, replicate: 1,
    rows: 10_322, firstTime: 306.168, lastTime: 388.736,
  },
  {
    filename: "ur5testresult_coldstart_halfspeed_payload4.5lb_2.csv",
    kind: "CONTROLLER_TRACE", bytes: 14_963_237,
    sha256: "sha256:20c1cd5b3042161506ac1becd18cbc79e60f486a3153775a60e4d8980532737e",
    lastModified: "Tue, 21 May 2019 01:59:04 GMT",
    coldStart: true, speed: "HALF", payloadPounds: 4.5, replicate: 2,
    rows: 10_359, firstTime: 513.888, lastTime: 596.752,
  },
  {
    filename: "ur5testresult_coldstart_halfspeed_payload4.5lb_3.csv",
    kind: "CONTROLLER_TRACE", bytes: 14_899_967,
    sha256: "sha256:ebc5fa2fe3ff857ed77cc93c8a82b5191584d24e9a31d7cf36cb6a89563b83e4",
    lastModified: "Tue, 21 May 2019 01:59:04 GMT",
    coldStart: true, speed: "HALF", payloadPounds: 4.5, replicate: 3,
    rows: 10_277, firstTime: 628.368, lastTime: 710.576,
  },
  {
    filename: "ur5testresult_coldstart_fullspeed_payload4.5lb_1.csv",
    kind: "CONTROLLER_TRACE", bytes: 9_910_398,
    sha256: "sha256:fcda4b4747bb760dae59e27b3ed470970fc706ea5c592e797b44a7ad6f0e60d6",
    lastModified: "Tue, 21 May 2019 01:59:05 GMT",
    coldStart: true, speed: "FULL", payloadPounds: 4.5, replicate: 1,
    rows: 7_010, firstTime: 747.248, lastTime: 803.32,
  },
  {
    filename: "ur5testresult_coldstart_fullspeed_payload4.5lb_2.csv",
    kind: "CONTROLLER_TRACE", bytes: 9_787_834,
    sha256: "sha256:b482f163e81214a73b27c9beaa7a15996ce685072e6f77ac428b96d2cf6388e7",
    lastModified: "Tue, 21 May 2019 01:59:05 GMT",
    coldStart: true, speed: "FULL", payloadPounds: 4.5, replicate: 2,
    rows: 6_931, firstTime: 838.496, lastTime: 893.936,
  },
  {
    filename: "ur5testresult_coldstart_fullspeed_payload4.5lb_3.csv",
    kind: "CONTROLLER_TRACE", bytes: 12_510_084,
    sha256: "sha256:036efe90197d4bd8c5c44787c751dbfc4bfbdfd56575a67cb91e5a1580edf2b9",
    lastModified: "Tue, 21 May 2019 01:59:06 GMT",
    coldStart: true, speed: "FULL", payloadPounds: 4.5, replicate: 3,
    rows: 8_799, firstTime: 918.52, lastTime: 988.904,
  },
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `NIST_UR5_${code}` : `NIST_UR5_${code}:${detail}`);
}

export function nistUr5Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return nistUr5Sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
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

function strictUtf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}

function htmlDecode(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&nbsp;", " ")
    .replaceAll("&#039;", "'").replaceAll("&quot;", '"');
}

function metaContent(text, attribute, value, code) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const expression = new RegExp(`<meta[^>]+${attribute}="${escaped}"[^>]+content="([^"]+)"`, "u");
  const match = text.match(expression);
  if (!match) fail(code);
  return htmlDecode(match[1]);
}

function landingProjection(bytes) {
  const text = strictUtf8(bytes, "LANDING_UTF8_INVALID");
  const links = [];
  const expression = /<a[^>]+data-file-url="([^"]+)"[^>]+title="([^"]+)"[^>]*>([^<]+)<\/a>/gu;
  for (const match of text.matchAll(expression)) {
    links.push({ pathname: htmlDecode(match[1]), title: htmlDecode(match[2]),
      linkText: htmlDecode(match[3]).replace(/\s+/gu, " ").trim() });
  }
  const expectedPaths = FILES.map((profile) => `/system/files/documents/2017/11/09/${profile.filename}`);
  if (links.length !== 20 || !equalCanonical(links.map((item) => item.pathname), expectedPaths)) {
    fail("LANDING_FILE_LINKS_CHANGED");
  }
  const mismatch = links.find((item) => item.pathname.endsWith(
    "/ur5testresult_fullspeed_payload1.6lb_1_1.csv"));
  if (mismatch?.title !== "ur5testresult_fullspeed_payload1.6lb_1.csv") {
    fail("LANDING_TITLE_PATH_MISMATCH_CHANGED");
  }
  const markers = [
    `<link rel="canonical" href="${NIST_UR5_LANDING_URL}" />`,
    "<title>Degradation Measurement of Robot Arm Position Accuracy | NIST</title>",
    "This page is no longer being updated and the information may be out of date.",
    "measured by a 7-D measurement system developed at NIST",
    "Differences are compared from the nominal positions to the measured positions.",
    "Data are collected at 125HZ.",
    "actual and joint positions, velocities, currents, accelerations, torques, and temperatures",
  ];
  if (!markers.every((marker) => text.includes(marker))) fail("LANDING_SEMANTICS_CHANGED");
  return {
    canonicalUrl: NIST_UR5_LANDING_URL,
    title: "Degradation Measurement of Robot Arm Position Accuracy | NIST",
    publishedAt: metaContent(text, "property", "article:published_time", "LANDING_PUBLISHED_MISSING"),
    modifiedAt: metaContent(text, "property", "article:modified_time", "LANDING_MODIFIED_MISSING"),
    stalePageWarningPresent: true,
    nistDevelopedSevenDimensionalMeasurementSystemDescribed: true,
    nominalVersusMeasuredTcpPositionDifferenceDescribed: true,
    controllerSamplingRateHz: 125,
    linkedRemoteObjectCount: links.length,
    linkedRemoteObjects: links,
    pageTitleAndDataPathMismatchPreserved: true,
  };
}

function rightsProjection(bytes) {
  const text = strictUtf8(bytes, "RIGHTS_UTF8_INVALID");
  const markers = [
    `<link rel="canonical" href="${NIST_UR5_RIGHTS_URL}" />`,
    "<title>Copyrights &amp; Disclaimers | NIST</title>",
    "With the exception of material marked as copyrighted, information presented on NIST sites are considered public information and may be distributed or copied.",
    "Use of appropriate byline/photo/image credits is requested.",
    "Some material, software, etc., may have their own disclaimers",
    "NIST makes no warranties to that effect",
  ];
  if (!markers.every((marker) => text.includes(marker))) fail("RIGHTS_SEMANTICS_CHANGED");
  return {
    canonicalUrl: NIST_UR5_RIGHTS_URL,
    title: "Copyrights & Disclaimers | NIST",
    modifiedAt: metaContent(text, "property", "article:modified_time", "RIGHTS_MODIFIED_MISSING"),
    publicInformationDistributionStatementPresent: true,
    exceptionForMaterialMarkedCopyrighted: true,
    appropriateCreditRequested: true,
    productSpecificDisclaimersMayApply: true,
    dataWarrantyDisclaimed: true,
    spdxLicenseIdentifier: null,
  };
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function checkedUrl(value, allowDoi = false) {
  let parsed;
  try { parsed = new URL(value); } catch { fail("URL_INVALID", value); }
  const allowed = parsed.protocol === "https:"
    && (parsed.hostname === "www.nist.gov" || allowDoi && parsed.hostname === "doi.org")
    && parsed.username === "" && parsed.password === "" && parsed.hash === "";
  if (!allowed) fail("URL_NOT_ALLOWED", value);
  return parsed;
}

async function requestWithRetry(url, options, fetchImpl) {
  checkedUrl(url, url === NIST_UR5_DOI_URL);
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(url, { ...options, redirect: "follow", signal: controller.signal,
        headers: { "accept-encoding": "identity", "user-agent": "outsider-nist-ur5/1.0",
          ...(options.headers ?? {}) } });
    } catch (error) {
      clearTimeout(timeout);
      if (attempt < RETRY_BACKOFF_MS.length) {
        await pause(RETRY_BACKOFF_MS[attempt]);
        continue;
      }
      fail("FETCH_TRANSPORT_FAILED", `${url}:${error?.cause?.code ?? error?.message ?? error}`);
    }
    if (!response.ok) {
      clearTimeout(timeout);
      if (RETRYABLE_STATUS.includes(response.status) && attempt < RETRY_BACKOFF_MS.length) {
        try { await response.body?.cancel?.(); } catch { /* bounded retry */ }
        await pause(RETRY_BACKOFF_MS[attempt]);
        continue;
      }
      fail(`FETCH_HTTP_${response.status}`, url);
    }
    return { response, finish: () => clearTimeout(timeout) };
  }
  fail("FETCH_RETRY_EXHAUSTED", url);
}

async function boundedGet(url, maximumBytes, fetchImpl) {
  const pending = await requestWithRetry(url, { method: "GET", headers: {
    accept: "text/html, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream;q=0.8",
  } }, fetchImpl);
  const { response } = pending;
  try {
    const final = new URL(response.url);
    if (final.hostname !== "www.nist.gov" || response.headers.get("content-encoding") !== null) {
      fail("FETCH_FINAL_OR_ENCODING_INVALID", url);
    }
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximumBytes)) {
      fail("FETCH_DECLARED_SIZE_INVALID", url);
    }
    const reader = response.body?.getReader?.();
    if (!reader) fail("FETCH_BODY_MISSING", url);
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        fail("FETCH_STREAM_LIMIT", url);
      }
      chunks.push(Buffer.from(value));
    }
    if (total < 1) fail("FETCH_EMPTY", url);
    return { bytes: Buffer.concat(chunks, total), finalUrl: final.toString(),
      contentType: response.headers.get("content-type") };
  } finally {
    pending.finish();
  }
}

function expectedHead(profile) {
  return {
    url: `${DATA_ROOT}/${profile.filename}`,
    finalUrl: `${DATA_ROOT}/${profile.filename}`,
    status: 200,
    contentLength: profile.bytes,
    contentType: profile.kind === "CONTROLLER_TRACE" ? "text/csv; charset=UTF-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    lastModified: profile.lastModified,
    acceptRanges: "bytes",
    contentEncoding: null,
  };
}

async function fetchHead(profile, fetchImpl) {
  const url = `${DATA_ROOT}/${profile.filename}`;
  const pending = await requestWithRetry(url,
    { method: "HEAD", headers: { accept: "*/*" } }, fetchImpl);
  try {
    const { response } = pending;
    const observed = {
      url, finalUrl: response.url, status: response.status,
      contentLength: Number(response.headers.get("content-length")),
      contentType: response.headers.get("content-type"),
      lastModified: response.headers.get("last-modified"),
      acceptRanges: response.headers.get("accept-ranges"),
      contentEncoding: response.headers.get("content-encoding"),
    };
    if (!equalCanonical(observed, expectedHead(profile))) fail("HEAD_PROFILE_CHANGED", profile.filename);
    try { await response.body?.cancel?.(); } catch { /* HEAD has no body */ }
    return observed;
  } finally { pending.finish(); }
}

async function doiResolution(fetchImpl) {
  const pending = await requestWithRetry(NIST_UR5_DOI_URL,
    { method: "HEAD", headers: { accept: "text/html" } }, fetchImpl);
  try {
    const { response } = pending;
    const projection = { doi: NIST_UR5_DOI, initialUrl: NIST_UR5_DOI_URL,
      finalUrl: response.url, status: response.status,
      contentType: response.headers.get("content-type")?.split(";")[0] ?? null };
    if (!equalCanonical(projection, { doi: NIST_UR5_DOI, initialUrl: NIST_UR5_DOI_URL,
      finalUrl: NIST_UR5_LANDING_URL, status: 200, contentType: "text/html" })) {
      fail("DOI_RESOLUTION_CHANGED");
    }
    try { await response.body?.cancel?.(); } catch { /* HEAD has no body */ }
    return projection;
  } finally { pending.finish(); }
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function binding(relativePath, bytes) {
  return { path: relativePath, bytes: bytes.length, sha256: nistUr5Sha256(bytes) };
}

function publicProfile(profile) {
  return {
    filename: profile.filename, kind: profile.kind, bytes: profile.bytes,
    sha256: profile.sha256, lastModified: profile.lastModified,
    ...(profile.kind === "CONTROLLER_TRACE" ? {
      coldStart: profile.coldStart, speed: profile.speed,
      payloadPounds: profile.payloadPounds, replicate: profile.replicate,
      rows: profile.rows, firstControllerTimeSeconds: profile.firstTime,
      lastControllerTimeSeconds: profile.lastTime,
      ...(profile.pageTitleFilename ? { pageTitleFilename: profile.pageTitleFilename } : {}),
    } : {}),
  };
}

export async function acquirePinnedNistUr5Source(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const progress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.tmp-`
    + `${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    progress({ phase: "BRACKET_BEFORE" });
    const doiBefore = await doiResolution(fetchImpl);
    const landingBeforeFetched = boundedGet(NIST_UR5_LANDING_URL, MAX_HTML_BYTES, fetchImpl);
    const rightsBeforeFetched = boundedGet(NIST_UR5_RIGHTS_URL, MAX_HTML_BYTES, fetchImpl);
    const [landingBefore, rightsBefore] = await Promise.all([landingBeforeFetched, rightsBeforeFetched]);
    if (landingBefore.finalUrl !== NIST_UR5_LANDING_URL
      || rightsBefore.finalUrl !== NIST_UR5_RIGHTS_URL) fail("OFFICIAL_PAGE_REDIRECT_CHANGED");
    const landingBeforeProjection = landingProjection(landingBefore.bytes);
    const rightsBeforeProjection = rightsProjection(rightsBefore.bytes);
    const remoteObjects = [];
    for (let index = 0; index < FILES.length; index += 1) {
      const profile = FILES[index];
      progress({ phase: "FILE", index: index + 1, total: FILES.length,
        filename: profile.filename, bytes: profile.bytes });
      const before = await fetchHead(profile, fetchImpl);
      const fetched = await boundedGet(`${DATA_ROOT}/${profile.filename}`, profile.bytes, fetchImpl);
      if (fetched.finalUrl !== `${DATA_ROOT}/${profile.filename}`
        || fetched.bytes.length !== profile.bytes
        || nistUr5Sha256(fetched.bytes) !== profile.sha256) {
        fail("REMOTE_FILE_BYTES_CHANGED", profile.filename);
      }
      const after = await fetchHead(profile, fetchImpl);
      if (!equalCanonical(before, after)) fail("HEAD_CHANGED_DURING_FETCH", profile.filename);
      const dataPath = `files/${profile.filename}`;
      const beforePath = `heads-before/${profile.filename}.json`;
      const afterPath = `heads-after/${profile.filename}.json`;
      const beforeBytes = canonicalBytes(before);
      const afterBytes = canonicalBytes(after);
      writePrivate(path.join(temporary, dataPath), fetched.bytes);
      writePrivate(path.join(temporary, beforePath), beforeBytes);
      writePrivate(path.join(temporary, afterPath), afterBytes);
      remoteObjects.push({ ...publicProfile(profile), url: `${DATA_ROOT}/${profile.filename}`,
        storedPath: dataPath, headBefore: binding(beforePath, beforeBytes),
        headAfter: binding(afterPath, afterBytes), headStableDuringFetch: true });
    }
    progress({ phase: "BRACKET_AFTER" });
    const doiAfter = await doiResolution(fetchImpl);
    const landingAfterFetched = boundedGet(NIST_UR5_LANDING_URL, MAX_HTML_BYTES, fetchImpl);
    const rightsAfterFetched = boundedGet(NIST_UR5_RIGHTS_URL, MAX_HTML_BYTES, fetchImpl);
    const [landingAfter, rightsAfter] = await Promise.all([landingAfterFetched, rightsAfterFetched]);
    if (landingAfter.finalUrl !== NIST_UR5_LANDING_URL
      || rightsAfter.finalUrl !== NIST_UR5_RIGHTS_URL) fail("OFFICIAL_PAGE_REDIRECT_CHANGED");
    const landingAfterProjection = landingProjection(landingAfter.bytes);
    const rightsAfterProjection = rightsProjection(rightsAfter.bytes);
    if (!equalCanonical(doiBefore, doiAfter)
      || !equalCanonical(landingBeforeProjection, landingAfterProjection)
      || !equalCanonical(rightsBeforeProjection, rightsAfterProjection)) {
      fail("OFFICIAL_RECORD_CHANGED_DURING_ACQUISITION");
    }
    const supportBytes = {
      "doi-before.json": canonicalBytes(doiBefore), "doi-after.json": canonicalBytes(doiAfter),
      "landing-before.html": landingBefore.bytes, "landing-after.html": landingAfter.bytes,
      "rights-before.html": rightsBefore.bytes, "rights-after.html": rightsAfter.bytes,
    };
    for (const [name, bytes] of Object.entries(supportBytes)) writePrivate(path.join(temporary, name), bytes);
    const support = Object.entries(supportBytes).sort(([left], [right]) => left.localeCompare(right))
      .map(([name, bytes]) => binding(name, bytes));
    const sourceRootBindings = [
      ...support,
      ...remoteObjects.flatMap((item) => [
        { path: item.storedPath, bytes: item.bytes, sha256: item.sha256 },
        item.headBefore, item.headAfter,
      ]),
    ].sort((left, right) => left.path.localeCompare(right.path));
    const sourceRoot = digest(`${NIST_UR5_SOURCE_SCHEMA}/source-root`, sourceRootBindings);
    const manifestBody = {
      schema: NIST_UR5_SOURCE_SCHEMA, capturedAt: NIST_UR5_FROZEN_AT,
      sourceAuthority: "NATIONAL_INSTITUTE_OF_STANDARDS_AND_TECHNOLOGY",
      doi: NIST_UR5_DOI, doiUrl: NIST_UR5_DOI_URL,
      landingPageUrl: NIST_UR5_LANDING_URL, rightsPageUrl: NIST_UR5_RIGHTS_URL,
      declaredOfficialPageObjectScopeExhausted: true,
      nistSiteUniverseExhausted: false, globalExhaustion: false,
      selectedRemoteObjectCount: FILES.length,
      selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
      controllerCsvBytes: EXPECTED_CSV_BYTES,
      everyRemoteObjectHeadBracketed: true,
      officialPageAndRightsSemanticsBracketed: true,
      rawOfficialHtmlBytesMayContainDynamicRequestTokens: true,
      exactHtmlByteEqualityRequiredAcrossBrackets: false,
      landingProjection: landingBeforeProjection,
      rightsProjection: rightsBeforeProjection,
      boundedRetryPolicy: { maximumAttemptsPerRequest: 3,
        perAttemptTimeoutMilliseconds: FETCH_TIMEOUT_MS,
        backoffMilliseconds: RETRY_BACKOFF_MS, retryableHttpStatuses: RETRYABLE_STATUS },
      transportAttested: false, support, remoteObjects, sourceRoot,
    };
    const manifest = { ...manifestBody,
      manifestHash: digest(`${NIST_UR5_SOURCE_SCHEMA}/manifest`, manifestBody) };
    writePrivate(path.join(temporary, "acquisition-manifest.json"), canonicalBytes(manifest));
    renameSync(temporary, target);
    return { sourceDirectory: target, manifest,
      manifestFileSha256: nistUr5Sha256(readFileSync(path.join(target, "acquisition-manifest.json"))),
      sourceRoot };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function recursiveEntries(root, relative = "") {
  const files = [];
  const directories = [relative];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail("SOURCE_SYMLINK", child);
    if (entry.isDirectory()) {
      const nested = recursiveEntries(root, child);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else if (entry.isFile()) files.push(child);
    else fail("SOURCE_SPECIAL_FILE", child);
  }
  return { files: files.sort(), directories: directories.sort() };
}

function stableRead(file, expectedBytes, maximumBytes = expectedBytes) {
  const initial = lstatSync(file, { bigint: true });
  if (!initial.isFile() || initial.isSymbolicLink()
    || initial.size !== BigInt(expectedBytes) || expectedBytes < 1
    || expectedBytes > maximumBytes || (Number(initial.mode) & 0o777) !== 0o600) {
    fail("SOURCE_FILE_UNSAFE", file);
  }
  const descriptor = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(file, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || before.dev !== finalPath.dev || before.ino !== finalPath.ino
      || before.size !== finalPath.size || before.mtimeNs !== finalPath.mtimeNs
      || before.ctimeNs !== finalPath.ctimeNs || bytes.length !== expectedBytes) {
      fail("SOURCE_FILE_CHANGED", file);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function assertPrivateDirectories(root, directories) {
  for (const relative of directories) {
    const directory = relative === "" ? root : path.join(root, relative);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) {
      fail("SOURCE_DIRECTORY_UNSAFE", relative);
    }
  }
}

function expectedSourceFiles() {
  return [
    "acquisition-manifest.json", "doi-before.json", "doi-after.json",
    "landing-before.html", "landing-after.html", "rights-before.html", "rights-after.html",
    ...FILES.flatMap((profile) => [
      `files/${profile.filename}`, `heads-before/${profile.filename}.json`,
      `heads-after/${profile.filename}.json`,
    ]),
  ].sort();
}

function readSupport(root, name, maximumBytes) {
  const target = path.join(root, name);
  const size = statSync(target).size;
  if (!Number.isSafeInteger(size) || size < 1 || size > maximumBytes) {
    fail("SUPPORT_SIZE_INVALID", name);
  }
  return stableRead(target, size, maximumBytes);
}

function reconstructSource(root) {
  const doiExpected = { doi: NIST_UR5_DOI, initialUrl: NIST_UR5_DOI_URL,
    finalUrl: NIST_UR5_LANDING_URL, status: 200, contentType: "text/html" };
  const supportBytes = {
    "doi-before.json": readSupport(root, "doi-before.json", 4_096),
    "doi-after.json": readSupport(root, "doi-after.json", 4_096),
    "landing-before.html": readSupport(root, "landing-before.html", MAX_HTML_BYTES),
    "landing-after.html": readSupport(root, "landing-after.html", MAX_HTML_BYTES),
    "rights-before.html": readSupport(root, "rights-before.html", MAX_HTML_BYTES),
    "rights-after.html": readSupport(root, "rights-after.html", MAX_HTML_BYTES),
  };
  const doiBefore = safeJson(supportBytes["doi-before.json"], "DOI_BEFORE_JSON_INVALID");
  const doiAfter = safeJson(supportBytes["doi-after.json"], "DOI_AFTER_JSON_INVALID");
  if (!equalCanonical(doiBefore, doiExpected) || !equalCanonical(doiAfter, doiExpected)) {
    fail("DOI_BRACKET_INVALID");
  }
  const landingBeforeProjection = landingProjection(supportBytes["landing-before.html"]);
  const landingAfterProjection = landingProjection(supportBytes["landing-after.html"]);
  const rightsBeforeProjection = rightsProjection(supportBytes["rights-before.html"]);
  const rightsAfterProjection = rightsProjection(supportBytes["rights-after.html"]);
  if (!equalCanonical(landingBeforeProjection, landingAfterProjection)
    || !equalCanonical(rightsBeforeProjection, rightsAfterProjection)) {
    fail("SEMANTIC_BRACKET_INVALID");
  }
  const support = Object.entries(supportBytes).sort(([left], [right]) => left.localeCompare(right))
    .map(([name, bytes]) => binding(name, bytes));
  const remoteObjects = FILES.map((profile) => {
    const storedPath = `files/${profile.filename}`;
    const bytes = stableRead(path.join(root, storedPath), profile.bytes);
    if (nistUr5Sha256(bytes) !== profile.sha256) fail("REMOTE_OBJECT_HASH_INVALID", profile.filename);
    const beforePath = `heads-before/${profile.filename}.json`;
    const afterPath = `heads-after/${profile.filename}.json`;
    const expected = expectedHead(profile);
    const expectedBytes = canonicalBytes(expected);
    const beforeBytes = stableRead(path.join(root, beforePath), expectedBytes.length, 4_096);
    const afterBytes = stableRead(path.join(root, afterPath), expectedBytes.length, 4_096);
    if (!beforeBytes.equals(expectedBytes) || !afterBytes.equals(expectedBytes)) {
      fail("STORED_HEAD_INVALID", profile.filename);
    }
    return { ...publicProfile(profile), url: `${DATA_ROOT}/${profile.filename}`, storedPath,
      headBefore: binding(beforePath, beforeBytes), headAfter: binding(afterPath, afterBytes),
      headStableDuringFetch: true };
  });
  const sourceRootBindings = [
    ...support,
    ...remoteObjects.flatMap((item) => [
      { path: item.storedPath, bytes: item.bytes, sha256: item.sha256 },
      item.headBefore, item.headAfter,
    ]),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const sourceRoot = digest(`${NIST_UR5_SOURCE_SCHEMA}/source-root`, sourceRootBindings);
  return { support, remoteObjects, sourceRoot,
    landingProjection: landingBeforeProjection, rightsProjection: rightsBeforeProjection };
}

function expectedManifestBody(reconstructed) {
  return {
    schema: NIST_UR5_SOURCE_SCHEMA, capturedAt: NIST_UR5_FROZEN_AT,
    sourceAuthority: "NATIONAL_INSTITUTE_OF_STANDARDS_AND_TECHNOLOGY",
    doi: NIST_UR5_DOI, doiUrl: NIST_UR5_DOI_URL,
    landingPageUrl: NIST_UR5_LANDING_URL, rightsPageUrl: NIST_UR5_RIGHTS_URL,
    declaredOfficialPageObjectScopeExhausted: true,
    nistSiteUniverseExhausted: false, globalExhaustion: false,
    selectedRemoteObjectCount: FILES.length, selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
    controllerCsvBytes: EXPECTED_CSV_BYTES, everyRemoteObjectHeadBracketed: true,
    officialPageAndRightsSemanticsBracketed: true,
    rawOfficialHtmlBytesMayContainDynamicRequestTokens: true,
    exactHtmlByteEqualityRequiredAcrossBrackets: false,
    landingProjection: reconstructed.landingProjection,
    rightsProjection: reconstructed.rightsProjection,
    boundedRetryPolicy: { maximumAttemptsPerRequest: 3,
      perAttemptTimeoutMilliseconds: FETCH_TIMEOUT_MS,
      backoffMilliseconds: RETRY_BACKOFF_MS, retryableHttpStatuses: RETRYABLE_STATUS },
    transportAttested: false, support: reconstructed.support,
    remoteObjects: reconstructed.remoteObjects, sourceRoot: reconstructed.sourceRoot,
  };
}

export function verifyNistUr5SourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("SOURCE_DIRECTORY_UNSAFE");
  const entries = recursiveEntries(root);
  assertPrivateDirectories(root, entries.directories);
  if (!equalCanonical(entries.files, expectedSourceFiles())) fail("SOURCE_FILE_SET_INVALID");
  const manifestPath = path.join(root, "acquisition-manifest.json");
  const manifestSize = statSync(manifestPath).size;
  if (!Number.isSafeInteger(manifestSize) || manifestSize < 1
    || manifestSize > MAX_MANIFEST_BYTES) fail("MANIFEST_SIZE_INVALID");
  const manifestBytes = stableRead(manifestPath, manifestSize, MAX_MANIFEST_BYTES);
  const manifest = safeJson(manifestBytes, "MANIFEST_JSON_INVALID");
  if (!exactObject(manifest) || !HASH.test(manifest.manifestHash ?? "")) {
    fail("MANIFEST_SHAPE_INVALID");
  }
  const reconstructed = reconstructSource(root);
  const expectedBody = expectedManifestBody(reconstructed);
  const { manifestHash, ...observedBody } = manifest;
  if (!equalCanonical(observedBody, expectedBody)
    || manifestHash !== digest(`${NIST_UR5_SOURCE_SCHEMA}/manifest`, expectedBody)) {
    fail("MANIFEST_CONTENT_INVALID");
  }
  return { ok: true, sourceDirectory: root, manifest,
    manifestFileSha256: nistUr5Sha256(manifestBytes), sourceRoot: reconstructed.sourceRoot,
    verificationLevel: "FULL_SOURCE_BYTE_REPLAY",
    verifiedRemoteObjectCount: FILES.length, verifiedRemoteBytes: EXPECTED_REMOTE_BYTES };
}

const PYTHON_REPLAY = String.raw`
import ast, json, math, os, re, statistics, sys, zipfile
import xml.etree.ElementTree as ET

def require(ok, code):
    if not ok: raise ValueError(code)

def inventory(book):
    require(book.testzip() is None, 'XLSX_CRC')
    return {i.filename:(i.file_size,i.compress_size,format(i.CRC,'08x')) for i in book.infolist()}

HEADER_INVENTORY={
 '[Content_Types].xml':(1304,356,'ddde1812'),'_rels/.rels':(588,244,'233055b5'),
 'xl/_rels/workbook.xml.rels':(839,250,'61a6a94a'),'xl/workbook.xml':(943,494,'7776d9de'),
 'xl/styles.xml':(10376,1306,'2677db74'),'xl/worksheets/sheet2.xml':(25415,4384,'55afd21e'),
 'xl/theme/theme1.xml':(6796,1683,'69993e75'),'xl/worksheets/sheet1.xml':(6007,1377,'f20835c7'),
 'xl/sharedStrings.xml':(5138,1000,'53f47ae4'),'docProps/core.xml':(593,322,'6aa839cc'),
 'docProps/app.xml':(820,401,'8c124ff9')}
DEVIATION_INVENTORY={
 '[Content_Types].xml':(1168,350,'689dee62'),'_rels/.rels':(588,244,'233055b5'),
 'xl/_rels/workbook.xml.rels':(698,243,'97943e81'),'xl/workbook.xml':(875,467,'d50d7716'),
 'xl/sharedStrings.xml':(472,247,'513cb432'),'xl/theme/theme1.xml':(6796,1683,'69993e75'),
 'xl/styles.xml':(1540,662,'6deb889f'),'xl/worksheets/sheet1.xml':(1849,703,'1d5f14ad'),
 'docProps/core.xml':(593,323,'2ab13f99'),'docProps/app.xml':(785,393,'10094961')}
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def shared_strings(book):
    root=ET.fromstring(book.read('xl/sharedStrings.xml'))
    return [''.join((t.text or '') for t in item.findall('.//m:t',NS)) for item in root]

def col_index(reference):
    match=re.match(r'[A-Z]+',reference);require(match is not None,'XLSX_CELL_REF')
    result=0
    for char in match.group(0):result=result*26+ord(char)-64
    return result-1

def sheet_rows(book,name,columns):
    shared=shared_strings(book);root=ET.fromstring(book.read(name))
    require(not root.findall('.//m:f',NS),'XLSX_FORMULA_PRESENT')
    rows=[]
    for row_node in root.findall('.//m:sheetData/m:row',NS):
        row=[None]*columns
        for cell in row_node.findall('m:c',NS):
            index=col_index(cell.get('r'));require(index<columns,'XLSX_COLUMN_RANGE')
            typ=cell.get('t');value=cell.find('m:v',NS)
            if typ=='inlineStr':parsed=''.join((t.text or '') for t in cell.findall('.//m:t',NS))
            elif value is None:parsed=None
            elif typ=='s':parsed=shared[int(value.text)]
            elif typ in ('str','e'):parsed=value.text or ''
            elif typ=='b':parsed=value.text=='1'
            else:
                parsed=float(value.text)
                if parsed.is_integer():parsed=int(parsed)
            row[index]=parsed
        rows.append(row)
    return rows

def workbook_sheets(book):
    root=ET.fromstring(book.read('xl/workbook.xml'))
    return [item.get('name') for item in root.findall('.//m:sheets/m:sheet',NS)]

def parse_header(path):
    with zipfile.ZipFile(path) as book:
        require(inventory(book)==HEADER_INVENTORY,'HEADER_XLSX_INVENTORY')
        require(workbook_sheets(book)==['header','header details'],'HEADER_SHEET_NAMES')
        header=sheet_rows(book,'xl/worksheets/sheet1.xml',73)
        details_raw=sheet_rows(book,'xl/worksheets/sheet2.xml',21)
    require(len(details_raw)==44 and all(all(value is None for value in row[8:])
            for row in details_raw[:14]) and all(all(value is None for value in row)
            for row in details_raw[14:]),'HEADER_FORMATTING_TAIL')
    details=[row[:8] for row in details_raw[:14]]
    groups=[
      ('ROBOT_TARGET_JOINT_POSITIONS','joint'),('ROBOT_ACTUAL_JOINT_POSITIONS','joint'),
      ('ROBOT_TARGET_JOINT_VELOCITIES','joint'),('ROBOT_ACTUAL_JOINT_VELOCITIES','joint'),
      ('ROBOT_TARGET_JOITN_CURRENT','joint'),('ROBOT_ACTUAL_JOINT_CURRENT','joint'),
      ('ROBOT_TARGET_JOINT_ACCELERATIONS','joint'),('ROBOT_TARGET_JOINT_TORQUES','joint'),
      ('ROBOT_JOINT_CONTROL_CURRENT','joint'),('ROBOT_CARTESIAN_COORD_TOOL','cartesian'),
      ('ROBOT_TCP_FORCE','cartesian'),('ROBOT_JOINT_TEMP','joint')]
    expected=['ROBOT_TIME']
    for base,kind in groups:
        suffixes=['J1','J2','J3','J4','J5','J6'] if kind=='joint' else ['x','y','z','rx','ry','rz']
        expected.extend([base+' ('+suffix+')' for suffix in suffixes])
    require(header==[expected],'HEADER_COLUMNS')
    require(len(details)==14 and details[0][0]=='colume' and details[0][1]=='Meaning'
            and details[1][1]=='ROBOT_TIME' and details[-1][1]=='ROBOT_JOINT_TEMP',
            'HEADER_DETAILS')
    require([row[3] for row in details[1:]]==[1]+[6]*12,'HEADER_GROUP_WIDTHS')
    return {'workbookSheets':['header','header details'],'headerColumns':73,
      'scalarTimeColumns':1,'sixAxisFieldGroups':12,
      'fieldGroups':[base for base,unused in groups],
      'publisherTypoPreserved':'ROBOT_TARGET_JOITN_CURRENT',
      'tcpForceHeaderMeaning':details[12][7],
      'jointTemperatureUnit':'degrees celsius','formulaCells':0}

def parse_deviation(path):
    with zipfile.ZipFile(path) as book:
        require(inventory(book)==DEVIATION_INVENTORY,'DEVIATION_XLSX_INVENTORY')
        require(workbook_sheets(book)==['Sheet1'],'DEVIATION_SHEET_NAMES')
        rows=sheet_rows(book,'xl/worksheets/sheet1.xml',2)
    require(len(rows)==8 and rows[0]==['Calculated deviation of actual position to nominal position',None]
            and rows[1]==['Position ','delta Distance (mm)'],'DEVIATION_HEADER')
    labels=[row[0] for row in rows[2:]];values=[row[1] for row in rows[2:]]
    require(labels==['position 1','position 2','position 3','position 4','position 5','position 6'],
            'DEVIATION_LABELS')
    expected=[0.15620499351813308,0.16309506430300091,0.18973665961010278,
              0.1739798838946618,0.145568164921976,0.125643375224737]
    require(all(abs(a-b)<1e-15 for a,b in zip(values,expected)),'DEVIATION_VALUES')
    return {'workbookSheets':['Sheet1'],'publishedRecordCount':6,
      'publishedMeasure':'delta Distance (mm)','positionLabels':labels,
      'deltaDistanceMillimeters':values,'minimumMillimeters':min(values),
      'maximumMillimeters':max(values),'rawSevenDimensionalMeasurementRowsPublished':0,
      'formulaCells':0}

def rounded(value):return round(value,12)

def parse_trace(root,profile):
    filename=profile['filename'];raw=open(os.path.join(root,'files',filename),'rb').read()
    require(raw.count(b'\x00')==0 and raw.count(b'\n')==profile['rows']-1
            and raw.count(b'\r\n')==profile['rows']-1
            and not raw.endswith((b'\n',b'\r')),'TRACE_NEWLINES')
    text=raw.decode('ascii');lines=text.split('\r\n');require(len(lines)==profile['rows'],'TRACE_ROWS')
    first=last=previous=None;temperatures=[];start_temp=end_temp=None
    for line in lines:
        value=ast.literal_eval(line)
        require(type(value) is tuple and len(value)==13,'TRACE_OUTER_SHAPE')
        require(all(type(group) is list for group in value),'TRACE_GROUP_TYPE')
        require([len(group) for group in value]==[1]+[6]*12,'TRACE_GROUP_WIDTHS')
        flat=[item for group in value for item in group]
        require(all(type(item) in (int,float) and math.isfinite(item) for item in flat),
                'TRACE_NUMERIC_VALUE')
        current=float(value[0][0])
        if first is None:first=current;start_temp=[float(item) for item in value[12]]
        if previous is not None:require(abs((current-previous)-0.008)<=2e-9,'TRACE_INTERVAL')
        previous=current;last=current;end_temp=[float(item) for item in value[12]]
        temperatures.extend(float(item) for item in value[12])
    require(abs(first-profile['firstTime'])<2e-9 and abs(last-profile['lastTime'])<2e-9,
            'TRACE_TIME_RANGE')
    start_mean=statistics.fmean(start_temp);end_mean=statistics.fmean(end_temp)
    return {'filename':filename,'coldStart':profile['coldStart'],'speed':profile['speed'],
      'payloadPounds':profile['payloadPounds'],'replicate':profile['replicate'],
      'rows':profile['rows'],'numericValues':profile['rows']*73,
      'pythonTupleListRows':profile['rows'],'groupsPerRow':13,'valuesPerRow':73,
      'firstControllerTimeSeconds':rounded(first),'lastControllerTimeSeconds':rounded(last),
      'durationSeconds':rounded(last-first),'strictlyIncreasingControllerTime':True,
      'sampleIntervalSeconds':0.008,'sampleRateHz':125,'nonFiniteValues':0,
      'startJointTemperaturesC':[rounded(item) for item in start_temp],
      'endJointTemperaturesC':[rounded(item) for item in end_temp],
      'startJointTemperatureMeanC':rounded(start_mean),
      'endJointTemperatureMeanC':rounded(end_mean),
      'jointTemperatureMeanDeltaC':rounded(end_mean-start_mean),
      'minimumJointTemperatureC':rounded(min(temperatures)),
      'maximumJointTemperatureC':rounded(max(temperatures)),
      'lineTermination':{'betweenRows':'CRLF','finalLineTerminatorPresent':False}}

root=os.path.abspath(sys.argv[1]);profiles=json.loads(sys.argv[2])
header=parse_header(os.path.join(root,'files','ur5testresult_header.xlsx'))
deviation=parse_deviation(os.path.join(root,'files','calculated_deviation_of_actual_position_to_nominal_position.xlsx'))
traces=[parse_trace(root,profile) for profile in profiles]
require(sum(item['rows'] for item in traces)==153658,'TRACE_TOTAL_ROWS')
require(sum(item['numericValues'] for item in traces)==11217034,'TRACE_TOTAL_VALUES')
cells={}
for item in traces:
    key=('COLD_START' if item['coldStart'] else 'REGULAR')+'|'+item['speed']+'|'+str(item['payloadPounds'])
    cells.setdefault(key,[]).append(item)
condition_cells=[]
for key,items in sorted(cells.items()):
    require(sorted(item['replicate'] for item in items)==[1,2,3],'CONDITION_REPLICATES')
    state,speed,payload=key.split('|')
    condition_cells.append({'thermalProtocol':state,'speed':speed,'payloadPounds':float(payload),
      'traceCount':3,'sampleRows':sum(item['rows'] for item in items),
      'replicates':[item['replicate'] for item in sorted(items,key=lambda x:x['replicate'])]})
require(len(condition_cells)==6,'CONDITION_CELL_COUNT')
result={'schema':'outsider/nist-ur5-full-content-replay/v1','headerWorkbook':header,
 'externalDeviationWorkbook':deviation,'controllerTraces':traces,
 'conditionCells':condition_cells,'totals':{'controllerTraceFiles':18,
 'controllerSampleRows':153658,'controllerNumericValues':11217034,
 'externalPositionDeviationRecords':6}}
print(json.dumps(result,separators=(',',':'),sort_keys=True,allow_nan=False))
`;

function pythonTraceProfiles() {
  return FILES.filter((profile) => profile.kind === "CONTROLLER_TRACE").map((profile) => ({
    filename: profile.filename, coldStart: profile.coldStart, speed: profile.speed,
    payloadPounds: profile.payloadPounds, replicate: profile.replicate, rows: profile.rows,
    firstTime: profile.firstTime, lastTime: profile.lastTime,
  }));
}

export function extractNistUr5AccuracySource(sourceDirectory, options = {}) {
  const checked = verifyNistUr5SourceDirectory(sourceDirectory);
  const pythonExecutable = options.pythonExecutable ?? "python3";
  const run = spawnSync(pythonExecutable,
    ["-c", PYTHON_REPLAY, checked.sourceDirectory, JSON.stringify(pythonTraceProfiles())],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 300_000,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONHASHSEED: "0" } });
  if (run.error || run.status !== 0 || run.signal !== null) {
    fail("CONTENT_REPLAY_FAILED", `${run.error?.message ?? run.signal ?? run.status}:`
      + `${String(run.stderr ?? "").trim().slice(-1_000)}`);
  }
  let replay;
  try { replay = JSON.parse(run.stdout); } catch { fail("CONTENT_REPLAY_JSON_INVALID"); }
  if (replay?.schema !== "outsider/nist-ur5-full-content-replay/v1"
    || replay?.totals?.controllerTraceFiles !== 18
    || replay?.totals?.controllerSampleRows !== EXPECTED_TRACE_ROWS
    || replay?.totals?.controllerNumericValues !== EXPECTED_TRACE_NUMERIC_VALUES
    || replay?.totals?.externalPositionDeviationRecords !== 6) {
    fail("CONTENT_REPLAY_PROFILE_INVALID");
  }
  return { source: checked, replay,
    replayHash: digest("outsider/nist-ur5-full-content-replay/v1/replay", replay) };
}

function denominatorRegistry() {
  return {
    populations: [
      { denominatorClass: "MECHANICAL_CONDITION_CONTROLLER_TRACE", units: 18,
        sourceComponent: "18 official controller CSV files", unitDefinition:
          "one published speed/payload/thermal-protocol replicate trace" },
      { denominatorClass: "MECHANICAL_CONTROLLER_SAMPLE_ROW", units: EXPECTED_TRACE_ROWS,
        sourceComponent: "rows inside the 18 controller traces", unitDefinition:
          "one 125 Hz controller sample with 73 numeric values" },
      { denominatorClass: "EXTERNAL_TCP_POSITION_DEVIATION_RECORD", units: 6,
        sourceComponent: "calculated-deviation workbook", unitDefinition:
          "one publisher-calculated nominal-to-measured position distance" },
    ],
    sampleRowsAreAdditionalTraces: false,
    deviationRecordsAreAdditionalControllerTraces: false,
    externalDeviationRecordsAreRawSevenDimensionalSamples: false,
    crossDomainTotal: null,
    crossDomainAdditionProhibited: true,
  };
}

function segmentCoverage() {
  return {
    opportunityCensus: { records: 0, completeProspectiveCensus: false },
    delegationAuthorization: { delegationRecords: 0, authorityRecords: 0 },
    preAction: { strictDelegationCompleteIntersection: 0 },
    action: { outsiderAuthorizedActionTraces: 0, sourceControllerConditionTraces: 18 },
    effect: { controllerTelemetryTraces: 18, externalPositionDeviationRecords: 6,
      nistDescribedExternalMeasurementSystem: true,
      rawExternalSevenDimensionalMeasurementRowsPublished: 0,
      independentTaskEffectWitnessRecords: 0 },
    outcome: { taskOutcomeRecords: 0, independentOutcomeRecords: 0 },
    recovery: { recoveryAttempts: 0, independentlyVerifiedRecoveryChains: 0 },
    longitudinal: { taskOutcomeFollowupRecords: 0, deployedUnitLongitudinalEpisodes: 0 },
    segmentsAreNonAdditive: true,
  };
}

function rightsPrivacyAndUse(manifest) {
  return {
    rights: {
      termsIdentifier: "NIST_PUBLIC_INFORMATION_TERMS",
      officialTermsUrl: NIST_UR5_RIGHTS_URL,
      nistPublicInformationDistributionStatementPresent: true,
      exceptionForMaterialMarkedCopyrighted: true,
      appropriateCreditRequested: true,
      productSpecificDisclaimersMayApply: true,
      dataWarrantyDisclaimed: true,
      spdxLicenseIdentifier: null,
      datasetSpecificLicenseFilePublished: false,
      legalConclusion: false,
    },
    privacy: {
      releasedFilesAreNumericRobotTelemetryAndTwoTechnicalWorkbooks: true,
      audioFiles: 0, videoFiles: 0, imageFiles: 0,
      rawHumanCommunicationRows: 0,
      publisherPrivacyGuaranteePresent: false,
      useSpecificPrivacyClearance: "NOT_PROVIDED",
    },
    revision: {
      doi: NIST_UR5_DOI,
      immutablePublisherRevisionIdentifier: null,
      everyReleasedDataObjectBytePinned: true,
      everyReleasedDataObjectHeadBracketed: true,
      officialPageModifiedAt: manifest.landingProjection.modifiedAt,
      fileLastModifiedRange: {
        earliest: "Tue, 21 May 2019 01:58:58 GMT",
        latest: "Tue, 21 May 2019 01:59:06 GMT",
      },
      officialPageWarnsInformationMayBeOutOfDate: true,
      bytePinCompensatesForMissingImmutablePublisherRevision: true,
      nistSiteUniverseExhausted: false,
      globalExhaustion: false,
    },
    use: {
      admittedUse: "OFFLINE_EVALUATION_AND_RESEARCH_ONLY",
      publicTermsAreNotDelegatedTrainingAuthority: true,
      productionTrainingAuthorized: false,
      authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0,
      authorizedTrainingPerformed: 0,
    },
  };
}

function modelTrainingBoundary() {
  return {
    offlineDescriptiveAnalysisPerformed: true,
    offlineModelFittingPerformed: false,
    offlineModelFittingRows: 0,
    authorizedTraining: false,
    authorizedTrainingRows: 0,
    authorizedTrainingJobs: 0,
    authorizedTrainingPerformed: 0,
    productionTrainingRows: 0,
  };
}

function authorityBoundary() {
  return {
    rawUserCommunicationRecords: 0,
    networkContributionRecords: 0,
    CEURecords: 0,
    outsiderExecutedActions: 0,
    delegationRecords: 0,
    authorityRecords: 0,
    authorityDelta: 0,
  };
}

function buildReportBody(extracted) {
  const { source, replay, replayHash } = extracted;
  return {
    schema: NIST_UR5_REPORT_SCHEMA,
    generatedAt: NIST_UR5_FROZEN_AT,
    source: {
      authority: "NATIONAL_INSTITUTE_OF_STANDARDS_AND_TECHNOLOGY",
      doi: NIST_UR5_DOI, doiUrl: NIST_UR5_DOI_URL,
      landingPageUrl: NIST_UR5_LANDING_URL,
      rightsPageUrl: NIST_UR5_RIGHTS_URL,
      officialPageTitle: source.manifest.landingProjection.title,
      officialPageModifiedAt: source.manifest.landingProjection.modifiedAt,
      officialPageStaleWarningPresent: true,
      linkedDataObjects: 20, fullOfficialLinkedDataObjectClosure: true,
    },
    declaredScope: {
      description: "all 20 data objects linked by the pinned NIST M31962 landing page",
      candidateCount: 20, admittedCount: 20, excludedCount: 0,
      declaredScopeExhausted: true, externalDiscoveryPerformed: false,
      nistSiteUniverseExhausted: false, globalExhaustion: false,
    },
    population: {
      controllerConditionTraceFiles: 18,
      controllerSampleRows: EXPECTED_TRACE_ROWS,
      controllerNumericValues: EXPECTED_TRACE_NUMERIC_VALUES,
      externalPositionDeviationRecords: 6,
      sourceDefinedTaskEpisodes: 0,
      outsiderProspectiveEpisodes: 0,
    },
    conditionAndTelemetryEvidence: {
      design: {
        conditionCells: 6, replicatesPerConditionCell: 3,
        regularConditionCells: 4, coldStartConditionCells: 2,
        speedLevels: ["HALF", "FULL"], regularPayloadPounds: [1.6, 4.5],
        coldStartPayloadPounds: [4.5], publisherSamplingRateHz: 125,
        conditionLabelsArePublisherExperimentalSettings: true,
        monotonicMechanicalDegradationGroundTruthPublished: false,
      },
      controllerSchema: replay.headerWorkbook,
      conditionCells: replay.conditionCells,
      traces: replay.controllerTraces,
      controllerTcpForceIsPublisherControllerChannelNotExternalForceSensor: true,
      allTraceValuesFinite: true,
      everyTraceUsesStrictEightMillisecondIntervals: true,
    },
    externalPositionEvidence: {
      publisherSystemDescription: {
        nistDevelopedSevenDimensionalMeasurementSystem: true,
        measuredTcpCoordinates: ["x", "y", "z"],
        comparedNominalToMeasuredPositions: true,
      },
      releasedWorkbook: replay.externalDeviationWorkbook,
      independentlyLocatedFromControllerTelemetry: true,
      releasedValuesArePublisherCalculatedDistances: true,
      rawSevenDimensionalObservationsPresent: false,
      taskOutcomeSemanticsPresent: false,
    },
    denominatorRegistry: denominatorRegistry(),
    segmentCoverageAttribution: segmentCoverage(),
    rightsPrivacyRevisionAndUse: rightsPrivacyAndUse(source.manifest),
    modelAndTrainingBoundary: modelTrainingBoundary(),
    authorityBoundary: authorityBoundary(),
    limitations: {
      conditionTraceIsNotTaskEpisode: true,
      calculatedPositionDeviationIsNotTaskOutcome: true,
      externalMeasurementSystemDescriptionDoesNotPublishRawSevenDimensionalRows: true,
      speedPayloadAndColdStartSettingsDoNotEstablishProgressiveFaultTruth: true,
      controllerClockRangesDoNotEstablishSameUnitLongitudinalFollowup: true,
      officialLandingPageWarnsInformationMayBeOutOfDate: true,
      noImmutablePublisherRevisionBeyondBytePins: true,
      noDelegationRecoveryAuthorityOrTrainingClearance: true,
    },
    sourceReplay: {
      verificationLevel: "FULL_SOURCE_REDERIVED",
      sourceManifestHash: source.manifest.manifestHash,
      sourceManifestFileSha256: source.manifestFileSha256,
      sourceRoot: source.sourceRoot,
      replayHash,
      selectedRemoteObjectCount: 20,
      selectedRemoteBytes: EXPECTED_REMOTE_BYTES,
      controllerCsvBytes: EXPECTED_CSV_BYTES,
      controllerTraceRows: EXPECTED_TRACE_ROWS,
      controllerNumericValues: EXPECTED_TRACE_NUMERIC_VALUES,
    },
  };
}

export function buildNistUr5AccuracyDegradationFromSource(sourceDirectory, options = {}) {
  const body = buildReportBody(extractNistUr5AccuracySource(sourceDirectory, options));
  return Object.freeze({ ...body,
    artifactHash: digest(`${NIST_UR5_REPORT_SCHEMA}/artifact`, body) });
}

function addError(errors, condition, code) {
  if (!condition) errors.push(code);
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export function verifyNistUr5AccuracyDegradationReport(report) {
  const errors = [];
  try {
    addError(errors, exactObject(report), "REPORT_SHAPE");
    if (!exactObject(report)) return Object.freeze({ ok: false, errors });
    const { artifactHash, ...body } = report;
    addError(errors, report.schema === NIST_UR5_REPORT_SCHEMA
      && report.generatedAt === NIST_UR5_FROZEN_AT
      && artifactHash === digest(`${NIST_UR5_REPORT_SCHEMA}/artifact`, body),
    "ARTIFACT_BINDING");
    addError(errors, report.source?.doi === NIST_UR5_DOI
      && report.source?.landingPageUrl === NIST_UR5_LANDING_URL
      && report.source?.linkedDataObjects === 20
      && report.source?.fullOfficialLinkedDataObjectClosure === true
      && report.source?.officialPageStaleWarningPresent === true,
    "SOURCE_BOUNDARY");
    addError(errors, report.declaredScope?.candidateCount === 20
      && report.declaredScope?.admittedCount === 20
      && report.declaredScope?.excludedCount === 0
      && report.declaredScope?.declaredScopeExhausted === true
      && report.declaredScope?.externalDiscoveryPerformed === false
      && report.declaredScope?.nistSiteUniverseExhausted === false
      && report.declaredScope?.globalExhaustion === false,
    "SCOPE_BOUNDARY");
    addError(errors, equalCanonical(report.population, {
      controllerConditionTraceFiles: 18, controllerSampleRows: EXPECTED_TRACE_ROWS,
      controllerNumericValues: EXPECTED_TRACE_NUMERIC_VALUES,
      externalPositionDeviationRecords: 6, sourceDefinedTaskEpisodes: 0,
      outsiderProspectiveEpisodes: 0,
    }), "POPULATION_BOUNDARY");
    addError(errors, equalCanonical(report.denominatorRegistry, denominatorRegistry()),
      "DENOMINATOR_BOUNDARY");
    addError(errors, equalCanonical(report.segmentCoverageAttribution, segmentCoverage()),
      "SEGMENT_BOUNDARY");
    const condition = report.conditionAndTelemetryEvidence;
    addError(errors, condition?.design?.conditionCells === 6
      && condition?.design?.replicatesPerConditionCell === 3
      && condition?.design?.monotonicMechanicalDegradationGroundTruthPublished === false
      && condition?.controllerSchema?.headerColumns === 73
      && Array.isArray(condition?.traces) && condition.traces.length === 18
      && condition.traces.reduce((sum, item) => sum + item.rows, 0) === EXPECTED_TRACE_ROWS
      && condition.traces.every((item) => item.sampleRateHz === 125
        && item.valuesPerRow === 73 && item.nonFiniteValues === 0
        && item.strictlyIncreasingControllerTime === true)
      && condition?.controllerTcpForceIsPublisherControllerChannelNotExternalForceSensor === true,
    "CONDITION_EVIDENCE_BOUNDARY");
    const external = report.externalPositionEvidence;
    addError(errors, external?.publisherSystemDescription
      ?.nistDevelopedSevenDimensionalMeasurementSystem === true
      && equalCanonical(external.publisherSystemDescription.measuredTcpCoordinates,
        ["x", "y", "z"])
      && external?.releasedWorkbook?.publishedRecordCount === 6
      && external?.releasedWorkbook?.rawSevenDimensionalMeasurementRowsPublished === 0
      && external?.independentlyLocatedFromControllerTelemetry === true
      && external?.rawSevenDimensionalObservationsPresent === false
      && external?.taskOutcomeSemanticsPresent === false,
    "EXTERNAL_MEASUREMENT_BOUNDARY");
    const rights = report.rightsPrivacyRevisionAndUse;
    addError(errors, rights?.rights?.termsIdentifier === "NIST_PUBLIC_INFORMATION_TERMS"
      && rights?.rights?.spdxLicenseIdentifier === null
      && rights?.rights?.legalConclusion === false
      && rights?.privacy?.publisherPrivacyGuaranteePresent === false
      && rights?.privacy?.useSpecificPrivacyClearance === "NOT_PROVIDED"
      && rights?.revision?.immutablePublisherRevisionIdentifier === null
      && rights?.revision?.globalExhaustion === false
      && rights?.use?.productionTrainingAuthorized === false
      && rights?.use?.authorizedTrainingRows === 0
      && rights?.use?.authorizedTrainingJobs === 0
      && rights?.use?.authorizedTrainingPerformed === 0,
    "RIGHTS_PRIVACY_TRAINING_BOUNDARY");
    addError(errors, equalCanonical(report.modelAndTrainingBoundary, modelTrainingBoundary()),
      "MODEL_TRAINING_BOUNDARY");
    addError(errors, equalCanonical(report.authorityBoundary, authorityBoundary()),
      "AUTHORITY_BOUNDARY");
    addError(errors, HASH.test(report.sourceReplay?.sourceManifestHash ?? "")
      && HASH.test(report.sourceReplay?.sourceManifestFileSha256 ?? "")
      && HASH.test(report.sourceReplay?.sourceRoot ?? "")
      && HASH.test(report.sourceReplay?.replayHash ?? "")
      && report.sourceReplay?.verificationLevel === "FULL_SOURCE_REDERIVED"
      && report.sourceReplay?.selectedRemoteObjectCount === 20
      && report.sourceReplay?.selectedRemoteBytes === EXPECTED_REMOTE_BYTES
      && report.sourceReplay?.controllerTraceRows === EXPECTED_TRACE_ROWS,
    "SOURCE_REPLAY_BOUNDARY");
  } catch (error) { errors.push(`VERIFY_EXCEPTION:${safeError(error)}`); }
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function verifyNistUr5AccuracyDegradationWithSource(report, sourceDirectory,
  options = {}) {
  const errors = [...verifyNistUr5AccuracyDegradationReport(report).errors];
  try {
    const rebuilt = buildNistUr5AccuracyDegradationFromSource(sourceDirectory, options);
    addError(errors, equalCanonical(rebuilt, report), "SOURCE_EXACT_REBUILD");
  } catch (error) { errors.push(`SOURCE_REBUILD_EXCEPTION:${safeError(error)}`); }
  return Object.freeze({ ok: errors.length === 0, errors,
    verificationLevel: errors.length === 0 ? "FULL_SOURCE_REDERIVED" : null });
}

export function buildNistUr5AccuracyDegradationRunReceipt(report, reportBytes) {
  if (!Buffer.isBuffer(reportBytes) || !reportBytes.equals(canonicalBytes(report))
    || !verifyNistUr5AccuracyDegradationReport(report).ok) fail("RECEIPT_INPUT_INVALID");
  const body = {
    schema: NIST_UR5_RECEIPT_SCHEMA,
    createdAt: NIST_UR5_FROZEN_AT,
    command: "node scripts/acquire-nist-ur5-accuracy-degradation.mjs",
    report: {
      path: "nist-ur5-accuracy-degradation.json", bytes: reportBytes.length,
      sha256: nistUr5Sha256(reportBytes), artifactHash: report.artifactHash,
    },
    source: {
      doi: NIST_UR5_DOI,
      manifestHash: report.sourceReplay.sourceManifestHash,
      manifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      fullSelectedSourceRebuildPerformed: true,
      allTwentyOfficialLinkedObjectsReplayed: true,
    },
    denominatorBoundary: {
      controllerConditionTraces: 18,
      controllerSampleRows: EXPECTED_TRACE_ROWS,
      externalPositionDeviationRecords: 6,
      crossDomainTotal: null, crossDomainAdditionProhibited: true,
    },
    zeroClaimBoundary: {
      taskEpisodes: 0, opportunityCensusRecords: 0,
      independentTaskOutcomeRecords: 0, recoveryRecords: 0,
      delegationRecords: 0, authorityRecords: 0,
      networkContributionRecords: 0, CEURecords: 0,
      authorizedTrainingRows: 0, productionTrainingRows: 0,
    },
    publication: {
      reportPublishedBeforeReceipt: true, receiptWrittenLast: true,
      filesMode: "0600", directoriesMode: "0700", noClobber: true,
    },
  };
  return Object.freeze({ ...body,
    receiptHash: digest(`${NIST_UR5_RECEIPT_SCHEMA}/receipt`, body) });
}

export function verifyNistUr5AccuracyDegradationRunReceipt(receipt, reportBytes) {
  try {
    if (!exactObject(receipt) || !Buffer.isBuffer(reportBytes)) fail("RECEIPT_VERIFY_INPUT_INVALID");
    const report = safeJson(reportBytes, "RECEIPT_REPORT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_NOT_CANONICAL");
    const expected = buildNistUr5AccuracyDegradationRunReceipt(report, reportBytes);
    if (!equalCanonical(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export function publishNistUr5AccuracyDegradationArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || path.dirname(staging) !== path.dirname(target)) {
    fail("PUBLISH_DIRECTORIES_NOT_SIBLINGS");
  }
  const stat = lstatSync(staging);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700
    || !equalCanonical(readdirSync(staging).sort(),
      ["nist-ur5-accuracy-degradation.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "nist-ur5-accuracy-degradation.json"),
      path.join(target, "nist-ur5-accuracy-degradation.json"));
    /* A receipt is the final completion marker. */
    renameSync(path.join(staging, "run-receipt.json"), path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_TARGET_INCOMPLETE", target); }
  return target;
}

export function verifyNistUr5AccuracyDegradationArtifactDirectory(artifactDirectory,
  options = {}) {
  try {
    const root = path.resolve(artifactDirectory);
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
      || (rootStat.mode & 0o777) !== 0o700
      || !equalCanonical(readdirSync(root).sort(),
        ["nist-ur5-accuracy-degradation.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_ROOT_INVALID");
    }
    const reportPath = path.join(root, "nist-ur5-accuracy-degradation.json");
    const receiptPath = path.join(root, "run-receipt.json");
    const reportSize = statSync(reportPath).size;
    const receiptSize = statSync(receiptPath).size;
    if (reportSize < 1 || reportSize > 8 * 1024 * 1024
      || receiptSize < 1 || receiptSize > 2 * 1024 * 1024) fail("ARTIFACT_JSON_SIZE_INVALID");
    const reportBytes = stableRead(reportPath, reportSize, 8 * 1024 * 1024);
    const receiptBytes = stableRead(receiptPath, receiptSize, 2 * 1024 * 1024);
    const report = safeJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = safeJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report)) || !receiptBytes.equals(canonicalBytes(receipt))) {
      fail("ARTIFACT_JSON_NOT_CANONICAL");
    }
    const reportCheck = verifyNistUr5AccuracyDegradationWithSource(report,
      path.join(root, "source"), options);
    const receiptCheck = verifyNistUr5AccuracyDegradationRunReceipt(receipt, reportBytes);
    if (!reportCheck.ok || !receiptCheck.ok) fail("ARTIFACT_REPLAY_FAILED",
      [...reportCheck.errors, ...(receiptCheck.errors ?? [])].join(","));
    const entries = recursiveEntries(root);
    assertPrivateDirectories(root, entries.directories);
    const receiptMtime = lstatSync(receiptPath, { bigint: true }).mtimeNs;
    const earlierFiles = entries.files.filter((relative) => relative !== "run-receipt.json");
    if (!earlierFiles.every((relative) => {
      const observed = lstatSync(path.join(root, relative), { bigint: true });
      return observed.isFile() && !observed.isSymbolicLink()
        && Number(observed.mode & 0o777n) === 0o600 && observed.mtimeNs <= receiptMtime;
    })) fail("ARTIFACT_RECEIPT_NOT_LAST_OR_FILE_UNSAFE");
    return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_REDERIVED",
      artifactHash: report.artifactHash, reportFileSha256: nistUr5Sha256(reportBytes),
      receiptFileSha256: nistUr5Sha256(receiptBytes), receiptHash: receipt.receiptHash,
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      controllerConditionTraces: 18, controllerSampleRows: EXPECTED_TRACE_ROWS,
      externalPositionDeviationRecords: 6,
      authorizedTrainingRows: 0, independentOutcomeRecords: 0, authorityDelta: 0 });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export const NIST_UR5_ACCURACY_CONSTANTS = Object.freeze({
  expectedRemoteObjectCount: FILES.length,
  expectedRemoteBytes: EXPECTED_REMOTE_BYTES,
  expectedCsvBytes: EXPECTED_CSV_BYTES,
  expectedTraceRows: EXPECTED_TRACE_ROWS,
  expectedTraceNumericValues: EXPECTED_TRACE_NUMERIC_VALUES,
  files: Object.freeze(FILES.map((profile) => Object.freeze(publicProfile(profile)))),
  fetchPolicy: Object.freeze({ maximumAttemptsPerRequest: 3,
    perAttemptTimeoutMilliseconds: FETCH_TIMEOUT_MS,
    backoffMilliseconds: RETRY_BACKOFF_MS, retryableHttpStatuses: RETRYABLE_STATUS }),
});
