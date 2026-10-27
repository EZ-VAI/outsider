import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const DROID100_SOURCE_PREFIX = "gs://gresearch/robotics/droid_100/1.0.0/";
export const DROID100_SHARD_COUNT = 31;
export const DROID100_MAX_BYTES = 3 * 1024 * 1024 * 1024;

const MANIFEST_SCHEMA = "outsider/droid100-acquisition-manifest/v1";
const IMPORT_PLAN_SCHEMA = "outsider/droid100-import-plan/v1";
const EPISODE_FACT_SCHEMA = "outsider/droid100-episode-fact/v1";
const ADAPTER_VERSION = "1.0.0";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const SHARD_NAME = /^r2d2_faceblur-train\.tfrecord-([0-9]{5})-of-00031$/;

function digestBytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digestCanonical(value) {
  return digestBytes(canonicalizeStrict(value));
}

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function parseObjectList(input) {
  let parsed = input;
  if (Buffer.isBuffer(parsed)) parsed = parsed.toString("utf8");
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      fail("DROID100_OBJECT_LIST_INVALID_JSON");
    }
  }
  const entries = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(entries)) fail("DROID100_OBJECT_LIST_ARRAY_REQUIRED");
  return entries;
}

function base64OfExactBytes(value, bytes, field) {
  if (typeof value !== "string" || value.length === 0 || /\s/.test(value)) {
    fail(`DROID100_${field}_REQUIRED`);
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(`DROID100_${field}_INVALID`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== bytes || decoded.toString("base64") !== value) {
    fail(`DROID100_${field}_INVALID`);
  }
  return value;
}

function decimalString(value, field) {
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value) : value;
  if (typeof text !== "string" || !DECIMAL.test(text)) {
    fail(`DROID100_${field}_INVALID`);
  }
  return text;
}

function sourceUriFor(entry, metadata) {
  const declared = entry.uri ?? entry.url ?? metadata.uri ?? metadata.url ?? null;
  const bucket = metadata.bucket ?? entry.bucket ?? null;
  const name = metadata.name ?? entry.name ?? null;
  const normalizedName = name == null ? null : String(name).replace(/^\/+/, "");
  const derived = bucket && normalizedName
    ? `gs://${bucket}/${normalizedName}`
    : !bucket && normalizedName?.startsWith("robotics/droid_100/1.0.0/")
      ? `gs://gresearch/${normalizedName}` : null;
  if (declared != null && (typeof declared !== "string" || !declared.startsWith("gs://"))) {
    fail("DROID100_SOURCE_URI_INVALID");
  }
  if (declared && derived && declared !== derived) fail("DROID100_SOURCE_URI_CONFLICT");
  const uri = declared ?? derived;
  if (!uri || !uri.startsWith(DROID100_SOURCE_PREFIX)) fail("DROID100_SOURCE_PREFIX_MISMATCH");
  if (uri.includes("?") || uri.includes("#") || uri.includes("\\")) {
    fail("DROID100_SOURCE_URI_INVALID");
  }
  return uri;
}

function roleForName(name) {
  if (name === "dataset_info.json") return { role: "DATASET_INFO", shardIndex: null };
  if (name === "features.json") return { role: "FEATURES", shardIndex: null };
  const match = SHARD_NAME.exec(name);
  if (!match) fail("DROID100_OBJECT_NAME_UNEXPECTED", name);
  const shardIndex = Number(match[1]);
  if (shardIndex >= DROID100_SHARD_COUNT) fail("DROID100_SHARD_INDEX_INVALID", name);
  return { role: "TFRECORD_SHARD", shardIndex };
}

function normalizeObject(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail("DROID100_OBJECT_METADATA_INVALID");
  }
  const metadata = entry.metadata && typeof entry.metadata === "object"
    && !Array.isArray(entry.metadata) ? entry.metadata : entry;
  const uri = sourceUriFor(entry, metadata);
  const name = uri.slice(DROID100_SOURCE_PREFIX.length);
  if (!name || name.includes("/")) fail("DROID100_OBJECT_NAME_UNEXPECTED", name);
  const { role, shardIndex } = roleForName(name);
  const generation = decimalString(metadata.generation ?? entry.generation, "GENERATION");
  if (generation === "0") fail("DROID100_GENERATION_INVALID");
  const sizeText = decimalString(metadata.size ?? entry.size, "SIZE");
  const size = BigInt(sizeText);
  if (size <= 0n) fail("DROID100_SIZE_INVALID");
  if (size > BigInt(DROID100_MAX_BYTES)) fail("DROID100_OBJECT_OVERSIZE", name);
  const md5Base64 = base64OfExactBytes(
    metadata.md5Hash ?? entry.md5Hash, 16, "MD5",
  );
  const crc32cBase64 = base64OfExactBytes(
    metadata.crc32c ?? entry.crc32c, 4, "CRC32C",
  );
  const leafBody = {
    uri,
    generation,
    sizeBytes: Number(size),
    md5Base64,
    crc32cBase64,
  };
  const leafHash = digestBytes(
    `outsider:droid100:object-leaf:v1\0${canonicalizeStrict(leafBody)}`,
  );
  return { role, shardIndex, ...leafBody, leafHash };
}

function merkleRoot(objects) {
  let level = objects.map((object) => object.leafHash);
  if (level.length === 0) fail("DROID100_MERKLE_EMPTY");
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(digestBytes(`outsider:droid100:merkle-node:v1\0${left}\0${right}`));
    }
    level = next;
  }
  return level[0];
}

function validateCompleteSet(objects) {
  const uriSet = new Set(objects.map((object) => object.uri));
  if (uriSet.size !== objects.length) fail("DROID100_DUPLICATE_OBJECT");
  if (objects.filter((object) => object.role === "DATASET_INFO").length !== 1) {
    fail("DROID100_DATASET_INFO_REQUIRED");
  }
  if (objects.filter((object) => object.role === "FEATURES").length !== 1) {
    fail("DROID100_FEATURES_REQUIRED");
  }
  const shards = objects.filter((object) => object.role === "TFRECORD_SHARD");
  const indices = new Set(shards.map((object) => object.shardIndex));
  for (let index = 0; index < DROID100_SHARD_COUNT; index += 1) {
    if (!indices.has(index)) fail("DROID100_SHARD_MISSING", String(index).padStart(5, "0"));
  }
  if (shards.length !== DROID100_SHARD_COUNT) fail("DROID100_SHARD_COUNT_INVALID");
  if (objects.length !== DROID100_SHARD_COUNT + 2) {
    fail("DROID100_OBJECT_COUNT_INVALID", objects.length);
  }
}

function fixedPolicy() {
  const attributionNotice = {
    statement: "Source: DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset, Khazatsky et al., arXiv:2403.12945. The official paper declares the dataset under Creative Commons Attribution 4.0 International (CC BY 4.0). This adapter creates a privacy-safe hashed and numeric projection and does not redistribute raw media.",
    sourceUrl: "https://arxiv.org/html/2403.12945",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    changes: "Privacy-safe projection; raw media, paths, language, and collector identity excluded.",
  };
  return {
    license: {
      status: "DECLARED_BY_OFFICIAL_PAPER_NOT_GCS_OBJECT_METADATA",
      identifier: "CC-BY-4.0",
      declarationSourceUrl: attributionNotice.sourceUrl,
      termsUrl: attributionNotice.licenseUrl,
      objectMetadataVerified: false,
      adapterGrantsRights: false,
      requiredBeforeUse: "Preserve attribution, link the license, indicate changes, and review the official terms.",
      attributionNotice: {
        ...attributionNotice,
        noticeHash: digestBytes(
          `outsider:droid100:attribution-notice:v1\0${canonicalizeStrict(attributionNotice)}`,
        ),
      },
    },
    citation: {
      dataset: "DROID 100",
      work: "DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset",
      identifier: "arXiv:2403.12945",
      url: "https://arxiv.org/html/2403.12945",
    },
    limitations: [
      "The corpus contains observational recordings, not randomized interventions.",
      "Object checksums establish byte identity, not truth, safety, or collector authenticity.",
      "This subset may not represent the full task, robot, site, or operator distribution.",
      "No episode is causal, pricing, guarantee, or training evidence merely because it was imported.",
      "GCS metadata is not a device signature or a trusted collection-time attestation.",
    ],
    privacy: {
      retainedEpisodeFields: "HASHED_IDENTIFIERS_AND_NUMERIC_SUMMARIES_ONLY",
      rawImages: "FORBIDDEN",
      rawSensorBytes: "FORBIDDEN",
      sourcePaths: "FORBIDDEN_IN_EPISODE_FACTS",
      collectorIdentity: "FORBIDDEN",
      instructionText: "HASH_AND_DISCARD",
    },
    authority: {
      lane: "RESEARCH",
      authority: "none",
      admission: "QUARANTINE_ONLY",
      automaticLearningPromotion: false,
    },
  };
}

/**
 * Build a deterministic byte-acquisition commitment from a GCS JSON object list.
 * Supported inputs are a JSON array, `{ items: [...] }`, or their JSON text.
 * `gcloud storage ls --json` wrapper entries with `{ url, metadata }` are accepted.
 */
export function buildDroid100AcquisitionManifest(objectListJson) {
  const objects = parseObjectList(objectListJson).map(normalizeObject)
    .sort((left, right) => (left.uri < right.uri ? -1 : left.uri > right.uri ? 1 : 0));
  validateCompleteSet(objects);
  const totalBytes = objects.reduce((sum, object) => sum + object.sizeBytes, 0);
  if (totalBytes > DROID100_MAX_BYTES) fail("DROID100_CORPUS_OVERSIZE", totalBytes);
  const body = {
    schema: MANIFEST_SCHEMA,
    adapterVersion: ADAPTER_VERSION,
    dataset: {
      id: "r2d2_faceblur",
      distributionAlias: "droid_100",
      version: "1.0.0",
      sourcePrefix: DROID100_SOURCE_PREFIX,
      expectedShardCount: DROID100_SHARD_COUNT,
      objectCount: objects.length,
    },
    objects,
    integrity: {
      totalBytes,
      maximumBytes: DROID100_MAX_BYTES,
      objectLeafAlgorithm: "sha256(domain || canonical(uri,generation,size,md5,crc32c))",
      merkleAlgorithm: "sha256 domain-separated binary tree; duplicate odd right leaf",
      merkleRoot: merkleRoot(objects),
    },
    ...fixedPolicy(),
  };
  return { ...body, manifestHash: digestCanonical(body) };
}

export function verifyDroid100AcquisitionManifest(manifest) {
  try {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      fail("DROID100_MANIFEST_INVALID");
    }
    const rebuilt = buildDroid100AcquisitionManifest(
      (manifest.objects ?? []).map((object) => ({
        uri: object.uri,
        generation: object.generation,
        size: object.sizeBytes,
        md5Hash: object.md5Base64,
        crc32c: object.crc32cBase64,
      })),
    );
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(manifest)) {
      fail("DROID100_MANIFEST_COMMITMENT_MISMATCH");
    }
    return { ok: true, manifestHash: manifest.manifestHash, merkleRoot: manifest.integrity.merkleRoot };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * This plan is intentionally only a local acquisition/extraction plan. The GCS
 * URI is needed by a downloader, but it is never copied into an episode fact.
 * The dependency-free RLDS/TFRecord extractor is a separate module so acquisition
 * metadata cannot accidentally become episode evidence. It emits only the strict
 * privacy-safe Stage 1.5 schema.
 */
export function createDroid100ImportPlan(manifest) {
  const verified = verifyDroid100AcquisitionManifest(manifest);
  if (!verified.ok) fail("DROID100_MANIFEST_UNVERIFIED", verified.error);
  const shards = manifest.objects.filter((object) => object.role === "TFRECORD_SHARD")
    .sort((left, right) => left.shardIndex - right.shardIndex)
    .map((object) => ({
      shardIndex: object.shardIndex,
      acquisitionUri: object.uri,
      generation: object.generation,
      expectedSizeBytes: object.sizeBytes,
      md5Base64: object.md5Base64,
      crc32cBase64: object.crc32cBase64,
      sourceObjectLeafHash: object.leafHash,
    }));
  const body = {
    schema: IMPORT_PLAN_SCHEMA,
    adapterVersion: ADAPTER_VERSION,
    manifestHash: manifest.manifestHash,
    merkleRoot: manifest.integrity.merkleRoot,
    totalBytes: manifest.integrity.totalBytes,
    extractor: {
      requiredInput: "TFDS/RLDS DROID 100 v1.0.0 TFRecord shards",
      implementationBundled: true,
      module: "src/outsider-droid100-rlds.js",
      pilotCommand: "node scripts/stage15-droid100-real-pilot.mjs --output-dir <new-output-directory>",
      boundary: "Extractor runs locally; raw images, paths, language, and collector identity never enter normalized records.",
      aggregateOutputSchema: EPISODE_FACT_SCHEMA,
      stepOutputSchema: "outsider/curate-episode-input/v1",
    },
    shards,
    admission: "QUARANTINE_ONLY",
    automaticLearningPromotion: false,
  };
  return { ...body, planHash: digestCanonical(body) };
}

function finiteInteger(value, field, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`DROID100_${field}_INVALID`);
  return value;
}

function optionalBoolean(value, field) {
  if (value == null) return null;
  if (typeof value !== "boolean") fail(`DROID100_${field}_INVALID`);
  return value;
}

function requireDigest(value, field) {
  if (!SHA256.test(String(value ?? ""))) fail(`DROID100_${field}_INVALID`);
  return value;
}

/**
 * Privacy boundary for optional extractors. Unknown fields fail closed so raw
 * images, paths, collector labels, absolute timestamps, or full trajectories
 * cannot silently enter the normalized Stage 1.5 record.
 */
export function normalizeDroid100EpisodeFact(input, { manifest } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("DROID100_EPISODE_INPUT_INVALID");
  }
  const verifiedManifest = verifyDroid100AcquisitionManifest(manifest);
  if (!verifiedManifest.ok) fail("DROID100_EPISODE_MANIFEST_UNVERIFIED", verifiedManifest.error);
  const allowed = new Set([
    "manifestHash", "sourceObjectLeafHash", "episodeKey", "episodeOrdinal",
    "stepCount", "durationMs", "success", "terminated", "truncated",
    "actionDimensions", "proprioceptionDimensions", "cameraStreamCount",
    "languageInstruction",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail("DROID100_EPISODE_FIELD_FORBIDDEN", key);
  }
  requireDigest(input.manifestHash, "MANIFEST_HASH");
  requireDigest(input.sourceObjectLeafHash, "OBJECT_LEAF_HASH");
  if (input.manifestHash !== manifest.manifestHash) fail("DROID100_EPISODE_MANIFEST_MISMATCH");
  const sourceObject = manifest.objects.find((object) => (
    object.leafHash === input.sourceObjectLeafHash && object.role === "TFRECORD_SHARD"
  ));
  if (!sourceObject) fail("DROID100_EPISODE_SOURCE_SHARD_UNBOUND");
  if (typeof input.episodeKey !== "string" || input.episodeKey.length === 0
      || input.episodeKey.length > 1024) fail("DROID100_EPISODE_KEY_INVALID");
  if (typeof input.languageInstruction !== "undefined"
      && (typeof input.languageInstruction !== "string"
        || input.languageInstruction.length > 65536)) {
    fail("DROID100_LANGUAGE_INSTRUCTION_INVALID");
  }
  const instructionPresent = Boolean(input.languageInstruction);
  const body = {
    schema: EPISODE_FACT_SCHEMA,
    adapterVersion: ADAPTER_VERSION,
    source: {
      manifestHash: input.manifestHash,
      objectLeafHash: input.sourceObjectLeafHash,
      shardIndex: sourceObject.shardIndex,
      episodeOrdinal: finiteInteger(input.episodeOrdinal, "EPISODE_ORDINAL"),
    },
    episode: {
      keyHash: digestBytes(`outsider:droid100:episode-key:v1\0${input.episodeKey}`),
      stepCount: finiteInteger(input.stepCount, "STEP_COUNT", { minimum: 1 }),
      durationMs: finiteInteger(input.durationMs, "DURATION_MS"),
    },
    observations: {
      cameraStreamCount: finiteInteger(input.cameraStreamCount ?? 0, "CAMERA_STREAM_COUNT"),
      proprioceptionDimensions: finiteInteger(
        input.proprioceptionDimensions ?? 0, "PROPRIOCEPTION_DIMENSIONS",
      ),
      instructionPresent,
      instructionHash: instructionPresent
        ? digestBytes(`outsider:droid100:instruction:v1\0${input.languageInstruction}`) : null,
    },
    actions: {
      dimensions: finiteInteger(input.actionDimensions ?? 0, "ACTION_DIMENSIONS"),
    },
    outcome: {
      success: optionalBoolean(input.success, "SUCCESS"),
      terminated: optionalBoolean(input.terminated, "TERMINATED"),
      truncated: optionalBoolean(input.truncated, "TRUNCATED"),
    },
    privacy: {
      rawImagesIncluded: false,
      rawSensorBytesIncluded: false,
      sourcePathIncluded: false,
      collectorIdentityIncluded: false,
      instructionTextIncluded: false,
      absoluteTimestampIncluded: false,
    },
    admissibility: {
      stage15: "QUARANTINE_ONLY",
      causalEvidence: false,
      pricingEvidence: false,
      guaranteeEvidence: false,
      automaticLearningPromotion: false,
    },
  };
  return { ...body, factHash: digestCanonical(body) };
}
