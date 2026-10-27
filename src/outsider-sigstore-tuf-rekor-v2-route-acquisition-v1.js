/*
 * Production, read-only Sigstore TUF -> Rekor v2 route acquisition.
 *
 * This bridge deliberately stops before any Rekor POST.  @sigstore/tuf@4.0.2
 * authenticates and refreshes the public-good TUF repository, after which this
 * module retrieves two exact targets, applies the documented SigningConfig
 * selection rule, and cross-binds the selected Rekor v2 origin to its
 * Ed25519 C2SP checkpoint key identifier in TrustedRoot v0.1.
 *
 * The network-safe projection contains only public route facts and content
 * commitments.  Exact target bytes and the transport-ready selection remain
 * private material and can be emitted only through the 0600 artifact writer.
 * Neither TUF authentication nor a log route creates authority, capacity, an
 * outcome, trusted time, or permission to perform a write.
 */

import { createHash, createPublicKey } from "node:crypto";
import {
  constants, lstatSync, readFileSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { isProxy } from "node:util/types";

import { initTUF as sigstoreInitTUF } from "@sigstore/tuf";

import { canonicalizeStrict } from "./canonical.js";
import { publishPrivateArtifact }
  from "./outsider-private-artifact-publication.js";
import { createRekorV2PinnedTufServiceSelectionV2 }
  from "./outsider-rekor-durable-effect-head-transport-v2.js";

const PREFIX = "OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_";
const TUF_PACKAGE_NAME = "@sigstore/tuf";
const TUF_PACKAGE_VERSION = "4.0.2";
const TUF_PACKAGE_INTEGRITY
  = "sha512-TCAzTy0xzdP79EnxSjq9KQ3eaR7+FmudLC6eRKknVKZbV7ZNlGLClAAQb/HMNJ5n2OBNk2GT1tEmU0xuPr+SLQ==";
const MIRROR_ORIGIN = "https://tuf-repo-cdn.sigstore.dev";
const SIGNING_CONFIG_TARGET = "signing_config_rekor_v2.v0.2.json";
const TRUSTED_ROOT_TARGET = "trusted_root.json";
const SIGNING_CONFIG_MEDIA_TYPE
  = "application/vnd.dev.sigstore.signingconfig.v0.2+json";
const TRUSTED_ROOT_MEDIA_TYPE
  = "application/vnd.dev.sigstore.trustedroot+json;version=0.1";
const CREATE_ENTRY_PATH = "/api/v2/log/entries";
const MINIMUM_TIMEOUT_MS = 20_000;
const MAXIMUM_TIMEOUT_MS = 120_000;
const MAXIMUM_TARGET_BYTES = 1024 * 1024;
const MAXIMUM_SERVICES = 64;
const MAXIMUM_TLOGS = 128;
const ED25519_SPKI_PREFIX = "302a300506032b6570032100";
const OPERATOR = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?$/u;
const REQUIRE = createRequire(import.meta.url);
const PRIVATE = new WeakMap();

export const OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_SCHEMAS
  = Object.freeze({
    projection: "outsider/sigstore-tuf-rekor-v2-route-acquisition/v1",
    verificationReport:
      "outsider/rekor-v2-production-tuf-selection-verification/v1",
    privateMaterial: "outsider/sigstore-tuf-rekor-v2-route-private-material/v1",
    artifactManifest: "outsider/sigstore-tuf-rekor-v2-route-artifact-manifest/v1",
  });

export const OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_BOUNDARY
  = Object.freeze({
    position:
      "AUTHENTICATED_PUBLIC_GOOD_TUF_ROUTE_DISCOVERY_FOR_REKOR_V2_HOLD_ONLY",
    dependency: Object.freeze({
      name: TUF_PACKAGE_NAME,
      exactVersion: TUF_PACKAGE_VERSION,
      packageLockIntegrity: TUF_PACKAGE_INTEGRITY,
    }),
    mirrorOrigin: MIRROR_ORIGIN,
    exactTargetNames: Object.freeze([
      SIGNING_CONFIG_TARGET, TRUSTED_ROOT_TARGET,
    ]),
    supportedRekorMajorApiVersions: Object.freeze([2]),
    supportedRekorSelector: "ANY",
    createEntryPath: CREATE_ENTRY_PATH,
    minimumNetworkTimeoutMs: MINIMUM_TIMEOUT_MS,
    maximumNetworkTimeoutMs: MAXIMUM_TIMEOUT_MS,
    applicationRetryCount: 0,
    tufTransportRetryCount: 0,
    tufRefreshRequired: true,
    remoteMethodsPermitted: Object.freeze(["GET"]),
    rekorPostPermitted: false,
    rawTargetsProjected: false,
    rawTargetsPrivateArtifactMode: "0600",
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsSettlement: false,
  });

function fail(code, cause = undefined) {
  const error = new Error(`${PREFIX}${code}`);
  if (cause !== undefined) error.cause = cause;
  throw error;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields, code) {
  if (!plain(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    fail(`${code}_SHAPE_INVALID`);
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || descriptor.enumerable !== true || !("value" in descriptor)) {
      fail(`${code}_DESCRIPTOR_INVALID`);
    }
  }
  return value;
}

function freeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value) || ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) freeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function commitment(domain, value) {
  return sha256(Buffer.from(
    `outsider:sigstore-tuf-rekor-v2-route-acquisition:${domain}:v1\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function time(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(`${code}_INVALID`);
  }
  return new Date(value).toISOString();
}

function strictBase64(value, code, maximumBytes) {
  if (typeof value !== "string" || value.length < 1) fail(`${code}_INVALID`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > maximumBytes
    || bytes.toString("base64") !== value) fail(`${code}_INVALID`);
  return bytes;
}

function secureCacheDirectory(input) {
  if (typeof input !== "string" || !path.isAbsolute(input)) {
    fail("CACHE_DIRECTORY_ABSOLUTE_PATH_REQUIRED");
  }
  const resolved = path.resolve(input);
  if (resolved === path.parse(resolved).root) fail("CACHE_DIRECTORY_TOO_BROAD");
  let stat;
  try { stat = lstatSync(resolved, { bigint: true }); }
  catch (error) { fail("CACHE_DIRECTORY_UNAVAILABLE", error); }
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700
    || realpathSync(resolved) !== resolved
    || (typeof process.getuid === "function" && stat.uid !== BigInt(process.getuid()))) {
    fail("CACHE_DIRECTORY_UNSAFE");
  }
  return resolved;
}

function installedTufDependency() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(
      REQUIRE.resolve("@sigstore/tuf/package.json"), "utf8"));
  } catch (error) { fail("TUF_DEPENDENCY_MANIFEST_UNREADABLE", error); }
  if (!plain(parsed) || parsed.name !== TUF_PACKAGE_NAME
    || parsed.version !== TUF_PACKAGE_VERSION) {
    fail("TUF_DEPENDENCY_VERSION_MISMATCH");
  }
  return { name: parsed.name, version: parsed.version };
}

function parseTarget(value, targetPath, code) {
  if (typeof value !== "string") fail(`${code}_STRING_REQUIRED`);
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length < 2 || bytes.length > MAXIMUM_TARGET_BYTES) {
    fail(`${code}_BYTE_LENGTH_INVALID`);
  }
  let parsed;
  try { parsed = JSON.parse(value); }
  catch (error) { fail(`${code}_JSON_INVALID`, error); }
  if (!plain(parsed)) fail(`${code}_JSON_OBJECT_REQUIRED`);
  return {
    parsed,
    targetPath,
    bytes,
    expectedLength: bytes.length,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function origin(value, code) {
  let parsed;
  try { parsed = new URL(value); }
  catch (error) { fail(`${code}_URL_INVALID`, error); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.pathname !== "/"
    || parsed.search !== "" || parsed.hash !== ""
    || value !== parsed.origin) fail(`${code}_EXACT_HTTPS_ORIGIN_REQUIRED`);
  return { value, host: parsed.host };
}

function activeWindow(value, selectedAt, code) {
  if (!plain(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Object.keys(value);
  if (!keys.includes("start") || keys.some((key) => key !== "start" && key !== "end")) {
    fail(`${code}_SHAPE_INVALID`);
  }
  const start = time(value.start, `${code}_START`);
  const end = value.end === undefined || value.end === null
    ? null : time(value.end, `${code}_END`);
  if (end !== null && Date.parse(start) >= Date.parse(end)) {
    fail(`${code}_ORDER_INVALID`);
  }
  const at = Date.parse(selectedAt);
  return {
    start,
    end,
    active: at >= Date.parse(start) && (end === null || at < Date.parse(end)),
  };
}

function selectedSigningServiceContext(config, transportSelection, selectedAt) {
  if (config.mediaType !== SIGNING_CONFIG_MEDIA_TYPE
    || !Array.isArray(config.rekorTlogUrls)
    || config.rekorTlogUrls.length < 1
    || config.rekorTlogUrls.length > MAXIMUM_SERVICES
    || !plain(config.rekorTlogConfig)) {
    fail("SIGNING_CONFIG_PROFILE_INVALID");
  }
  if (Object.keys(config.rekorTlogConfig).length !== 1
    || config.rekorTlogConfig.selector !== "ANY") {
    fail("SIGNING_CONFIG_SELECTOR_UNSUPPORTED");
  }
  if (transportSelection.highestSupportedActiveApiVersionSelected !== true
    || transportSelection.selector !== "ANY"
    || transportSelection.selectedService?.majorApiVersion !== 2) {
    fail("TRANSPORT_SELECTION_PROFILE_INVALID");
  }
  const selected = transportSelection.selectedService;
  const matches = [];
  for (let index = 0; index < config.rekorTlogUrls.length; index += 1) {
    const item = config.rekorTlogUrls[index];
    if (!plain(item) || !Number.isSafeInteger(item.majorApiVersion)
      || item.majorApiVersion < 1 || typeof item.operator !== "string"
      || !OPERATOR.test(item.operator)) fail("SIGNING_CONFIG_SERVICE_INVALID");
    const route = origin(item.url, `SIGNING_CONFIG_SERVICE_${index}`);
    const window = activeWindow(item.validFor, selectedAt,
      `SIGNING_CONFIG_SERVICE_${index}_VALID_FOR`);
    if (window.active && item.majorApiVersion === 2
      && route.value === selected.origin && item.operator === selected.operator) {
      matches.push({
        index,
        origin: route.value,
        originHost: route.host,
        operator: item.operator,
        majorApiVersion: item.majorApiVersion,
        validFrom: window.start,
        validUntil: window.end,
      });
    }
  }
  if (matches.length !== 1) fail("TRANSPORT_SELECTION_SIGNING_CONFIG_CROSSWALK_INVALID");
  return matches[0];
}

function bindTrustedRoot(root, service, selectedAt) {
  if (root.mediaType !== TRUSTED_ROOT_MEDIA_TYPE || !Array.isArray(root.tlogs)
    || root.tlogs.length < 1 || root.tlogs.length > MAXIMUM_TLOGS) {
    fail("TRUSTED_ROOT_PROFILE_INVALID");
  }
  const matches = [];
  for (let index = 0; index < root.tlogs.length; index += 1) {
    const item = root.tlogs[index];
    if (!plain(item) || item.baseUrl !== service.origin) continue;
    if (item.hashAlgorithm !== "SHA2_256" || !plain(item.publicKey)
      || !plain(item.logId)
      || (item.operator !== undefined && item.operator !== service.operator)) {
      fail("TRUSTED_ROOT_MATCH_FIELDS_INVALID");
    }
    const window = activeWindow(item.publicKey.validFor, selectedAt,
      "TRUSTED_ROOT_LOG_KEY_VALID_FOR");
    if (!window.active) continue;
    if (item.publicKey.keyDetails !== "PKIX_ED25519") {
      fail("TRUSTED_ROOT_REKOR_V2_ED25519_REQUIRED");
    }
    const der = strictBase64(item.publicKey.rawBytes,
      "TRUSTED_ROOT_PUBLIC_KEY", 1024);
    if (der.length !== 44
      || der.subarray(0, 12).toString("hex") !== ED25519_SPKI_PREFIX) {
      fail("TRUSTED_ROOT_ED25519_SPKI_INVALID");
    }
    let key;
    try { key = createPublicKey({ key: der, format: "der", type: "spki" }); }
    catch (error) { fail("TRUSTED_ROOT_ED25519_KEY_INVALID", error); }
    if (key.asymmetricKeyType !== "ed25519") {
      fail("TRUSTED_ROOT_ED25519_KEY_TYPE_MISMATCH");
    }
    const logId = strictBase64(item.logId.keyId, "TRUSTED_ROOT_LOG_ID", 64);
    const checkpointDigest = createHash("sha256").update(Buffer.concat([
      Buffer.from(`${service.originHost}\n`, "utf8"),
      Buffer.from([1]),
      der.subarray(12),
    ])).digest();
    if (logId.length !== 32 || !logId.equals(checkpointDigest)) {
      fail("TRUSTED_ROOT_LOG_ID_C2SP_KEY_BINDING_INVALID");
    }
    if (item.checkpointKeyId !== undefined) {
      if (!plain(item.checkpointKeyId)) fail("TRUSTED_ROOT_CHECKPOINT_ID_INVALID");
      const checkpointId = strictBase64(item.checkpointKeyId.keyId,
        "TRUSTED_ROOT_CHECKPOINT_ID", 64);
      if (!checkpointId.equals(checkpointDigest)) {
        fail("TRUSTED_ROOT_CHECKPOINT_ID_C2SP_KEY_BINDING_INVALID");
      }
    }
    matches.push({
      publicKeyDer: der,
      publicKeyHash: sha256(der),
      logIdBase64: checkpointDigest.toString("base64"),
      c2spCheckpointKeyIdBase64: checkpointDigest.toString("base64"),
      c2spCheckpointSignatureHintHex: checkpointDigest.subarray(0, 4).toString("hex"),
      keyDetails: "PKIX_ED25519",
      validFrom: window.start,
      validUntil: window.end,
      trustedRootEntryIndex: index,
    });
  }
  if (matches.length !== 1) fail("TRUSTED_ROOT_ACTIVE_ROUTE_KEY_CARDINALITY_INVALID");
  return matches[0];
}

function privateTarget(target) {
  return {
    targetPath: target.targetPath,
    expectedLength: target.expectedLength,
    expectedSha256: target.expectedSha256,
    bytes: Buffer.from(target.bytes),
  };
}

function copyPrivate(state) {
  return {
    schema:
      OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_SCHEMAS.privateMaterial,
    acquisitionHash: state.projection.acquisitionHash,
    verifiedSelectionReport: state.verifiedSelectionReport,
    signingConfigTarget: privateTarget(state.signing),
    trustedRootTarget: privateTarget(state.trusted),
    transportSelection: state.transportSelection,
  };
}

/**
 * Refresh the production Sigstore public-good TUF repository and acquire the
 * exact current Rekor-v2-only SigningConfig plus TrustedRoot target.
 */
export async function acquireSigstoreTufRekorV2RouteV1(input = {}, dependencies = {}) {
  exact(input, ["cachePath", "timeoutMs"], "INPUT");
  if (!plain(dependencies)
    || Object.keys(dependencies).some((key) => key !== "initTUFImpl" && key !== "clock")) {
    fail("DEPENDENCIES_SHAPE_INVALID");
  }
  const cachePath = secureCacheDirectory(input.cachePath);
  if (!Number.isSafeInteger(input.timeoutMs)
    || input.timeoutMs < MINIMUM_TIMEOUT_MS
    || input.timeoutMs > MAXIMUM_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  const dependency = installedTufDependency();
  const initTUFImpl = dependencies.initTUFImpl ?? sigstoreInitTUF;
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  if (typeof initTUFImpl !== "function" || typeof clock !== "function") {
    fail("DEPENDENCIES_INVALID");
  }
  const acquisitionStartedAt = time(clock(), "ACQUISITION_STARTED_AT");
  let client;
  try {
    client = await initTUFImpl({
      mirrorURL: MIRROR_ORIGIN,
      cachePath,
      retry: { retries: 0 },
      timeout: input.timeoutMs,
      forceCache: false,
      forceInit: false,
    });
  } catch (error) { fail("TUF_REFRESH_FAILED_NO_RETRY", error); }
  if (client === null || typeof client !== "object"
    || typeof client.getTarget !== "function") fail("TUF_CLIENT_INVALID");
  let signingText;
  let trustedText;
  try { signingText = await client.getTarget(SIGNING_CONFIG_TARGET); }
  catch (error) { fail("SIGNING_CONFIG_TARGET_ACQUISITION_FAILED_NO_RETRY", error); }
  try { trustedText = await client.getTarget(TRUSTED_ROOT_TARGET); }
  catch (error) { fail("TRUSTED_ROOT_TARGET_ACQUISITION_FAILED_NO_RETRY", error); }
  const selectedAt = time(clock(), "SELECTED_AT");
  if (Date.parse(selectedAt) < Date.parse(acquisitionStartedAt)) {
    fail("LOCAL_CLOCK_MOVED_BACKWARDS");
  }
  const signing = parseTarget(signingText, SIGNING_CONFIG_TARGET, "SIGNING_CONFIG");
  const trusted = parseTarget(trustedText, TRUSTED_ROOT_TARGET, "TRUSTED_ROOT");
  const transportSelection = createRekorV2PinnedTufServiceSelectionV2({
    signingConfigTarget: privateTarget(signing),
    trustedRootTarget: privateTarget(trusted),
    selectedAt,
  });
  const service = selectedSigningServiceContext(
    signing.parsed, transportSelection, selectedAt);
  const trust = bindTrustedRoot(trusted.parsed, service, selectedAt);
  if (transportSelection.selectedService.origin !== service.origin
    || transportSelection.selectedService.operator !== service.operator
    || transportSelection.logTrust.logIdKeyIdBase64 !== trust.logIdBase64
    || transportSelection.logTrust.checkpointKeyIdBase64
      !== trust.c2spCheckpointKeyIdBase64) {
    fail("TRANSPORT_SELECTION_CROSSWALK_INVALID");
  }
  const roleChainVerificationBody = {
    repository: "SIGSTORE_PUBLIC_GOOD_TUF",
    mirrorOrigin: MIRROR_ORIGIN,
    dependencyName: dependency.name,
    dependencyExactVersion: dependency.version,
    dependencyPackageLockIntegrity: TUF_PACKAGE_INTEGRITY,
    authenticatedRefreshCompleted: true,
    tufTransportRetriesConfigured: 0,
    signingConfigTargetPath: signing.targetPath,
    signingConfigTargetHash: `sha256:${signing.expectedSha256}`,
    signingConfigTargetLength: signing.expectedLength,
    trustedRootTargetPath: trusted.targetPath,
    trustedRootTargetHash: `sha256:${trusted.expectedSha256}`,
    trustedRootTargetLength: trusted.expectedLength,
    selectionHash: transportSelection.selectionHash,
  };
  const tufRoleChainVerificationHash = commitment(
    "tuf-role-chain-verification", roleChainVerificationBody);
  const verifiedSelectionReport = freeze({
    schema:
      OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_SCHEMAS.verificationReport,
    ok: true,
    tufRoleChainCryptographicallyVerified: true,
    signingConfigTargetBytesVerified: true,
    trustedRootTargetBytesVerified: true,
    selectionHash: transportSelection.selectionHash,
    signingConfigTargetPath: signing.targetPath,
    signingConfigTargetHash: `sha256:${signing.expectedSha256}`,
    signingConfigTargetLength: signing.expectedLength,
    trustedRootTargetPath: trusted.targetPath,
    trustedRootTargetHash: `sha256:${trusted.expectedSha256}`,
    trustedRootTargetLength: trusted.expectedLength,
    tufRoleChainVerificationHash,
    rawTufRoleMetadataProjected: false,
    rawTargetBytesProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
  const body = {
    schema:
      OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_SCHEMAS.projection,
    acquisitionStartedAt,
    selectedAt,
    source: {
      repository: "SIGSTORE_PUBLIC_GOOD_TUF",
      mirrorOrigin: MIRROR_ORIGIN,
      dependency: {
        name: dependency.name,
        exactVersion: dependency.version,
        packageLockIntegrity: TUF_PACKAGE_INTEGRITY,
      },
      tufClientInitializationIncludesAuthenticatedRefresh: true,
      tufRootBootstrapProvidedByExactDependency: true,
      tufTransportRetriesConfigured: 0,
      applicationRetriesPerformed: 0,
      timeoutMs: input.timeoutMs,
      exactTargetGetCalls: 2,
      exactTargetNames: [SIGNING_CONFIG_TARGET, TRUSTED_ROOT_TARGET],
      tufMetadataVersionsNotExposedByDependency: true,
    },
    targets: {
      signingConfig: {
        targetPath: signing.targetPath,
        bytes: signing.expectedLength,
        sha256: `sha256:${signing.expectedSha256}`,
        mediaType: SIGNING_CONFIG_MEDIA_TYPE,
      },
      trustedRoot: {
        targetPath: trusted.targetPath,
        bytes: trusted.expectedLength,
        sha256: `sha256:${trusted.expectedSha256}`,
        mediaType: TRUSTED_ROOT_MEDIA_TYPE,
      },
      exactBytesHeldPrivate: true,
      rawTargetBytesProjected: false,
    },
    route: {
      origin: service.origin,
      createEntryPath: CREATE_ENTRY_PATH,
      createEntryUrl: `${service.origin}${CREATE_ENTRY_PATH}`,
      operator: service.operator,
      majorApiVersion: 2,
      validFrom: service.validFrom,
      validUntil: service.validUntil,
      signingConfigListIndex: service.index,
      selector: "ANY",
      firstActiveHighestSupportedServiceSelected: true,
      supportedMajorApiVersions: [2],
    },
    trust: {
      trustedRootEntryIndex: trust.trustedRootEntryIndex,
      keyDetails: trust.keyDetails,
      publicKeyDerHash: trust.publicKeyHash,
      logIdKeyIdBase64: trust.logIdBase64,
      c2spCheckpointKeyIdBase64: trust.c2spCheckpointKeyIdBase64,
      c2spCheckpointSignatureHintHex: trust.c2spCheckpointSignatureHintHex,
      validFrom: trust.validFrom,
      validUntil: trust.validUntil,
      selectedOriginAndActiveEd25519KeyCrossBound: true,
      logIdMatchesFullC2spCheckpointKeyId: true,
      rawPublicKeyProjected: false,
    },
    transportSelectionHash: transportSelection.selectionHash,
    tufRoleChainVerificationHash,
    externalNetworkReadOnly: true,
    remoteMethodsPermitted: ["GET"],
    rekorPostPerformed: false,
    paymentPerformed: false,
    providerAcknowledgementEstablished: false,
    externalLogInclusionEstablished: false,
    trustedTimeEstablished: false,
    independentWitnessEstablished: false,
    authority: "NONE",
    capacityReserved: false,
    outcomeTruthEstablished: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsSettlement: false,
  };
  const projection = freeze({ ...body, acquisitionHash: commitment("projection", body) });
  const handle = freeze({ projection, verifiedSelectionReport });
  PRIVATE.set(handle, { projection, verifiedSelectionReport,
    signing, trusted, transportSelection });
  return handle;
}

export function getSigstoreTufRekorV2RoutePrivateMaterialV1(handle) {
  const state = PRIVATE.get(handle);
  if (!state) fail("ACQUISITION_HANDLE_INVALID");
  return copyPrivate(state);
}

function safePublicationPaths(options) {
  exact(options, ["trustedRoot", "outputDirectory"], "PUBLICATION_OPTIONS");
  if (typeof options.trustedRoot !== "string"
    || typeof options.outputDirectory !== "string") fail("PUBLICATION_PATH_INVALID");
  const trustedRoot = path.resolve(options.trustedRoot);
  const outputDirectory = path.resolve(options.outputDirectory);
  if (trustedRoot === path.parse(trustedRoot).root
    || outputDirectory === trustedRoot
    || path.dirname(outputDirectory) !== trustedRoot) {
    fail("OUTPUT_MUST_BE_NEW_DIRECT_CHILD_OF_TRUSTED_ROOT");
  }
  let rootStat;
  try { rootStat = lstatSync(trustedRoot, { bigint: true }); }
  catch (error) { fail("PUBLICATION_TRUSTED_ROOT_UNAVAILABLE", error); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
    || realpathSync(trustedRoot) !== trustedRoot
    || (typeof process.getuid === "function"
      && rootStat.uid !== BigInt(process.getuid()))) fail("PUBLICATION_TRUSTED_ROOT_UNSAFE");
  try { lstatSync(outputDirectory); fail("OUTPUT_DIRECTORY_ALREADY_EXISTS"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return { trustedRoot, outputDirectory };
}

/** Publish exact authenticated targets and the route selection as 0600 files. */
export function publishSigstoreTufRekorV2RouteArtifactsV1(handle, options) {
  const state = PRIVATE.get(handle);
  if (!state) fail("ACQUISITION_HANDLE_INVALID");
  const paths = safePublicationPaths(options);
  const material = copyPrivate(state);
  for (const target of [material.signingConfigTarget, material.trustedRootTarget]) {
    if (target.bytes.length !== target.expectedLength
      || createHash("sha256").update(target.bytes).digest("hex")
        !== target.expectedSha256) fail("PRIVATE_TARGET_COMMITMENT_MISMATCH");
  }
  const payloads = new Map([
    [SIGNING_CONFIG_TARGET, material.signingConfigTarget.bytes],
    [TRUSTED_ROOT_TARGET, material.trustedRootTarget.bytes],
    ["rekor-v2-route-selection.json", Buffer.from(
      `${canonicalizeStrict(material.transportSelection)}\n`, "utf8")],
    ["verified-tuf-selection-report.json", Buffer.from(
      `${canonicalizeStrict(material.verifiedSelectionReport)}\n`, "utf8")],
    ["privacy-safe-route-projection.json", Buffer.from(
      `${canonicalizeStrict(state.projection)}\n`, "utf8")],
  ]);
  const fileCommitments = [...payloads].map(([name, bytes]) => ({
    name, bytes: bytes.length, sha256: sha256(bytes), mode: "0600",
  }));
  const manifestBody = {
    schema:
      OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_SCHEMAS.artifactManifest,
    acquisitionHash: state.projection.acquisitionHash,
    files: fileCommitments,
    manifestPublishedLast: true,
    rawTargetsNetworkProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const manifest = freeze({ ...manifestBody,
    manifestHash: commitment("artifact-manifest", manifestBody) });
  for (const [name, bytes] of payloads) {
    publishPrivateArtifact(path.join(paths.outputDirectory, name), bytes, {
      trustedRoot: paths.trustedRoot,
      allowExistingIdentical: false,
    });
  }
  const manifestBytes = Buffer.from(`${canonicalizeStrict(manifest)}\n`, "utf8");
  publishPrivateArtifact(path.join(paths.outputDirectory, "manifest.json"),
    manifestBytes, { trustedRoot: paths.trustedRoot, allowExistingIdentical: false });
  return freeze({
    outputDirectory: paths.outputDirectory,
    manifest,
    manifestFile: {
      name: "manifest.json",
      bytes: manifestBytes.length,
      sha256: sha256(manifestBytes),
      mode: "0600",
    },
  });
}
