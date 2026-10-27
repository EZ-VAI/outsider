/*
 * Microsoft AgentLens official-metadata disposition.
 *
 * The Microsoft Research publication page currently points at a GitHub
 * repository, while the pinned arXiv v3 paper says that the repository is
 * still planned and the declared public GitHub repository returns 404.  This
 * module therefore preserves and replays only official metadata and absence
 * checks.  It never turns paper counts or publisher labels into observed
 * trajectory rows, independent outcomes, causal waste, or training authority.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  openSync, closeSync, readFileSync, readdirSync, renameSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const AGENTLENS_ARXIV_ID = "2605.12925";
export const AGENTLENS_ARXIV_VERSION = "v3";
export const AGENTLENS_DECLARED_REPOSITORY =
  "microsoft/code-agent-state-trajectories";
export const AGENTLENS_SOURCE_SCHEMA =
  "outsider/microsoft-agentlens-official-metadata-source/v1";
export const AGENTLENS_REPORT_SCHEMA =
  "outsider/microsoft-agentlens-metadata-disposition/v1";
export const AGENTLENS_RECEIPT_SCHEMA =
  "outsider/microsoft-agentlens-metadata-disposition-receipt/v1";

const MICROSOFT_PUBLICATION_URL = "https://www.microsoft.com/en-us/research/publication/"
  + "agentlens-revealing-the-lucky-pass-problem-in-swe-agent-evaluation/";
const ARXIV_ATOM_URL = `https://export.arxiv.org/api/query?id_list=${AGENTLENS_ARXIV_ID}`;
const ARXIV_ABS_URL = `https://arxiv.org/abs/${AGENTLENS_ARXIV_ID}${AGENTLENS_ARXIV_VERSION}`;
const ARXIV_HTML_URL = `https://arxiv.org/html/${AGENTLENS_ARXIV_ID}${AGENTLENS_ARXIV_VERSION}`;
const ARXIV_PDF_URL = `https://arxiv.org/pdf/${AGENTLENS_ARXIV_ID}${AGENTLENS_ARXIV_VERSION}`;
const GITHUB_REPOSITORY_URL =
  `https://api.github.com/repos/${AGENTLENS_DECLARED_REPOSITORY}`;
const GITHUB_SEARCH_URL =
  "https://api.github.com/search/repositories?q=AgentLens%20org%3Amicrosoft&per_page=100";
const HF_SEARCH_URL =
  "https://huggingface.co/api/datasets?search=AgentLens&limit=1000&full=true";
const HF_MICROSOFT_SEARCH_URL = "https://huggingface.co/api/datasets?author=microsoft"
  + "&search=AgentLens&limit=1000&full=true";
const EXPECTED_PDF_BYTES = 1_006_494;
const EXPECTED_PDF_SHA256 =
  "sha256:c86120eb74bd7bffebaf736dae439a5f7ab81efdaee738c528b305912e43413d";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;

const BASE_SPECS = Object.freeze([
  Object.freeze({ key: "microsoft-publication", extension: "html",
    source: MICROSOFT_PUBLICATION_URL, status: 200, contentType: "text/html",
    maximumBytes: 1_000_000 }),
  Object.freeze({ key: "arxiv-atom", extension: "xml", source: ARXIV_ATOM_URL,
    status: 200, contentType: "application/atom+xml", maximumBytes: 64_000 }),
  Object.freeze({ key: "arxiv-abs-v3", extension: "html", source: ARXIV_ABS_URL,
    status: 200, contentType: "text/html", maximumBytes: 256_000 }),
  Object.freeze({ key: "arxiv-full-v3", extension: "html", source: ARXIV_HTML_URL,
    status: 200, contentType: "text/html", maximumBytes: 2_000_000 }),
  Object.freeze({ key: "github-declared-repository", extension: "json",
    source: GITHUB_REPOSITORY_URL, status: 404, contentType: "application/json",
    maximumBytes: 64_000 }),
  Object.freeze({ key: "github-microsoft-agentlens-search", extension: "json",
    source: GITHUB_SEARCH_URL, status: 200, contentType: "application/json",
    maximumBytes: 512_000 }),
  Object.freeze({ key: "hf-agentlens-search", extension: "json",
    source: HF_SEARCH_URL, status: 200, contentType: "application/json",
    maximumBytes: 2_000_000 }),
  Object.freeze({ key: "hf-microsoft-agentlens-search", extension: "json",
    source: HF_MICROSOFT_SEARCH_URL, status: 200, contentType: "application/json",
    maximumBytes: 2_000_000 }),
]);

export const AGENTLENS_SOURCE_OBJECT_SPECS = Object.freeze([
  ...BASE_SPECS.flatMap((spec) => ["before", "after"].map((bracket) => Object.freeze({
    label: `${spec.key}-${bracket}`,
    path: `control/${spec.key}-${bracket}.${spec.extension}`,
    source: spec.source,
    responseUrl: spec.source,
    status: spec.status,
    contentType: spec.contentType,
    maximumBytes: spec.maximumBytes,
    bracket,
  }))),
  Object.freeze({ label: "arxiv-pdf-v3", path: "paper/agentlens-2605.12925v3.pdf",
    source: ARXIV_PDF_URL, responseUrl: ARXIV_PDF_URL, status: 200,
    contentType: "application/pdf", maximumBytes: 2_000_000, bracket: "single" }),
].sort((left, right) => left.path.localeCompare(right.path)));

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTLENS_METADATA_${code}`
    : `AGENTLENS_METADATA_${code}:${detail}`);
}

export function agentLensSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function agentLensDigest(value, domain = AGENTLENS_REPORT_SCHEMA) {
  return agentLensSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function parseJson(bytes, code) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    fail(code);
  }
}

function utf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length < 1 || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}

function readPrivate(file, maximumBytes = null) {
  const initial = lstatSync(file);
  if (initial.isSymbolicLink() || !initial.isFile() || (initial.mode & 0o777) !== 0o600
    || maximumBytes !== null && (initial.size < 1 || initial.size > maximumBytes)) {
    fail("PRIVATE_FILE_INVALID", file);
  }
  let descriptor;
  try {
    descriptor = openSync(file, fsConstants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.dev !== initial.dev || before.ino !== initial.ino
      || before.size !== initial.size) fail("PRIVATE_FILE_CHANGED", file);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const final = lstatSync(file);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
      || final.dev !== before.dev || final.ino !== before.ino || final.size !== before.size) {
      fail("PRIVATE_FILE_CHANGED", file);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function listPrivateFiles(root) {
  const files = [];
  const visit = (directory, prefix = "") => {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
      fail("PRIVATE_DIRECTORY_INVALID", directory);
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = path.join(directory, entry.name);
      const child = lstatSync(target);
      if (child.isSymbolicLink()) fail("SYMLINK_REJECTED", target);
      if (child.isDirectory()) visit(target, relative);
      else if (child.isFile() && (child.mode & 0o777) === 0o600) files.push(relative);
      else fail("PRIVATE_ENTRY_INVALID", target);
    }
  };
  visit(root);
  return sorted(files);
}

function stripHtml(value) {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/giu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&quot;/gu, "\"")
    .replace(/\s+/gu, " ").trim();
}

function includesEvery(text, fragments, code) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) fail(code, fragment);
  }
}

function microsoftProjection(bytes) {
  const raw = utf8(bytes, "MICROSOFT_PAGE_UTF8_INVALID");
  const text = stripHtml(raw);
  includesEvery(text, [
    "AgentLens: Revealing The Lucky Pass Problem in SWE-Agent Evaluation",
    "2,614 OpenHands trajectories",
    "1,815 trajectories annotated with quality scores, waste signals, divergence points",
    "47 task-level Prefix Tree Acceptor (PTA) references",
    "We release the anonymized project repository",
    "https://github.com/microsoft/code-agent-state-trajectories/",
  ], "MICROSOFT_PAGE_CLAIM_MISSING");
  return { officialPublicationPage: true, publisherReleaseClaimPresent: true,
    declaredRepositoryUrl: "https://github.com/microsoft/code-agent-state-trajectories/",
    corpusTrajectoryClaim: 2_614, benchTrajectoryClaim: 1_815, ptaTaskClaim: 47 };
}

function arxivAtomProjection(bytes) {
  const text = utf8(bytes, "ARXIV_ATOM_UTF8_INVALID").replace(/\s+/gu, " ");
  includesEvery(text, [
    `<id>http://arxiv.org/abs/${AGENTLENS_ARXIV_ID}${AGENTLENS_ARXIV_VERSION}</id>`,
    "<title>AgentLens: Revealing The Lucky Pass Problem in SWE-Agent Evaluation</title>",
    "<updated>2026-06-02T15:49:40Z</updated>",
    "<published>2026-05-13T03:00:57Z</published>",
    "2,614 OpenHands trajectories from eight model backends on 60 SWE-bench Verified tasks",
    "yielding a 1,815-trajectory evaluation subset",
    "We plan to release the project repository soon",
  ], "ARXIV_ATOM_CLAIM_MISSING");
  const authorCount = (text.match(/<author>\s*<name>/gu) ?? []).length;
  if (authorCount !== 7) fail("ARXIV_ATOM_AUTHOR_COUNT_INVALID", String(authorCount));
  return { arxivId: AGENTLENS_ARXIV_ID, version: AGENTLENS_ARXIV_VERSION,
    updatedAt: "2026-06-02T15:49:40Z", publishedAt: "2026-05-13T03:00:57Z",
    authors: 7, releaseStatus: "PLANNED_SOON" };
}

function arxivAbsProjection(bytes) {
  const raw = utf8(bytes, "ARXIV_ABS_UTF8_INVALID");
  const text = stripHtml(raw);
  includesEvery(raw, ["creativecommons.org/licenses/by/4.0"],
    "ARXIV_ABS_LICENSE_MISSING");
  includesEvery(text, [
    "AgentLens: Revealing The Lucky Pass Problem in SWE-Agent Evaluation",
    "Submitted on 13 May 2026",
    "last revised 2 Jun 2026",
    "2,614 OpenHands trajectories",
    "1,815 trajectories annotated with quality scores, waste signals, divergence points",
    "We plan to release the project repository soon",
  ], "ARXIV_ABS_CLAIM_MISSING");
  return { titleMatched: true, arxivVersion: AGENTLENS_ARXIV_VERSION,
    paperLicenseClaim: "CC-BY-4.0", releaseStatus: "PLANNED_SOON" };
}

function arxivFullProjection(bytes) {
  const raw = utf8(bytes, "ARXIV_FULL_UTF8_INVALID");
  if (!raw.trimEnd().endsWith("</html>")) fail("ARXIV_FULL_TRUNCATED");
  const text = stripHtml(raw);
  includesEvery(text, [
    "The corpus contains 2,614 trajectories across 60 tasks and eight model backends",
    "Across these trajectories, 1,389 pass, 1,217 fail, and 8 have unrecorded outcomes",
    "spanning 1,815 trajectories: 1,136 passing and 679 failing",
    "40-column feature vectors",
    "one task-level ground-truth PTA per task",
    "waste annotations, divergence metadata, and tier labels",
    "10.7% of passing trajectories",
    "We plan to release",
    "the web interface soon",
  ], "ARXIV_FULL_CLAIM_MISSING");
  return { corpusTrajectories: 2_614, corpusTasks: 60, modelBackends: 8,
    corpusPass: 1_389, corpusFail: 1_217, corpusOutcomeUnrecorded: 8,
    benchTrajectories: 1_815, benchTasks: 47, benchPass: 1_136, benchFail: 679,
    featureColumns: 40, luckyPassRatePercent: 10.7,
    annotationsClaimed: ["QUALITY_SCORE", "WASTE_SIGNAL", "DIVERGENCE_POINT",
      "QUALITY_TIER", "TASK_LEVEL_PTA"], releaseStatus: "PLANNED_SOON" };
}

function validateAbsenceJson(objects, root) {
  const bytes = (label) => readPrivate(path.join(root, objects.get(label).path),
    objects.get(label).maximumBytes);
  const projections = [];
  for (const bracket of ["before", "after"]) {
    const repository = parseJson(bytes(`github-declared-repository-${bracket}`),
      "GITHUB_REPOSITORY_JSON_INVALID");
    if (!same(repository, { message: "Not Found",
      documentation_url: "https://docs.github.com/rest/repos/repos#get-a-repository",
      status: "404" })) fail("GITHUB_REPOSITORY_ABSENCE_BODY_INVALID");
    const githubSearch = parseJson(bytes(`github-microsoft-agentlens-search-${bracket}`),
      "GITHUB_SEARCH_JSON_INVALID");
    if (!same(githubSearch, { total_count: 0, incomplete_results: false, items: [] })) {
      fail("GITHUB_SEARCH_NOT_EXHAUSTED_EMPTY");
    }
    const hfSearch = parseJson(bytes(`hf-agentlens-search-${bracket}`),
      "HF_SEARCH_JSON_INVALID");
    const hfMicrosoftSearch = parseJson(bytes(`hf-microsoft-agentlens-search-${bracket}`),
      "HF_MICROSOFT_SEARCH_JSON_INVALID");
    if (!Array.isArray(hfSearch) || hfSearch.length !== 0
      || !Array.isArray(hfMicrosoftSearch) || hfMicrosoftSearch.length !== 0) {
      fail("HF_SEARCH_NOT_EMPTY");
    }
    projections.push({ declaredRepositoryHttpStatus: 404,
      githubMicrosoftAgentLensSearchMatches: 0,
      githubSearchIncomplete: false, hfAgentLensSearchMatches: 0,
      hfMicrosoftAgentLensSearchMatches: 0 });
  }
  if (!same(projections[0], projections[1])) fail("ABSENCE_BRACKET_DRIFT");
  return projections[0];
}

function evidenceReplay(root, manifest) {
  const objects = new Map(manifest.objects.map((item) => [item.label, item]));
  const read = (label) => {
    const item = objects.get(label);
    if (!item) fail("SOURCE_OBJECT_MISSING", label);
    return readPrivate(path.join(root, item.path), item.maximumBytes);
  };
  const brackets = [];
  for (const bracket of ["before", "after"]) {
    brackets.push({
      microsoft: microsoftProjection(read(`microsoft-publication-${bracket}`)),
      atom: arxivAtomProjection(read(`arxiv-atom-${bracket}`)),
      abs: arxivAbsProjection(read(`arxiv-abs-v3-${bracket}`)),
      full: arxivFullProjection(read(`arxiv-full-v3-${bracket}`)),
    });
  }
  if (!same(brackets[0], brackets[1])) fail("OFFICIAL_RECORD_BRACKET_DRIFT");
  const absence = validateAbsenceJson(objects, root);
  const pdf = read("arxiv-pdf-v3");
  if (pdf.length !== EXPECTED_PDF_BYTES || agentLensSha256(pdf) !== EXPECTED_PDF_SHA256
    || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
    || !pdf.subarray(-1).equals(Buffer.from("\n", "ascii"))
    || !pdf.subarray(Math.max(0, pdf.length - 64)).includes(Buffer.from("%%EOF", "ascii"))) {
    fail("ARXIV_PDF_PIN_INVALID");
  }
  return { official: brackets[0], absence,
    publicPayloadAvailable: false, publicPayloadFiles: 0,
    sourceNativeTrajectoryRows: 0, paperPdfBytes: pdf.length,
    paperPdfSha256: agentLensSha256(pdf) };
}

function sourceRootFor(objects) {
  return agentLensDigest(objects.map(({ maximumBytes: _maximumBytes, ...item }) => item),
    `${AGENTLENS_SOURCE_SCHEMA}/source-root`);
}

function sourceManifestBody(objects, observedFrom, observedThrough) {
  return { schema: AGENTLENS_SOURCE_SCHEMA, observedFrom, observedThrough,
    officialIdentity: {
      title: "AgentLens: Revealing The Lucky Pass Problem in SWE-Agent Evaluation",
      microsoftPublicationUrl: MICROSOFT_PUBLICATION_URL,
      arxivId: AGENTLENS_ARXIV_ID, arxivVersion: AGENTLENS_ARXIV_VERSION,
      declaredRepository: AGENTLENS_DECLARED_REPOSITORY,
      declaredRepositoryUrl: `https://github.com/${AGENTLENS_DECLARED_REPOSITORY}/`,
    },
    declaredDiscovery: {
      githubExactRepositoryUrl: GITHUB_REPOSITORY_URL,
      githubOrganizationSearchUrl: GITHUB_SEARCH_URL,
      huggingFaceSearchUrls: [HF_SEARCH_URL, HF_MICROSOFT_SEARCH_URL],
      declaredScopeExhausted: true, globalExhaustion: false,
      sourceUniverseExhausted: false,
    },
    closure: { disposition: "METADATA_ONLY", terminal: true,
      reasonCode: "DECLARED_PUBLIC_REPOSITORY_UNAVAILABLE_NO_PUBLIC_DATASET_PAYLOAD",
      officialMetadataObjects: AGENTLENS_SOURCE_OBJECT_SPECS.length,
      publicPayloadFiles: 0, rawTrajectoryFiles: 0, rawDialogueFiles: 0,
      rawToolContentFiles: 0, repositoryRevision: null, datasetRevision: null,
      paperLicenseClaim: "CC-BY-4.0", datasetPayloadLicenseEstablished: false,
      datasetPayloadLicense: null, privacyGuaranteeEstablished: false,
    },
    objects, sourceRoot: sourceRootFor(objects) };
}

function manifestCore(manifest) {
  const copy = structuredClone(manifest);
  delete copy.manifestHash;
  return copy;
}

export function buildAgentLensMetadataSourceManifest(sourceDirectory, observations) {
  const root = path.resolve(sourceDirectory);
  if (!Array.isArray(observations)
    || observations.length !== AGENTLENS_SOURCE_OBJECT_SPECS.length) {
    fail("OBSERVATIONS_INVALID");
  }
  const byLabel = new Map(observations.map((item) => [item?.label, item]));
  if (byLabel.size !== observations.length) fail("OBSERVATION_DUPLICATE");
  const objects = AGENTLENS_SOURCE_OBJECT_SPECS.map((spec) => {
    const observed = byLabel.get(spec.label);
    if (!exactObject(observed) || observed.status !== spec.status
      || observed.source !== spec.source || observed.responseUrl !== spec.responseUrl
      || observed.contentType !== spec.contentType
      || typeof observed.observedAt !== "string" || !UTC_MILLIS.test(observed.observedAt)
      || new Date(observed.observedAt).toISOString() !== observed.observedAt) {
      fail("OBSERVATION_BINDING_INVALID", spec.label);
    }
    const bytes = readPrivate(path.join(root, spec.path), spec.maximumBytes);
    return { label: spec.label, path: spec.path, source: spec.source,
      responseUrl: spec.responseUrl, status: spec.status, contentType: spec.contentType,
      observedAt: observed.observedAt, sizeBytes: bytes.length,
      fileSha256: agentLensSha256(bytes), maximumBytes: spec.maximumBytes };
  });
  const dates = objects.map((item) => item.observedAt).sort();
  const body = sourceManifestBody(objects, dates[0], dates.at(-1));
  evidenceReplay(root, body);
  const manifest = { ...body };
  manifest.manifestHash = agentLensDigest(manifest,
    `${AGENTLENS_SOURCE_SCHEMA}/manifest`);
  return manifest;
}

export function verifyAgentLensMetadataSourceDirectory(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
      || (rootStat.mode & 0o777) !== 0o700) fail("SOURCE_ROOT_INVALID");
    const manifestBytes = readPrivate(path.join(root, "source-manifest.json"), 2_000_000);
    const manifest = parseJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID");
    if (!exactObject(manifest) || manifest.schema !== AGENTLENS_SOURCE_SCHEMA
      || !Array.isArray(manifest.objects)
      || manifest.objects.length !== AGENTLENS_SOURCE_OBJECT_SPECS.length
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")
      || !UTC_MILLIS.test(manifest.observedFrom ?? "")
      || !UTC_MILLIS.test(manifest.observedThrough ?? "")
      || manifest.observedFrom > manifest.observedThrough) fail("SOURCE_MANIFEST_INVALID");
    const specByLabel = new Map(AGENTLENS_SOURCE_OBJECT_SPECS.map((item) =>
      [item.label, item]));
    const labels = new Set();
    for (const item of manifest.objects) {
      const spec = specByLabel.get(item?.label);
      if (!spec || labels.has(item.label)) fail("SOURCE_OBJECT_DESCRIPTOR_INVALID");
      labels.add(item.label);
      safeRelative(item.path);
      if (item.path !== spec.path || item.source !== spec.source
        || item.responseUrl !== spec.responseUrl || item.status !== spec.status
        || item.contentType !== spec.contentType || item.maximumBytes !== spec.maximumBytes
        || !UTC_MILLIS.test(item.observedAt ?? "")
        || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1
        || item.sizeBytes > item.maximumBytes || !HASH.test(item.fileSha256 ?? "")) {
        fail("SOURCE_OBJECT_DESCRIPTOR_INVALID", item.label);
      }
      const bytes = readPrivate(path.join(root, item.path), item.maximumBytes);
      if (bytes.length !== item.sizeBytes || agentLensSha256(bytes) !== item.fileSha256) {
        fail("SOURCE_OBJECT_BYTES_INVALID", item.label);
      }
    }
    const expectedFiles = sorted(["source-manifest.json",
      ...AGENTLENS_SOURCE_OBJECT_SPECS.map((item) => item.path)]);
    if (!same(listPrivateFiles(root), expectedFiles)) fail("SOURCE_FILE_SET_INVALID");
    const observedDates = manifest.objects.map((item) => item.observedAt).sort();
    const expected = sourceManifestBody(manifest.objects, observedDates[0],
      observedDates.at(-1));
    if (!same(manifestCore(manifest), expected)
      || manifest.sourceRoot !== sourceRootFor(manifest.objects)
      || manifest.manifestHash !== agentLensDigest(manifestCore(manifest),
        `${AGENTLENS_SOURCE_SCHEMA}/manifest`)) fail("SOURCE_MANIFEST_REBUILD_MISMATCH");
    const replay = evidenceReplay(root, manifest);
    return { ok: true, verificationLevel: "FULL_OFFICIAL_METADATA_AND_ABSENCE_REPLAY",
      sourceDirectory: root, manifest, replay, sourceRoot: manifest.sourceRoot,
      manifestFileSha256: agentLensSha256(manifestBytes) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function reportBody(source) {
  return { schema: AGENTLENS_REPORT_SCHEMA, generatedAt: source.observedThrough, source,
    disposition: { candidateId: "MICROSOFT_AGENTLENS_BENCH_PUBLIC_PAYLOAD",
      status: "METADATA_ONLY", terminal: true,
      reasonCode: "DECLARED_PUBLIC_REPOSITORY_UNAVAILABLE_NO_PUBLIC_DATASET_PAYLOAD",
      gates: { officialMicrosoftPublicationPresent: true, pinnedArxivV3Present: true,
        declaredGithubRepositoryPubliclyAvailable: false,
        githubOrganizationSearchMatches: 0, huggingFaceAgentLensSearchMatches: 0,
        publicPayloadTreeEstablished: false, publicPayloadRevisionEstablished: false,
        payloadSchemaReplayed: false, payloadRightsResolved: false,
        payloadPrivacyReviewed: false } },
    officialIdentity: {
      title: "AgentLens: Revealing The Lucky Pass Problem in SWE-Agent Evaluation",
      microsoftAffiliationPresent: true, arxivId: AGENTLENS_ARXIV_ID,
      arxivVersion: AGENTLENS_ARXIV_VERSION, paperRevisionPinned: true,
      declaredRepository: AGENTLENS_DECLARED_REPOSITORY,
      repositoryRevision: null, datasetRevision: null,
      publicationPageReleaseClaim: "RELEASED_ANONYMIZED_REPOSITORY",
      pinnedPaperReleaseStatement: "PLANNED_SOON",
      publisherSurfaceConflictPreserved: true,
    },
    discovery: { exactChecks: [
      { id: "DECLARED_GITHUB_REPOSITORY", observations: 2, httpStatus: 404,
        publicMatches: 0 },
      { id: "GITHUB_MICROSOFT_AGENTLENS_SEARCH", observations: 2, httpStatus: 200,
        publicMatches: 0, incompleteResults: false },
      { id: "HF_AGENTLENS_SEARCH", observations: 2, httpStatus: 200,
        publicMatches: 0 },
      { id: "HF_MICROSOFT_AGENTLENS_SEARCH", observations: 2, httpStatus: 200,
        publicMatches: 0 },
    ], declaredScopeExhausted: true, globalExhaustion: false,
    sourceUniverseExhausted: false,
    noClaimThatAHiddenPrivateRepositoryDoesNotExist: true },
    publisherClaims: {
      corpus: { trajectories: 2_614, tasks: 60, modelBackends: 8,
        pass: 1_389, fail: 1_217, outcomeUnrecorded: 8,
        partitionArithmeticExact: true },
      agentLensBenchSubset: { trajectories: 1_815, ptaEligibleTasks: 47,
        pass: 1_136, fail: 679, partitionArithmeticExact: true,
        subsetOfCorpus: true, featureColumns: 40 },
      annotations: { qualityScores: true, wasteSignals: true,
        divergencePoints: true, qualityTierLabels: true,
        taskLevelPtaReferences: 47 },
      luckyPass: { publisherRatePercentOfPassingSubset: 10.7,
        publisherLabeledCount: 122, independentReplayPerformed: false },
    },
    payloadReplay: { publicPayloadAvailable: false, publicPayloadFiles: 0,
      sourceNativeTrajectoryFiles: 0, sourceNativeTrajectoryRows: 0,
      rawDialogueFiles: 0, rawDialogueRows: 0, rawToolContentFiles: 0,
      rawToolContentRows: 0, publisherLabelRows: 0, qualityScoreRows: 0,
      wasteSignalRows: 0, divergencePointRows: 0, ptaObjects: 0 },
    denominators: {
      publisherCorpusTrajectoryClaim: { units: 2_614,
        unit: "PUBLISHER_CLAIMED_CORPUS_TRAJECTORY", replayed: false },
      publisherBenchSubsetTrajectoryClaim: { units: 1_815,
        unit: "PUBLISHER_CLAIMED_BENCH_SUBSET_TRAJECTORY", replayed: false,
        nestedWithinCorpusClaim: true },
      sourceNativeTrajectoryRows: { units: 0, unit: "SOURCE_NATIVE_TRAJECTORY_ROW" },
      completeAttemptCensus: { units: 0, established: false },
      crossPopulationTotal: null, additionProhibited: true,
    },
    truthBoundary: { officialPaperClaimsEstablished: true,
      publicPayloadAvailabilityEstablished: false, sourceNativeSchemaReplayed: false,
      sourceNativeTrajectoriesReplayed: false, publisherLabelsReplayed: false,
      passFailOutcomesIndependentlyVerified: false,
      qualityScoresIndependentlyVerified: false,
      wasteSignalsCausalTruthEstablished: false,
      divergencePointsIndependentlyVerified: false,
      luckyPassClassificationIndependentlyVerified: false,
      completeAttemptCensusEstablished: false,
      delegationOrExecutionAuthorityEstablished: false },
    segments: { opportunityCensus: { units: 0, prospective: false },
      delegationAuthorization: { units: 0, established: false },
      action: { replayedTrajectoryUnits: 0, replayedToolActionUnits: 0 },
      effect: { independentUnits: 0, causalWasteUnits: 0 },
      outcome: { independentUnits: 0, verifiedSuccessUnits: 0,
        verifiedFailureUnits: 0 },
      recovery: { units: 0, verifiedRecoveryEffectUnits: 0 },
      longitudinal: { units: 0 }, attributionAdditionProhibited: true },
    rights: { paperLicenseClaim: "CC-BY-4.0", datasetPayloadLicense: null,
      datasetPayloadRightsEstablished: false,
      useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { publicationPageAnonymizedRepositoryClaim: true,
      payloadAvailableForPrivacyReview: false, rawRowsInspected: 0,
      independentAnonymizationVerification: false,
      reidentificationAssessmentComplete: false, noPiiGuaranteed: false,
      rawDialogueOrToolContentRetained: false },
    useBoundary: { status: "METADATA_ONLY", offlineEvaluationRows: 0,
      offlineModelFittingRows: 0, authorizedTrainingRows: 0,
      governedTrainingRows: 0, trainingPerformed: false },
    network: { rawNetworkAdmissionRows: 0, networkAdmissionRows: 0 },
    economics: { CEU: 0, pricingUnits: 0 },
    authority: { executionAuthorityUnits: 0,
      executionAuthorityEstablished: false },
    rankedGaps: [
      "public repository or dataset payload at an exact immutable revision",
      "dataset payload license and use-specific rights clearance",
      "source-native trajectory schema, labels, PTAs, and score rows",
      "privacy and anonymization review of raw dialogue and tool content",
      "independent outcome, quality, divergence, and causal-waste verification",
      "prospective opportunity, attempt census, recovery, and longitudinal linkage",
    ],
    verification: { level: "FULL_OFFICIAL_METADATA_AND_ABSENCE_REDERIVED",
      metadataOnly: true, payloadRowsRederived: 0 } };
}

function reportCore(report) {
  const copy = structuredClone(report);
  delete copy.artifactHash;
  return copy;
}

export function buildAgentLensMetadataDispositionReportFromSource(sourceDirectory) {
  const checked = verifyAgentLensMetadataSourceDirectory(sourceDirectory);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  const source = { sourceRoot: checked.sourceRoot,
    sourceManifestHash: checked.manifest.manifestHash,
    sourceManifestFileSha256: checked.manifestFileSha256,
    observedFrom: checked.manifest.observedFrom,
    observedThrough: checked.manifest.observedThrough,
    officialMetadataObjects: checked.manifest.objects.length,
    paperPdfBytes: checked.replay.paperPdfBytes,
    paperPdfSha256: checked.replay.paperPdfSha256,
    publicPayloadFiles: 0, sourceNativeTrajectoryRows: 0 };
  const report = reportBody(source);
  report.artifactHash = agentLensDigest(report, `${AGENTLENS_REPORT_SCHEMA}/artifact`);
  const verified = verifyAgentLensMetadataDispositionReport(report);
  if (!verified.ok) fail("BUILT_REPORT_INVALID", verified.error);
  return report;
}

export function verifyAgentLensMetadataDispositionReport(report) {
  try {
    if (!exactObject(report) || report.schema !== AGENTLENS_REPORT_SCHEMA
      || !HASH.test(report.artifactHash ?? "")
      || !exactObject(report.source) || !HASH.test(report.source.sourceRoot ?? "")
      || !HASH.test(report.source.sourceManifestHash ?? "")
      || !HASH.test(report.source.sourceManifestFileSha256 ?? "")
      || !HASH.test(report.source.paperPdfSha256 ?? "")
      || !UTC_MILLIS.test(report.source.observedFrom ?? "")
      || !UTC_MILLIS.test(report.source.observedThrough ?? "")
      || report.source.observedFrom > report.source.observedThrough) fail("REPORT_SHAPE_INVALID");
    const expected = reportBody(report.source);
    if (!same(reportCore(report), expected)
      || report.artifactHash !== agentLensDigest(reportCore(report),
        `${AGENTLENS_REPORT_SCHEMA}/artifact`)) fail("REPORT_REBUILD_MISMATCH");
    if (report.publisherClaims.corpus.pass + report.publisherClaims.corpus.fail
        + report.publisherClaims.corpus.outcomeUnrecorded
        !== report.publisherClaims.corpus.trajectories
      || report.publisherClaims.agentLensBenchSubset.pass
        + report.publisherClaims.agentLensBenchSubset.fail
        !== report.publisherClaims.agentLensBenchSubset.trajectories) {
      fail("PUBLISHER_PARTITION_ARITHMETIC_INVALID");
    }
    return { ok: true, artifactHash: report.artifactHash,
      disposition: "METADATA_ONLY", publisherClaimedCorpusTrajectories: 2_614,
      publisherClaimedBenchTrajectories: 1_815, sourceNativeTrajectoryRows: 0,
      independentOutcomeUnits: 0, causalWasteUnits: 0, authorizedTrainingRows: 0,
      authorityUnits: 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyAgentLensMetadataDispositionReportWithSource(report,
  sourceDirectory) {
  const standalone = verifyAgentLensMetadataDispositionReport(report);
  if (!standalone.ok) return standalone;
  const source = verifyAgentLensMetadataSourceDirectory(sourceDirectory);
  if (!source.ok) return source;
  try {
    if (report.source.sourceRoot !== source.sourceRoot
      || report.source.sourceManifestHash !== source.manifest.manifestHash
      || report.source.sourceManifestFileSha256 !== source.manifestFileSha256
      || report.source.observedFrom !== source.manifest.observedFrom
      || report.source.observedThrough !== source.manifest.observedThrough
      || report.source.paperPdfSha256 !== source.replay.paperPdfSha256
      || report.source.paperPdfBytes !== source.replay.paperPdfBytes) {
      fail("REPORT_SOURCE_BINDING_INVALID");
    }
    const rebuilt = buildAgentLensMetadataDispositionReportFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("REPORT_SOURCE_REDERIVATION_MISMATCH");
    return { ...standalone, ok: true,
      verificationLevel: "FULL_OFFICIAL_METADATA_AND_ABSENCE_REDERIVED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function receiptCore(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receiptHash;
  return copy;
}

function expectedReceipt(report, reportBytes) {
  return { schema: AGENTLENS_RECEIPT_SCHEMA, createdAt: report.generatedAt,
    reportSchema: AGENTLENS_REPORT_SCHEMA, artifactHash: report.artifactHash,
    reportFileSha256: agentLensSha256(reportBytes),
    sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    paperPdfSha256: report.source.paperPdfSha256,
    verificationLevel: "FULL_OFFICIAL_METADATA_AND_ABSENCE_REDERIVED",
    closure: { disposition: "METADATA_ONLY", terminal: true,
      officialMetadataObjects: AGENTLENS_SOURCE_OBJECT_SPECS.length,
      publicPayloadFiles: 0, sourceNativeTrajectoryRows: 0,
      publisherClaimedCorpusTrajectories: 2_614,
      publisherClaimedBenchTrajectories: 1_815,
      independentOutcomeUnits: 0, causalWasteUnits: 0,
      completeAttemptCensusEstablished: false,
      authorizedTrainingRows: 0, networkAdmissionRows: 0,
      CEU: 0, pricingUnits: 0, authorityUnits: 0 } };
}

export function buildAgentLensMetadataDispositionReceipt(report, reportBytes) {
  const verified = verifyAgentLensMetadataDispositionReport(report);
  if (!verified.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_INPUT_INVALID");
  const receipt = expectedReceipt(report, reportBytes);
  receipt.receiptHash = agentLensDigest(receipt,
    `${AGENTLENS_RECEIPT_SCHEMA}/receipt`);
  return receipt;
}

export function verifyAgentLensMetadataDispositionReceipt(receipt, report, reportBytes) {
  try {
    const reportCheck = verifyAgentLensMetadataDispositionReport(report);
    if (!reportCheck.ok || !Buffer.isBuffer(reportBytes)) fail("RECEIPT_REPORT_INVALID");
    const expected = expectedReceipt(report, reportBytes);
    if (!exactObject(receipt) || !HASH.test(receipt.receiptHash ?? "")
      || !same(receiptCore(receipt), expected)
      || receipt.receiptHash !== agentLensDigest(receiptCore(receipt),
        `${AGENTLENS_RECEIPT_SCHEMA}/receipt`)) fail("RECEIPT_INVALID");
    return { ok: true, receiptHash: receipt.receiptHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publishAgentLensMetadataDispositionArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_EXISTS_OR_BROAD", target);
  }
  const parent = path.dirname(target);
  if (!existsSync(parent) || lstatSync(parent).isSymbolicLink()
    || !lstatSync(parent).isDirectory()) fail("PUBLISH_PARENT_INVALID", parent);
  renameSync(staging, target);
  chmodSync(target, 0o700);
  return target;
}

export function verifyAgentLensMetadataDispositionArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
      fail("ARTIFACT_ROOT_INVALID");
    }
    if (!same(sorted(readdirSync(root)),
      ["agentlens-metadata-disposition.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_TOP_LEVEL_INVALID");
    }
    const reportBytes = readPrivate(path.join(root, "agentlens-metadata-disposition.json"),
      2_000_000);
    const receiptBytes = readPrivate(path.join(root, "run-receipt.json"), 256_000);
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    const replay = verifyAgentLensMetadataDispositionReportWithSource(report,
      path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_SOURCE_REPLAY_INVALID", replay.error);
    const receiptCheck = verifyAgentLensMetadataDispositionReceipt(receipt, report,
      reportBytes);
    if (!receiptCheck.ok) fail("ARTIFACT_RECEIPT_INVALID", receiptCheck.error);
    return { ...replay, ok: true, report, receipt,
      reportFileSha256: agentLensSha256(reportBytes),
      receiptFileSha256: agentLensSha256(receiptBytes) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
