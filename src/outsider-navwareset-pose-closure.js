/*
 * Fixed-source, complete pose-only closure for NavWareSet.  The intake binds
 * the official 185-file catalogue, every one of its 43 published *_poses.zip
 * objects, the portal README, and small pinned publisher repositories.  The
 * TB-scale ROS/point-cloud media are inventoried but never fetched.  Replays
 * validate every ZIP member, CSV row, participant slot and occupancy point
 * without projecting human coordinates into the public report.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const NAVWARESET_DOI = "10.25666/DATAUBFC-2025-05-22";
export const NAVWARESET_CATALOG_ID = 692;
export const NAVWARESET_PROJECT_REVISION =
  "136da3fc034deb6da93b10692fc0059be9ccedcb";
export const NAVWARESET_PROJECT_TREE =
  "3df1064fb632eb8ae15eb910460600863015e5e3";
export const NAVWARESET_TUTORIAL_REVISION =
  "9d00becfdd5cdc3c7eb2ad0f2ddf94d102b33ea6";
export const NAVWARESET_TUTORIAL_TREE =
  "c6369cd12b5dd0488e5a8511118d6669083c763c";
export const NAVWARESET_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const NAVWARESET_SOURCE_SCHEMA =
  "outsider/navwareset-pose-closure-source/v1";
export const NAVWARESET_ARTIFACT_SCHEMA =
  "outsider/navwareset-pose-closure/v1";
export const NAVWARESET_SCENES = Object.freeze([
  "01", "02", "03", "04", "05", "06", "08", "09", "10", "12", "13",
  "15", "16", "17", "18", "19", "20", "21", "22", "23", "25", "26",
  "27", "28", "29", "30", "31", "32", "34", "35", "36", "38", "39",
  "41", "42", "43", "44", "45", "46", "47", "49", "51", "52",
]);
export const NAVWARESET_PROFILE = Object.freeze({
  catalogFiles: 185,
  annotatedFiles: 43,
  poseFiles: 43,
  groundTruthFiles: 49,
  robotFiles: 49,
  readmeFiles: 1,
  selectedPortalObjects: 44,
  portalReadmeId: 512,
  firstPoseId: 400,
  lastPoseId: 442,
  projectTreeEntries: 47,
  tutorialTreeEntries: 5017,
});

const CATALOG_URL =
  "https://search-data.ubfc.fr/FR-13002091000019-2025-05-22_NavWareSet-A-Dataset-of-Socially-Compliant-and.html";
const PORTAL_DOWNLOAD = "https://search-data.ubfc.fr/dl_data.php?file=";
const PROJECT = "anr-navware/NavWareSet";
const TUTORIAL = "anr-navware/NavWareSet-Tutorials";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const FETCH_ATTEMPTS = 5;
const FETCH_CONCURRENCY = 4;
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_GITHUB_BYTES = 4 * 1024 * 1024;
const MAX_PORTAL_OBJECT_BYTES = 4 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `NAVWARESET_${code}`
    : `NAVWARESET_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function navWareSetSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return navWareSetSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length < 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "."
      && part !== "..");
}

function safeJoin(root, relative) {
  if (!safeRelative(relative)) fail("PATH_REFUSED", String(relative));
  const base = path.resolve(root);
  const joined = path.resolve(base, relative);
  const rel = path.relative(base, joined);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`)
    || path.isAbsolute(rel)) fail("PATH_ESCAPE", relative);
  return joined;
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && [
        "search-data.ubfc.fr", "storage-data.ubfc.fr", "api.github.com",
        "raw.githubusercontent.com",
      ].includes(parsed.hostname);
  } catch { return false; }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.retryable === true
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|terminated|socket)/iu
      .test(String(error?.message ?? error));
}

function headerObject(headers) {
  const result = {};
  if (headers && typeof headers.entries === "function") {
    for (const [name, value] of headers.entries()) result[name.toLowerCase()] = value;
  }
  return result;
}

async function fetchOnce(url, options, fetchImpl) {
  if (!permittedUrl(url)) fail("REQUEST_URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  try {
    const response = await fetchImpl(url, {
      method: "GET", redirect: options.redirect ?? "follow",
      signal: controller.signal,
      headers: { Accept: options.accept ?? "*/*", "User-Agent": "outsider-source-intake/1" },
    });
    if (!response || typeof response.arrayBuffer !== "function") {
      fail("FETCH_RESPONSE_INVALID");
    }
    if (options.expectedStatuses && !options.expectedStatuses.includes(response.status)) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      throw error;
    }
    const declaredText = response.headers?.get?.("content-length");
    const declared = declaredText === null ? null : Number(declaredText);
    if (Number.isFinite(declared) && declared > options.maximumBytes) {
      fail("CONTENT_LENGTH_EXCEEDED", String(declared));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > options.maximumBytes) {
      fail("BODY_BYTES_EXCEEDED", String(bytes.length));
    }
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    return { status: response.status, bytes, headers: headerObject(response.headers),
      finalUrl };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, options, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(url, options, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === FETCH_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    }
  }
  throw last;
}

function decodeEntities(value) {
  return value.replace(/&#(\d+);/gu, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([a-f0-9]+);/giu, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 16)))
    .replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"").replace(/&apos;|&#39;/giu, "'")
    .replace(/&lt;/giu, "<").replace(/&gt;/giu, ">");
}

function textOnly(value) {
  return decodeEntities(value.replace(/<[^>]*>/gsu, " "))
    .replace(/\s+/gu, " ").trim();
}

export function parseNavWareSetCatalog(bytes) {
  const html = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
  const rows = [];
  for (const match of html.matchAll(/<tr>(.*?)<\/tr>/gsu)) {
    const block = match[1];
    const idMatch = /data_checkbox[^>]*id="(\d+)"/u.exec(block);
    const linkMatch = /href="dl_data\.php\?file=(\d+)"[^>]*>([^<]+)<\/a>/u.exec(block);
    if (!idMatch || !linkMatch) continue;
    const id = Number(idMatch[1]);
    if (id !== Number(linkMatch[1])) fail("CATALOG_ROW_ID_MISMATCH", String(id));
    const text = textOnly(block);
    const published = /Published\s*:\s*([0-9-]+\s+[0-9:]+)/u.exec(text)?.[1] ?? null;
    const displaySize = /Size\s*:\s*([0-9.]+\s*[kMGT]?B)/iu.exec(text)?.[1] ?? null;
    const description = /Description\s*:\s*(.*?)(?:\s+Download|$)/iu.exec(text)?.[1]
      ?.trim() ?? null;
    const name = decodeEntities(linkMatch[2]).trim();
    if (!Number.isSafeInteger(id) || id < 1 || !name || !published
      || !displaySize || !description) fail("CATALOG_ROW_INVALID", String(id));
    let category = "unknown";
    if (/^\d{2}_annotated\.zip$/u.test(name)) category = "annotated";
    else if (/^\d{2}_poses\.zip$/u.test(name)) category = "poses";
    else if (/^(?:FAILED_\d{2}|\d{2})_grs\.zip$/u.test(name)) category = "grs";
    else if (/^(?:FAILED_\d{2}|\d{2})_robot\.zip$/u.test(name)) category = "robot";
    else if (name === "readme.md") category = "readme";
    rows.push({ id, name, category, published, displaySize, description });
  }
  rows.sort((left, right) => left.id - right.id);
  const counts = Object.fromEntries(["annotated", "poses", "grs", "robot", "readme"]
    .map((key) => [key, rows.filter((row) => row.category === key).length]));
  const poseRows = rows.filter((row) => row.category === "poses")
    .sort((left, right) => left.id - right.id);
  const poseScenes = poseRows.map((row) => row.name.slice(0, 2));
  if (rows.length !== NAVWARESET_PROFILE.catalogFiles
    || new Set(rows.map((row) => row.id)).size !== rows.length
    || new Set(rows.map((row) => row.name)).size !== rows.length
    || rows.some((row) => row.category === "unknown")
    || counts.annotated !== NAVWARESET_PROFILE.annotatedFiles
    || counts.poses !== NAVWARESET_PROFILE.poseFiles
    || counts.grs !== NAVWARESET_PROFILE.groundTruthFiles
    || counts.robot !== NAVWARESET_PROFILE.robotFiles
    || counts.readme !== NAVWARESET_PROFILE.readmeFiles
    || !same(poseRows.map((row) => row.id),
      Array.from({ length: 43 }, (_, index) => 400 + index))
    || !same(poseScenes, NAVWARESET_SCENES)
    || rows.filter((row) => row.category === "readme")[0]?.id !== 512) {
    fail("CATALOG_PROFILE_INVALID");
  }
  const claims = {
    doiPresent: html.includes(NAVWARESET_DOI),
    catalogIdPresent: /id="id_data"[^>]*>\s*692\s*</iu.test(html),
    fileCount185: /185\s+files/iu.test(textOnly(html)),
    lastModificationJuneFirst2026: /Last modification\s*:?\s*1 Jun 2026/iu
      .test(textOnly(html)),
    participantCount17: /(?:17|Seventeen) participants/iu.test(textOnly(html)),
    controlledIndoorClaim: /controlled indoor environment(?:s)?/iu.test(textOnly(html)),
    ccBy3Badge: /creativecommons\.org\/licenses\/by\/3\.0\/?/iu.test(html),
  };
  if (!Object.values(claims).every(Boolean)) fail("CATALOG_CLAIMS_DRIFT");
  return { rows, counts, poseScenes, claims,
    inventoryHash: digest("outsider/navwareset-catalog-inventory/v1", rows) };
}

function jsonValue(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

function githubUrls() {
  return {
    projectCommit: `https://api.github.com/repos/${PROJECT}/commits/${NAVWARESET_PROJECT_REVISION}`,
    projectTree: `https://api.github.com/repos/${PROJECT}/git/trees/${NAVWARESET_PROJECT_TREE}?recursive=1`,
    projectLicense: `https://raw.githubusercontent.com/${PROJECT}/${NAVWARESET_PROJECT_REVISION}/LICENSE`,
    projectReadme: `https://raw.githubusercontent.com/${PROJECT}/${NAVWARESET_PROJECT_REVISION}/README.md`,
    projectIndex: `https://raw.githubusercontent.com/${PROJECT}/${NAVWARESET_PROJECT_REVISION}/index.html`,
    tutorialCommit: `https://api.github.com/repos/${TUTORIAL}/commits/${NAVWARESET_TUTORIAL_REVISION}`,
    tutorialTree: `https://api.github.com/repos/${TUTORIAL}/git/trees/${NAVWARESET_TUTORIAL_TREE}?recursive=1`,
    tutorialReadme: `https://raw.githubusercontent.com/${TUTORIAL}/${NAVWARESET_TUTORIAL_REVISION}/README.md`,
    tutorialCsv: `https://raw.githubusercontent.com/${TUTORIAL}/${NAVWARESET_TUTORIAL_REVISION}/csv_scene_viewer.py`,
  };
}

function projectEvidenceProjection(files) {
  const projectCommit = jsonValue(files.projectCommit, "project-commit");
  const projectTree = jsonValue(files.projectTree, "project-tree");
  const tutorialCommit = jsonValue(files.tutorialCommit, "tutorial-commit");
  const tutorialTree = jsonValue(files.tutorialTree, "tutorial-tree");
  if (projectCommit.sha !== NAVWARESET_PROJECT_REVISION
    || projectCommit.commit?.tree?.sha !== NAVWARESET_PROJECT_TREE
    || projectTree.sha !== NAVWARESET_PROJECT_TREE || projectTree.truncated !== false
    || projectTree.tree?.length !== NAVWARESET_PROFILE.projectTreeEntries
    || tutorialCommit.sha !== NAVWARESET_TUTORIAL_REVISION
    || tutorialCommit.commit?.tree?.sha !== NAVWARESET_TUTORIAL_TREE
    || tutorialTree.sha !== NAVWARESET_TUTORIAL_TREE || tutorialTree.truncated !== false
    || tutorialTree.tree?.length !== NAVWARESET_PROFILE.tutorialTreeEntries) {
    fail("GITHUB_PIN_INVALID");
  }
  const projectExpected = {
    LICENSE: ["0e259d42c996742e9e3cba14c677129b2c1b6311", 7048],
    "README.md": ["83da689e89366a36eaeaf46c2f6f9d48dab858fd", 1004],
    "index.html": ["24a76341bdb94e4c13d6adc4aa480b1c7a1e13a0", 46676],
  };
  const tutorialExpected = {
    "README.md": ["f1f8d6b5b4718d02ae71878492f4cc7f8f68de82", 3967],
    "csv_scene_viewer.py": ["369417e95d9b9617422c0df04037198e5a6e081f", 3473],
  };
  const projectBytes = { LICENSE: files.projectLicense,
    "README.md": files.projectReadme, "index.html": files.projectIndex };
  const tutorialBytes = { "README.md": files.tutorialReadme,
    "csv_scene_viewer.py": files.tutorialCsv };
  const check = (tree, expected, values, label) => {
    for (const [name, [sha, size]] of Object.entries(expected)) {
      const entry = tree.tree.find((row) => row.path === name);
      if (entry?.type !== "blob" || entry.sha !== sha || entry.size !== size
        || values[name].length !== size || gitBlobOid(values[name]) !== sha) {
        fail("GITHUB_BLOB_INVALID", `${label}:${name}`);
      }
    }
  };
  check(projectTree, projectExpected, projectBytes, "project");
  check(tutorialTree, tutorialExpected, tutorialBytes, "tutorial");
  const licenseText = files.projectLicense.toString("utf8");
  const portalReadmeText = files.portalReadme.toString("utf8");
  const indexText = files.projectIndex.toString("utf8");
  const tutorialText = files.tutorialCsv.toString("utf8");
  if (!/CC0 1\.0 Universal/iu.test(licenseText)
    || !/License\*\*:\s*CC BY/iu.test(portalReadmeText)
    || !/Scenes 53 to 57 don't have person position annotation/iu.test(indexText)
    || !/only the robot moves between the participants/iu.test(indexText)
    || !/for i in range\(1, 6\)/u.test(tutorialText)
    || !/df\[f"x\{i\}"\]/u.test(tutorialText)
    || !/occupancy_data = json\.load/u.test(tutorialText)) {
    fail("PUBLISHER_EVIDENCE_DRIFT");
  }
  return {
    project: { revision: NAVWARESET_PROJECT_REVISION,
      tree: NAVWARESET_PROJECT_TREE, treeEntries: projectTree.tree.length,
      blobs: Object.fromEntries(Object.entries(projectExpected).map(([name, [sha, size]]) =>
        [name, { sha, size }])) },
    tutorial: { revision: NAVWARESET_TUTORIAL_REVISION,
      tree: NAVWARESET_TUTORIAL_TREE, treeEntries: tutorialTree.tree.length,
      blobs: Object.fromEntries(Object.entries(tutorialExpected).map(([name, [sha, size]]) =>
        [name, { sha, size }])) },
    publisherClaims: {
      portalReadmeCcByClaim: true,
      projectLicenseCc0TextPresent: true,
      staticParticipantScenesClaim: ["53", "54", "55", "56", "57"],
      onlyRobotMovesClaim: true,
      tutorialParticipantSlots: 5,
      tutorialCodeExecuted: false,
    },
  };
}

function ensureDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes, stable = true) {
  const parent = path.dirname(file);
  ensureDirectory(parent);
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
    if (stable && !readFileSync(file).equals(value)) fail("CHECKPOINT_MISMATCH", file);
  } else writeFileSync(file, value, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeCanonical(file, value, stable = true) {
  writePrivate(file, canonicalBytes(value), stable);
}

function enforcePrivateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function scanFiles(root, excluded = new Set()) {
  const files = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const relative = path.relative(root, child).split(path.sep).join("/");
      if (excluded.has(relative)) continue;
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", relative);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) {
        const bytes = readFileSync(child);
        files.push({ path: relative, bytes: bytes.length,
          sha256: navWareSetSha256(bytes) });
      } else fail("SPECIAL_FILE_REFUSED", relative);
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function sanitizedUrl(value) {
  const parsed = new URL(value);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

async function fetchCatalogSnapshot(label, work, fetchImpl) {
  const response = await boundedFetch(CATALOG_URL, {
    maximumBytes: MAX_CATALOG_BYTES, expectedStatuses: [200],
    accept: "text/html,application/xhtml+xml",
  }, fetchImpl);
  const bodyPath = safeJoin(work, `portal/catalog-${label}.html`);
  const headersPath = safeJoin(work, `portal/catalog-${label}.headers.json`);
  writePrivate(bodyPath, response.bytes);
  writeCanonical(headersPath, { requestUrl: CATALOG_URL, status: response.status,
    finalUrl: response.finalUrl, headers: response.headers }, false);
  return { response, parsed: parseNavWareSetCatalog(response.bytes) };
}

async function fetchGithubEvidence(work, fetchImpl) {
  const urls = githubUrls();
  const names = Object.keys(urls);
  const values = {};
  await Promise.all(names.map(async (name) => {
    const response = await boundedFetch(urls[name], {
      maximumBytes: MAX_GITHUB_BYTES, expectedStatuses: [200],
      accept: name.includes("Commit") || name.includes("Tree")
        ? "application/vnd.github+json" : "text/plain, text/html;q=0.9",
    }, fetchImpl);
    values[name] = response.bytes;
    const extension = name.includes("Commit") || name.includes("Tree") ? ".json"
      : name === "projectLicense" ? ".txt"
        : name === "projectIndex" ? ".html"
          : name === "tutorialCsv" ? ".py" : ".md";
    writePrivate(safeJoin(work, `github/${name}${extension}`), response.bytes);
    writeCanonical(safeJoin(work, `github/${name}.headers.json`), {
      requestUrl: urls[name], status: response.status, finalUrl: response.finalUrl,
      headers: response.headers,
    }, false);
  }));
  return values;
}

async function fetchPortalObject(row, work, fetchImpl) {
  const markerPath = safeJoin(work, `checkpoints/portal-${row.id}.json`);
  if (existsSync(markerPath)) {
    const marker = jsonValue(readFileSync(markerPath), `portal-marker-${row.id}`);
    const objectPath = safeJoin(work, marker.localPath);
    if (marker.id !== row.id || marker.name !== row.name || !existsSync(objectPath)
      || statSync(objectPath).size !== marker.bytes
      || navWareSetSha256(readFileSync(objectPath)) !== marker.sha256) {
      fail("PORTAL_CHECKPOINT_INVALID", String(row.id));
    }
    return marker;
  }
  const portalUrl = `${PORTAL_DOWNLOAD}${row.id}`;
  const redirect = await boundedFetch(portalUrl, {
    maximumBytes: 128 * 1024, expectedStatuses: [303], redirect: "manual",
    accept: "*/*",
  }, fetchImpl);
  const location = redirect.headers.location;
  if (!location || !permittedUrl(location)) fail("PORTAL_REDIRECT_INVALID", String(row.id));
  const parsedLocation = new URL(location);
  if (parsedLocation.hostname !== "storage-data.ubfc.fr"
    || !parsedLocation.pathname.endsWith(`/${row.name}`)) {
    fail("PORTAL_REDIRECT_TARGET_INVALID", String(row.id));
  }
  const object = await boundedFetch(location, {
    maximumBytes: MAX_PORTAL_OBJECT_BYTES, expectedStatuses: [200],
    accept: "application/octet-stream,*/*;q=0.8",
  }, fetchImpl);
  if (object.finalUrl && sanitizedUrl(object.finalUrl) !== sanitizedUrl(location)) {
    fail("PORTAL_FINAL_URL_INVALID", String(row.id));
  }
  const declared = Number(object.headers["content-length"]);
  if (!Number.isSafeInteger(declared) || declared !== object.bytes.length
    || !object.headers.etag || !object.headers["last-modified"]) {
    fail("PORTAL_HEADERS_INVALID", String(row.id));
  }
  if (row.category === "poses" && !object.bytes.subarray(0, 4)
    .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) fail("ZIP_MAGIC_INVALID", row.name);
  const localPath = row.category === "poses"
    ? `portal/objects/poses/${row.name}` : "portal/objects/readme.md";
  writePrivate(safeJoin(work, localPath), object.bytes);
  writePrivate(safeJoin(work, `portal/redirects/${row.id}.body`), redirect.bytes, false);
  writeCanonical(safeJoin(work, `portal/redirects/${row.id}.headers.json`), {
    requestUrl: portalUrl, status: redirect.status, headers: redirect.headers,
    redirectTarget: sanitizedUrl(location),
  }, false);
  writeCanonical(safeJoin(work, `portal/headers/${row.id}.json`), {
    requestUrl: sanitizedUrl(location), status: object.status,
    finalUrl: sanitizedUrl(object.finalUrl), headers: object.headers,
  }, false);
  const result = { id: row.id, name: row.name, category: row.category,
    localPath, redirectStatus: redirect.status, objectStatus: object.status,
    redirectTarget: sanitizedUrl(location), bytes: object.bytes.length,
    sha256: navWareSetSha256(object.bytes), etag: object.headers.etag,
    lastModified: object.headers["last-modified"],
    contentLength: declared };
  writeCanonical(markerPath, result);
  return result;
}

async function mapConcurrent(values, concurrency, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function sourceManifestBody(catalogBefore, catalogAfter, portalObjects,
  githubEvidence, sourceFiles) {
  const portalBytes = portalObjects.reduce((sum, row) => sum + row.bytes, 0);
  const poses = portalObjects.filter((row) => row.category === "poses");
  const readme = portalObjects.filter((row) => row.category === "readme");
  return {
    schema: NAVWARESET_SOURCE_SCHEMA,
    frozenAt: NAVWARESET_FROZEN_AT,
    source: { doi: NAVWARESET_DOI, catalogId: NAVWARESET_CATALOG_ID,
      catalogUrl: CATALOG_URL },
    catalogue: { before: { bytes: catalogBefore.response.bytes.length,
      sha256: navWareSetSha256(catalogBefore.response.bytes) },
    after: { bytes: catalogAfter.response.bytes.length,
      sha256: navWareSetSha256(catalogAfter.response.bytes) },
    inventoryHash: catalogBefore.parsed.inventoryHash,
    inventory: catalogBefore.parsed.rows,
    counts: catalogBefore.parsed.counts,
    claims: catalogBefore.parsed.claims },
    github: githubEvidence,
    portalObjects,
    closure: {
      completeOfficialCatalogueCapturedBeforeAndAfter: true,
      catalogueInventoriedFiles: 185,
      completePublishedPoseGroup: true,
      poseScenes: 43,
      poseSceneIds: NAVWARESET_SCENES,
      portalReadmePresent: true,
      selectedPortalObjects: portalObjects.length,
      selectedPortalBytes: portalBytes,
      poseArchiveBytes: poses.reduce((sum, row) => sum + row.bytes, 0),
      readmeBytes: readme[0].bytes,
      annotatedFilesInventoriedNotFetched: 43,
      groundTruthFilesInventoriedNotFetched: 49,
      robotFilesInventoriedNotFetched: 49,
      absentPoseSceneIds: ["53", "54", "55", "56", "57"],
      randomTruncation: false,
      globallyExhaustive: false,
      selectionRule: "ALL_43_POSE_ARCHIVES_PLUS_PORTAL_README",
    },
    sourceFiles,
    sourceRoot: digest("outsider/navwareset-source-root/v1", sourceFiles),
  };
}

export async function acquirePinnedNavWareSetPoseSource(sourceDirectory,
  options = {}) {
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_UNAVAILABLE");
  const work = options.checkpointDirectory ?? `${sourceDirectory}.checkpoint`;
  if (existsSync(work)) {
    const stat = lstatSync(work);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("CHECKPOINT_UNSAFE", work);
  } else mkdirSync(work, { recursive: true, mode: 0o700 });
  enforcePrivateTree(work);
  const marker = { schema: "outsider/navwareset-pose-source-checkpoint/v1",
    target: path.resolve(sourceDirectory), projectRevision: NAVWARESET_PROJECT_REVISION,
    tutorialRevision: NAVWARESET_TUTORIAL_REVISION };
  writeCanonical(safeJoin(work, "source-checkpoint.json"), marker);

  const before = await fetchCatalogSnapshot("before", work, fetchImpl);
  const githubFiles = await fetchGithubEvidence(work, fetchImpl);
  const selectedRows = before.parsed.rows.filter((row) =>
    row.category === "poses" || row.category === "readme");
  const portalObjects = await mapConcurrent(selectedRows, FETCH_CONCURRENCY,
    (row) => fetchPortalObject(row, work, fetchImpl));
  portalObjects.sort((left, right) => left.id - right.id);
  const after = await fetchCatalogSnapshot("after", work, fetchImpl);
  if (!same(before.parsed.rows, after.parsed.rows)
    || before.parsed.inventoryHash !== after.parsed.inventoryHash) {
    fail("CATALOGUE_CHANGED_DURING_ACQUISITION");
  }
  githubFiles.portalReadme = readFileSync(safeJoin(work, "portal/objects/readme.md"));
  const githubEvidence = projectEvidenceProjection(githubFiles);
  rmSync(safeJoin(work, "checkpoints"), { recursive: true, force: true });
  rmSync(safeJoin(work, "source-checkpoint.json"), { force: true });
  const sourceFiles = scanFiles(work, new Set(["acquisition-manifest.json"]));
  const body = sourceManifestBody(before, after, portalObjects, githubEvidence,
    sourceFiles);
  const manifest = { ...body,
    manifestHash: digest("outsider/navwareset-source-manifest/v1", body) };
  writeCanonical(safeJoin(work, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(work);
  renameSync(work, sourceDirectory);
  chmodSync(sourceDirectory, 0o700);
  const checked = verifyNavWareSetPoseSourceDirectory(sourceDirectory);
  if (!checked.ok) fail("ACQUIRED_SOURCE_INVALID", checked.error);
  return checked;
}

function readSourceFile(sourceDirectory, relative) {
  const file = safeJoin(sourceDirectory, relative);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600) {
    fail("SOURCE_FILE_MODE_INVALID", relative);
  }
  return readFileSync(file);
}

export function verifyNavWareSetPoseSourceDirectory(sourceDirectory) {
  try {
    const rootStat = lstatSync(sourceDirectory);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
      || (rootStat.mode & 0o777) !== 0o700) fail("SOURCE_DIRECTORY_MODE_INVALID");
    const manifest = jsonValue(readSourceFile(sourceDirectory,
      "acquisition-manifest.json"), "manifest");
    if (!plain(manifest) || manifest.schema !== NAVWARESET_SOURCE_SCHEMA
      || manifest.frozenAt !== NAVWARESET_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/navwareset-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    const actualFiles = scanFiles(sourceDirectory,
      new Set(["acquisition-manifest.json"]));
    if (!same(actualFiles, manifest.sourceFiles)
      || manifest.sourceRoot !== digest("outsider/navwareset-source-root/v1", actualFiles)) {
      fail("SOURCE_ROOT_INVALID");
    }
    const beforeBytes = readSourceFile(sourceDirectory, "portal/catalog-before.html");
    const afterBytes = readSourceFile(sourceDirectory, "portal/catalog-after.html");
    const before = parseNavWareSetCatalog(beforeBytes);
    const after = parseNavWareSetCatalog(afterBytes);
    if (!same(before.rows, after.rows) || !same(before.rows, manifest.catalogue.inventory)
      || before.inventoryHash !== manifest.catalogue.inventoryHash) {
      fail("CATALOG_REPLAY_INVALID");
    }
    if (!Array.isArray(manifest.portalObjects)
      || manifest.portalObjects.length !== 44) fail("PORTAL_OBJECT_CLOSURE_INVALID");
    for (const object of manifest.portalObjects) {
      const bytes = readSourceFile(sourceDirectory, object.localPath);
      if (bytes.length !== object.bytes || object.contentLength !== object.bytes
        || navWareSetSha256(bytes) !== object.sha256
        || object.redirectStatus !== 303 || object.objectStatus !== 200
        || !object.etag || !object.lastModified) {
        fail("PORTAL_OBJECT_INVALID", String(object.id));
      }
      const redirect = jsonValue(readSourceFile(sourceDirectory,
        `portal/redirects/${object.id}.headers.json`), `redirect-${object.id}`);
      const headers = jsonValue(readSourceFile(sourceDirectory,
        `portal/headers/${object.id}.json`), `headers-${object.id}`);
      if (redirect.status !== 303 || headers.status !== 200
        || redirect.redirectTarget !== object.redirectTarget
        || headers.headers.etag !== object.etag
        || headers.headers["last-modified"] !== object.lastModified) {
        fail("PORTAL_HTTP_EVIDENCE_INVALID", String(object.id));
      }
    }
    const githubFiles = {
      projectCommit: readSourceFile(sourceDirectory, "github/projectCommit.json"),
      projectTree: readSourceFile(sourceDirectory, "github/projectTree.json"),
      projectLicense: readSourceFile(sourceDirectory, "github/projectLicense.txt"),
      projectReadme: readSourceFile(sourceDirectory, "github/projectReadme.md"),
      projectIndex: readSourceFile(sourceDirectory, "github/projectIndex.html"),
      tutorialCommit: readSourceFile(sourceDirectory, "github/tutorialCommit.json"),
      tutorialTree: readSourceFile(sourceDirectory, "github/tutorialTree.json"),
      tutorialReadme: readSourceFile(sourceDirectory, "github/tutorialReadme.md"),
      tutorialCsv: readSourceFile(sourceDirectory, "github/tutorialCsv.py"),
      portalReadme: readSourceFile(sourceDirectory, "portal/objects/readme.md"),
    };
    const github = projectEvidenceProjection(githubFiles);
    if (!same(github, manifest.github)) fail("GITHUB_EVIDENCE_INVALID");
    const closure = manifest.closure;
    if (closure.completePublishedPoseGroup !== true || closure.poseScenes !== 43
      || !same(closure.poseSceneIds, NAVWARESET_SCENES)
      || closure.selectedPortalObjects !== 44
      || closure.randomTruncation !== false || closure.globallyExhaustive !== false
      || closure.annotatedFilesInventoriedNotFetched !== 43
      || closure.groundTruthFilesInventoriedNotFetched !== 49
      || closure.robotFilesInventoriedNotFetched !== 49) {
      fail("CLOSURE_INVALID");
    }
    return { ok: true, manifest, before, after,
      verificationLevel: "PINNED_COMPLETE_43_SCENE_POSE_BYTES_AND_185_FILE_INVENTORY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_REPLAY = String.raw`
import csv, hashlib, io, json, math, os, struct, sys, zipfile, zlib

root = os.path.realpath(sys.argv[1])
manifest = json.load(open(os.path.join(root, "acquisition-manifest.json"), encoding="utf-8"))
expected_header = ["timestamp", "robot_x", "robot_y", "robot_yaw_rad",
                   "x1", "y1", "x2", "y2", "x3", "y3",
                   "x4", "y4", "x5", "y5"]

def die(code, detail=""):
    raise RuntimeError("NAVWARESET_REPLAY_" + code + (":" + detail if detail else ""))

def obj(relative):
    target = os.path.realpath(os.path.join(root, relative))
    if not target.startswith(root + os.sep): die("PATH", relative)
    return target

scenes = []
total_rows = 0
total_participant_observations = 0
total_occupancy = 0
total_entries = 0
total_files = 0
total_dirs = 0
total_compressed = 0
total_uncompressed = 0

for source in [row for row in manifest["portalObjects"] if row["category"] == "poses"]:
    scene = source["name"][:2]
    expected_prefix = scene + "_poses/"
    archive_path = obj(source["localPath"])
    raw = open(archive_path, "rb").read()
    if "sha256:" + hashlib.sha256(raw).hexdigest() != source["sha256"]:
        die("ARCHIVE_HASH", scene)
    with zipfile.ZipFile(io.BytesIO(raw), "r") as archive:
        infos = archive.infolist()
        if len(infos) != 3 or len(set(x.filename for x in infos)) != 3:
            die("ARCHIVE_CLOSURE", scene)
        csv_infos = [x for x in infos if x.filename.endswith("_robot_and_participants.csv")]
        json_infos = [x for x in infos if x.filename.endswith("_occupancy_xy_points.json")]
        dir_infos = [x for x in infos if x.is_dir()]
        if len(csv_infos) != 1 or len(json_infos) != 1 or len(dir_infos) != 1:
            die("ARCHIVE_MEMBERS", scene)
        if dir_infos[0].filename != expected_prefix:
            die("ARCHIVE_DIRECTORY", scene)
        numeric_scene = str(int(scene))
        if csv_infos[0].filename != expected_prefix + numeric_scene + "_robot_and_participants.csv" \
           or json_infos[0].filename != expected_prefix + numeric_scene + "_occupancy_xy_points.json":
            die("SCENE_JOIN", scene)
        central = 0
        local = 0
        crc = 0
        for info in infos:
            if info.flag_bits & 1: die("ENCRYPTED", scene)
            if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                die("COMPRESSION", scene)
            if info.filename.startswith("/") or ".." in info.filename.split("/"):
                die("UNSAFE_NAME", scene)
            central += 1
            offset = info.header_offset
            if raw[offset:offset+4] != b"PK\x03\x04": die("LOCAL_SIGNATURE", scene)
            fields = struct.unpack_from("<IHHHHHIIIHH", raw, offset)
            flags, method = fields[2], fields[3]
            local_crc, local_comp, local_size = fields[6], fields[7], fields[8]
            name_len, extra_len = fields[9], fields[10]
            local_name = raw[offset+30:offset+30+name_len].decode("utf-8")
            if local_name != info.filename or flags != info.flag_bits or method != info.compress_type:
                die("LOCAL_CENTRAL_MISMATCH", scene)
            if not (flags & 8) and (local_crc != info.CRC or local_comp != info.compress_size \
                                  or local_size != info.file_size):
                die("LOCAL_SIZES", scene)
            payload = archive.read(info)
            if len(payload) != info.file_size or (zlib.crc32(payload) & 0xffffffff) != info.CRC:
                die("CRC", scene)
            local += 1
            crc += 1
        csv_payload = archive.read(csv_infos[0]).decode("utf-8-sig")
        reader = csv.reader(io.StringIO(csv_payload, newline=""))
        header = next(reader, None)
        if header != expected_header: die("CSV_HEADER", scene)
        row_count = 0
        previous_timestamp = None
        for row in reader:
            if len(row) != 14: die("CSV_WIDTH", scene)
            try:
                timestamp = int(row[0])
                values = [float(value) for value in row[1:]]
            except Exception: die("CSV_VALUE", scene)
            if previous_timestamp is not None and timestamp <= previous_timestamp:
                die("TIMESTAMP_ORDER", scene)
            if not all(math.isfinite(value) for value in values): die("CSV_FINITE", scene)
            previous_timestamp = timestamp
            row_count += 1
        if row_count == 0: die("CSV_EMPTY", scene)
        occupancy = json.loads(archive.read(json_infos[0]))
        if not isinstance(occupancy, list) or not occupancy: die("OCCUPANCY_EMPTY", scene)
        for point in occupancy:
            if not isinstance(point, dict) or set(point) != {"x", "y"} \
               or isinstance(point["x"], bool) or isinstance(point["y"], bool) \
               or not isinstance(point["x"], (int, float)) \
               or not isinstance(point["y"], (int, float)) \
               or not math.isfinite(point["x"]) or not math.isfinite(point["y"]):
                die("OCCUPANCY_POINT", scene)
        participant_observations = row_count * 5
        scenes.append({"sceneId": scene, "archiveEntries": len(infos),
                       "archiveFiles": 2, "archiveDirectories": 1,
                       "centralEntriesValidated": central,
                       "localHeadersValidated": local, "crcMembersValidated": crc,
                       "compressedMemberBytes": sum(x.compress_size for x in infos),
                       "uncompressedMemberBytes": sum(x.file_size for x in infos),
                       "csvRows": row_count, "csvColumns": 14,
                       "robotStateDimensions": 3, "participantSlots": 5,
                       "participantPositionObservations": participant_observations,
                       "timestampInteger": True, "timestampStrictlyIncreasing": True,
                       "allNumericValuesFinite": True,
                       "occupancyPoints": len(occupancy),
                       "coordinatesProjectedInReport": False})
        total_rows += row_count
        total_participant_observations += participant_observations
        total_occupancy += len(occupancy)
        total_entries += len(infos)
        total_files += 2
        total_dirs += 1
        total_compressed += sum(x.compress_size for x in infos)
        total_uncompressed += sum(x.file_size for x in infos)

if len(scenes) != 43 or [x["sceneId"] for x in scenes] != manifest["closure"]["poseSceneIds"]:
    die("SCENE_CENSUS")

print(json.dumps({
  "archives": {"files": 43, "entries": total_entries, "memberFiles": total_files,
               "memberDirectories": total_dirs, "centralEntriesValidated": total_entries,
               "localHeadersValidated": total_entries, "crcMembersValidated": total_entries,
               "compressedMemberBytes": total_compressed,
               "uncompressedMemberBytes": total_uncompressed,
               "unsafePaths": 0, "encryptedMembers": 0},
  "csv": {"files": 43, "header": expected_header, "columns": 14,
          "rows": total_rows, "robotStateDimensions": 3,
          "participantSlotsPerRow": 5,
          "participantPositionObservations": total_participant_observations,
          "timestampIntegerAllRows": True, "timestampStrictlyIncreasingPerScene": True,
          "allNumericValuesFinite": True},
  "occupancy": {"files": 43, "points": total_occupancy,
                "exactKeys": ["x", "y"], "allCoordinatesFinite": True},
  "scenes": scenes,
  "typedDenominators": {
    "PUBLISHED_POSE_SCENE": {"count": 43, "unit": "published pose scene"},
    "POSE_TIME_ROW": {"count": total_rows, "unit": "CSV time row"},
    "PARTICIPANT_POSITION_OBSERVATION": {"count": total_participant_observations,
      "unit": "participant x/y slot at one pose time row"},
    "OCCUPANCY_POINT": {"count": total_occupancy, "unit": "occupancy x/y point"},
    "crossTotal": None
  },
  "privacyProjection": {"rawHumanCoordinatesPresent": True,
                        "coordinatesProjectedInReport": False},
  "codeExecution": {"publisherPythonFilesExecuted": 0, "archivePayloadsExecuted": 0}
}, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

export function runNavWareSetPoseReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYTHON_REPLAY, path.resolve(sourceDirectory)],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) fail("PYTHON_EXEC_FAILED", result.error.message);
  if (result.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  const replay = jsonValue(Buffer.from(result.stdout, "utf8"), "pose-replay");
  if (replay.archives?.files !== 43 || replay.archives?.entries !== 129
    || replay.csv?.files !== 43 || replay.csv?.rows < 1
    || replay.csv?.participantPositionObservations !== replay.csv.rows * 5
    || replay.occupancy?.files !== 43 || replay.occupancy?.points < 1
    || replay.scenes?.length !== 43 || replay.typedDenominators?.crossTotal !== null
    || replay.codeExecution?.publisherPythonFilesExecuted !== 0) {
    fail("REPLAY_RESULT_INVALID");
  }
  return replay;
}

function artifactBody(verified, replay) {
  return {
    schema: NAVWARESET_ARTIFACT_SCHEMA,
    frozenAt: NAVWARESET_FROZEN_AT,
    status: "PINNED_COMPLETE_43_SCENE_POSE_CLOSURE_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { doi: NAVWARESET_DOI, catalogId: NAVWARESET_CATALOG_ID,
      projectRevision: NAVWARESET_PROJECT_REVISION,
      tutorialRevision: NAVWARESET_TUTORIAL_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    provenance: {
      publisherControlledIndoorRealWorldClaim: true,
      publisherParticipantCountClaim: 17,
      publisherRobotPlatformsClaim: ["Toyota Human Support Robot (HSR)",
        "Clearpath Jackal"],
      independentPhysicalProvenanceEstablished: false,
      perSceneRobotPlatformEstablishedFromSelectedPoseBytes: false,
      simulationEstablished: false,
    },
    sceneSemantics: {
      publishedPoseScenes: 43,
      selectedPoseSceneIds: NAVWARESET_SCENES,
      scenes53Through57HaveNoPublishedPoseFile: true,
      publisherSaysParticipantsDoNotWalkAndOnlyRobotMovesInScenes53Through57: true,
      missingPoseScenesSynthesized: false,
      catalogueAndReadmeSceneCountClaimsReconciled: false,
      fortySevenOrFortyEightSceneClaimPromotedToConcreteLabels: false,
      perSceneScenarioMappingAdmitted: false,
      perSceneSocialNonSocialMappingAdmitted: false,
      selectedPoseArchivesContainScenarioLabelField: false,
      selectedPoseArchivesContainSocialComplianceLabelField: false,
    },
    evidenceSemantics: {
      robotAndParticipantPoseRowsDirectlyPresent: true,
      occupancyPointsDirectlyPresent: true,
      participantSlotsPerRow: 5,
      humanComfortRatingPresent: false,
      terminalTaskOutcomePresent: false,
      independentOutcomePresent: false,
      recoveryPresent: false,
      delegationPresent: false,
      attemptChronologyPresent: false,
      externalEffectReceiptPresent: false,
    },
    rights: {
      portalLicenseBadgeClaim: "CC BY 3.0",
      portalReadmeLicenseClaim: "CC BY",
      projectRepositoryLicenseText: "CC0 1.0 Universal",
      licenseSourcesAndScopesConflictOrRemainAmbiguous: true,
      projectRepositoryLicenseAutomaticallyAppliedToPortalData: false,
      privacyPublicityRightsClearedByLicense: false,
      legalAuthorityEstablished: false,
      productionTrainingAuthorized: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true,
      directoryMode: "0700",
      fileMode: "0600",
      humanTrajectoryCoordinatesPresent: true,
      coordinatesProjectedInReport: false,
      noPiiGuaranteed: false,
      privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0,
      CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 },
  };
}

export function navWareSetArtifactHash(body) {
  return digest("outsider/navwareset-pose-closure/v1", body);
}

export function buildNavWareSetPoseArtifactFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyNavWareSetPoseSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runNavWareSetPoseReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: navWareSetArtifactHash(body) };
  const checked = verifyNavWareSetPoseArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyNavWareSetPoseArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== NAVWARESET_ARTIFACT_SCHEMA
      || artifact.frozenAt !== NAVWARESET_FROZEN_AT
      || artifact.status !== "PINNED_COMPLETE_43_SCENE_POSE_CLOSURE_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== navWareSetArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.poseScenes !== 43
      || artifact.source?.closure?.selectedPortalObjects !== 44
      || artifact.replay?.archives?.files !== 43
      || artifact.replay?.archives?.centralEntriesValidated !== 129
      || artifact.replay?.archives?.localHeadersValidated !== 129
      || artifact.replay?.archives?.crcMembersValidated !== 129
      || artifact.replay?.csv?.participantPositionObservations
        !== artifact.replay?.csv?.rows * 5
      || artifact.replay?.typedDenominators?.crossTotal !== null) {
      fail("ARTIFACT_REPLAY_INVALID");
    }
    if (artifact.sceneSemantics?.missingPoseScenesSynthesized !== false
      || artifact.sceneSemantics?.perSceneScenarioMappingAdmitted !== false
      || artifact.sceneSemantics?.perSceneSocialNonSocialMappingAdmitted !== false
      || artifact.sceneSemantics?.fortySevenOrFortyEightSceneClaimPromotedToConcreteLabels
        !== false) fail("SCENE_LABEL_PROMOTION");
    if (artifact.evidenceSemantics?.humanComfortRatingPresent !== false
      || artifact.evidenceSemantics?.terminalTaskOutcomePresent !== false
      || artifact.evidenceSemantics?.independentOutcomePresent !== false
      || artifact.evidenceSemantics?.recoveryPresent !== false
      || artifact.evidenceSemantics?.delegationPresent !== false
      || artifact.evidenceSemantics?.attemptChronologyPresent !== false) {
      fail("EVIDENCE_PROMOTION");
    }
    if (artifact.rights?.licenseSourcesAndScopesConflictOrRemainAmbiguous !== true
      || artifact.rights?.legalAuthorityEstablished !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.coordinatesProjectedInReport !== false
      || artifact.privacy?.noPiiGuaranteed !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 })) {
      fail("BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_TYPED_DENOMINATORS_AND_SAFETY_BOUNDARIES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyNavWareSetPoseArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyNavWareSetPoseArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildNavWareSetPoseArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_43_ZIP_43_CSV_43_OCCUPANCY_AND_185_FILE_CATALOGUE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
