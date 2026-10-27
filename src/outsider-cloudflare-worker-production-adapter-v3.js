/*
 * Cloudflare Worker production adapter upload-protocol descendant v3.
 *
 * Frozen v1/v2 manually encode a multipart body whose entry module is named
 * `worker.mjs`. A live Scripts API response reported code 10021 with that
 * module unresolved. Cloudflare's current documentation defines main_module
 * as the uploaded module part/filename, and current Wrangler emits a native
 * FormData tuple whose part name and filename are identical. This descendant
 * leaves the reversible Worker lifecycle untouched while translating only the
 * v1 initial-script PUT into that current, canonical wire shape:
 *
 *   metadata.main_module === part name === filename === "worker.js"
 *
 * FormData owns the multipart boundary. In particular, this module never
 * forwards the legacy hand-authored Content-Type boundary. Renaming `.mjs` is
 * a compatibility normalization, not a claim that Cloudflare universally
 * forbids that extension; code 10021 proves failed module resolution, not the
 * extension-specific cause by itself.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { createCloudflareWorkerPreactivatedProductionAdapterV2 }
  from "./outsider-cloudflare-worker-preactivated-production-adapter-v2.js";
import { createCloudflareWorkerProductionAdapterV1 }
  from "./outsider-cloudflare-worker-production-adapter-v1.js";

const PREFIX = "OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_";
const API_ORIGIN = "https://api.cloudflare.com";
const LEGACY_MAIN_MODULE = "worker.mjs";
const MAIN_MODULE = "worker.js";
const MODULE_MIME = "application/javascript+module";
const INITIAL_SCRIPT_UPLOAD_PATH
  = /^\/client\/v4\/accounts\/[a-f0-9]{32}\/workers\/scripts\/outsider-[a-f0-9]{32}$/u;

export const OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_SOURCE_PINS
  = Object.freeze({
    officialMultipartMetadata:
      "https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/",
    officialUploadWorkerModule:
      "https://developers.cloudflare.com/api/resources/workers/subresources/scripts/",
    officialPutScriptContent:
      "https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/content/methods/update/",
    localWranglerVersion: "4.124.0",
    localWranglerEncoder: "createWorkerUploadForm",
  });

export const OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_PROTOCOL
  = Object.freeze({
    schema: "outsider/cloudflare-worker-module-upload-protocol/v3",
    schemaVersion: "3.0.0",
    endpoint: "PUT /accounts/{account_id}/workers/scripts/{script_name}",
    metadataPartName: "metadata",
    mainModuleMetadataValue: MAIN_MODULE,
    mainModulePartName: MAIN_MODULE,
    mainModuleFilename: MAIN_MODULE,
    mainModuleContentType: MODULE_MIME,
    multipartEncoder: "NATIVE_FORM_DATA",
    callerSetsMultipartContentType: false,
    providerErrorUnderDiagnosis: 10021,
    providerErrorMeaning: "UPLOADED_MODULE_REFERENCE_DID_NOT_RESOLVE",
    mjsExtensionAloneProvenInvalid: false,
    liveMutationPerformedByDiagnosis: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function isInitialScriptUpload(url, init) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  return parsed.origin === API_ORIGIN
    && parsed.search === ""
    && parsed.hash === ""
    && INITIAL_SCRIPT_UPLOAD_PATH.test(parsed.pathname)
    && init?.method === "PUT";
}

function exactLegacyKeys(form) {
  const keys = [...form.keys()];
  return keys.length === 2
    && keys[0] === "metadata"
    && keys[1] === LEGACY_MAIN_MODULE
    && form.getAll("metadata").length === 1
    && form.getAll(LEGACY_MAIN_MODULE).length === 1;
}

async function normalizeInitialScriptUpload(init) {
  const legacyHeaders = new Headers(init.headers ?? {});
  const contentType = legacyHeaders.get("content-type");
  if (typeof contentType !== "string"
    || !/^multipart\/form-data;\s*boundary=[A-Za-z0-9_-]+$/u
      .test(contentType)) fail("LEGACY_MULTIPART_CONTENT_TYPE_INVALID");
  if (!(Buffer.isBuffer(init.body) || init.body instanceof Uint8Array)) {
    fail("LEGACY_MULTIPART_BODY_INVALID");
  }

  let legacyForm;
  try {
    legacyForm = await new Response(init.body, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    fail("LEGACY_MULTIPART_PARSE_FAILED");
  }
  if (!exactLegacyKeys(legacyForm)) fail("LEGACY_MULTIPART_PARTS_INVALID");

  const metadataText = legacyForm.get("metadata");
  const legacyModule = legacyForm.get(LEGACY_MAIN_MODULE);
  if (typeof metadataText !== "string"
    || legacyModule === null || typeof legacyModule !== "object"
    || typeof legacyModule.arrayBuffer !== "function"
    || legacyModule.name !== LEGACY_MAIN_MODULE
    || legacyModule.type !== MODULE_MIME) {
    fail("LEGACY_MULTIPART_PARTS_INVALID");
  }
  let metadata;
  try { metadata = JSON.parse(metadataText); }
  catch { fail("LEGACY_METADATA_INVALID"); }
  if (metadata === null || typeof metadata !== "object"
    || Array.isArray(metadata)
    || metadata.main_module !== LEGACY_MAIN_MODULE
    || Object.hasOwn(metadata, "body_part")) fail("LEGACY_METADATA_INVALID");

  const moduleBytes = new Uint8Array(await legacyModule.arrayBuffer());
  const currentMetadata = { ...metadata, main_module: MAIN_MODULE };
  const body = new FormData();
  // This is the same shape current Wrangler produces: metadata is a string
  // field; an ES module is a file field keyed by its module name.
  body.set("metadata", JSON.stringify(currentMetadata));
  body.set(MAIN_MODULE, new Blob([moduleBytes], { type: MODULE_MIME }),
    MAIN_MODULE);

  // Fetch must generate a boundary matching the native FormData encoding.
  // Retaining a caller-supplied boundary is a malformed request.
  legacyHeaders.delete("content-type");
  legacyHeaders.delete("content-length");
  return { ...init, headers: legacyHeaders, body };
}

/**
 * Wrap a fetch-compatible transport. Only the exact deterministic v1 Worker
 * staging PUT is normalized; activation, observation and deletion pass through
 * byte-for-byte. No request is issued until the returned function is invoked.
 */
export function createCloudflareWorkerUploadTransportV3(fetchImpl) {
  if (typeof fetchImpl !== "function") fail("FETCH_INVALID");
  return async function cloudflareWorkerUploadTransportV3(url, init = {}) {
    const currentInit = isInitialScriptUpload(url, init)
      ? await normalizeInitialScriptUpload(init)
      : init;
    return fetchImpl(url, currentInit);
  };
}

function protocolBinding(adapterId) {
  return Object.freeze({
    adapterId,
    protocol: OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_PROTOCOL,
    protocolHash: digest(
      "outsider/cloudflare-worker-module-upload-protocol/v3",
      OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_PROTOCOL),
  });
}

/**
 * Direct v1 lifecycle descendant for callers that do not need formation-time
 * route preactivation.
 */
export function createCloudflareWorkerProductionAdapterV3(input = {}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const adapterId = input.adapterId ?? "cloudflare-worker-production-v3";
  const child = createCloudflareWorkerProductionAdapterV1({
    ...input,
    adapterId,
    fetchImpl: createCloudflareWorkerUploadTransportV3(fetchImpl),
  });
  return Object.freeze({ ...child, uploadProtocol: protocolBinding(adapterId) });
}

/**
 * Current formation adapter descendant. It preserves every v2 preactivation,
 * controlled-failure and verified-cleanup rule, changing only its two v1
 * children' initial upload encoding.
 */
export function createCloudflareWorkerPreactivatedProductionAdapterV3(
  input = {}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const adapterId = input.preactivatedAdapterId
    ?? "cloudflare-worker-preactivated-production-v3";
  const child = createCloudflareWorkerPreactivatedProductionAdapterV2({
    ...input,
    preactivatedAdapterId: adapterId,
    fetchImpl: createCloudflareWorkerUploadTransportV3(fetchImpl),
  });
  return Object.freeze({ ...child, uploadProtocol: protocolBinding(adapterId) });
}

