#!/usr/bin/env node

/*
 * Compile one append-only user-held SparkFun activation bundle.
 *
 * This script performs local filesystem work only.  It reissues an expired
 * private input as a fresh descendant, adds one Attempt to the existing
 * Episode, and writes the exact 0600 inputs consumed by the outbound-only
 * executor CLI.  It never copies the existing Formation dispatch bearer.
 */

import {
  createHash, createHmac, randomBytes, randomUUID,
} from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync,
  readFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { issueFormationTransportValidationAttemptV1 }
  from "../src/outsider-formation-transport-validation-attempt-v1.js";

const PREFIX = "OUTSIDER_USER_HELD_SPARKFUN_ACTIVATION_V1_";
const ACTIVATION_SCHEMA
  = "outsider/private-user-held-sparkfun-formation-activation/v1";
const INPUT_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-request/v1";
const LINEAGE_SCHEMA
  = "outsider/private-sparkfun-input-reissue-lineage/v1";
const RUNTIME_REFERENCES_SCHEMA
  = "outsider/private-user-held-sparkfun-executor-runtime-references/v1";
const CONFIG_SCHEMA
  = "outsider/private-user-held-sparkfun-formation-executor-config/v1";
const TARGET_API_VERSION = "2.5.0";
const CENTRAL_ORIGIN
  = "https://outsider-formation-job-worker.outsider-guard.workers.dev";
const DEFAULT_TTL_MINUTES = 240;
const MAX_PRIVATE_BYTES = 256 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ERROR = /^[A-Z][A-Z0-9_]{1,159}$/u;

export const OUTSIDER_USER_HELD_SPARKFUN_ACTIVATION_V1_BOUNDARY
  = Object.freeze({
    localCompilationOnly: true,
    liveNetworkCalls: 0,
    deploymentOperations: 0,
    sourceArtifactOverwritten: false,
    appendOnlyAttemptRequired: true,
    sameEpisodeRequired: true,
    executionSurface: "USER_HELD_OUTBOUND_MACHINE_HTTPS",
    dispatchBearerCopied: false,
    privateArtifactsMode: "0600",
    activationDirectoryMode: "0700",
    rawPrivateInputProjected: false,
    rawPrivateHashesProjected: false,
    secretMaterialProjected: false,
    paymentAuthorized: false,
    orderAuthorized: false,
    paymentPerformed: false,
    orderSubmitted: false,
    authorityMinted: false,
    capacityEstablished: false,
    outcomeCommitted: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function keyedBytesHash(key, domain, parts) {
  const state = createHmac("sha256", key).update(domain, "utf8");
  for (const part of parts) state.update("\0", "utf8").update(part);
  return `sha256:${state.digest("hex")}`;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function readPrivateBytes(file, maximum, code) {
  if (typeof file !== "string" || file.length < 1 || file.length > 4096) {
    fail(`${code}_PATH_INVALID`);
  }
  const absolute = path.resolve(file);
  let descriptor;
  let value;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(descriptor);
    if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.size < 1
      || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
    value = readFileSync(descriptor);
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail(`${code}_UNREADABLE`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return Object.freeze({ absolute, bytes: Buffer.from(value) });
}

function readPrivateJson(file, code) {
  const record = readPrivateBytes(file, MAX_PRIVATE_BYTES, code);
  let value;
  try { value = JSON.parse(record.bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== record.bytes.toString("utf8")) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return Object.freeze({ ...record, value });
}

function validateDispatchBearer(file) {
  const record = readPrivateBytes(file, 4096, "DISPATCH_TOKEN");
  let value;
  try { value = new TextDecoder("utf8", { fatal: true }).decode(record.bytes); }
  catch { fail("DISPATCH_TOKEN_UTF8_INVALID"); }
  if (value.endsWith("\n")) value = value.slice(0, -1);
  if (Buffer.byteLength(value, "utf8") < 32
    || Buffer.byteLength(value, "utf8") > 512
    || /[\u0000-\u0020\u007f]/u.test(value)) fail("DISPATCH_TOKEN_INVALID");
  return record;
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  let descriptor;
  try {
    descriptor = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(descriptor);
    if (!info.isDirectory() || (info.mode & 0o777) !== 0o700) {
      fail("PRIVATE_DIRECTORY_INVALID");
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writePrivate(file, bytes) {
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  return Object.freeze({ name: path.basename(file), bytes: bytes.length,
    bytesHash: bytesHash(bytes), mode: "0600" });
}

function writeCanonicalPrivate(directory, name, value) {
  return writePrivate(path.join(directory, name),
    Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function secureRandom(dependencies, size, code) {
  const value = dependencies.randomBytesImpl(size);
  if (!Buffer.isBuffer(value) || value.length !== size) fail(`${code}_INVALID`);
  return Buffer.from(value);
}

function validateSourceInput(value) {
  exact(value, ["schema", "schemaVersion", "product", "destination",
    "budget", "completionDeadline", "formationExpiresAt",
    "paymentAuthorized", "orderAuthorized"], "SOURCE_INPUT");
  if (value.schema !== INPUT_SCHEMA || value.schemaVersion !== "1.0.0"
    || value.paymentAuthorized !== false || value.orderAuthorized !== false) {
    fail("SOURCE_INPUT_BOUNDARY_INVALID");
  }
  instant(value.completionDeadline, "COMPLETION_DEADLINE");
  instant(value.formationExpiresAt, "SOURCE_FORMATION_EXPIRES_AT");
  return value;
}

function safeErrorCode(error) {
  const code = error?.outsiderCode;
  return typeof code === "string" && SAFE_ERROR.test(code)
    ? code : "UNCLASSIFIED_FAILURE";
}

export function createUserHeldSparkFunActivationV1(input = {},
  dependencies = {}) {
  exact(input, ["sourceInputFile", "predecessorCompositionFile",
    "unifiedResultFile", "formationDispatchTokenFile", "outputRoot",
    "centralOrigin", "targetApiVersion", "ttlMinutes"], "INPUT");
  exact(dependencies, ["clock", "randomBytesImpl", "randomUuidImpl"],
    "DEPENDENCIES");
  if (typeof dependencies.clock !== "function"
    || typeof dependencies.randomBytesImpl !== "function"
    || typeof dependencies.randomUuidImpl !== "function") {
    fail("DEPENDENCIES_INVALID");
  }
  if (input.centralOrigin !== CENTRAL_ORIGIN
    || input.targetApiVersion !== TARGET_API_VERSION
    || !Number.isSafeInteger(input.ttlMinutes) || input.ttlMinutes < 15
    || input.ttlMinutes > 720) fail("TARGET_OR_TTL_INVALID");
  const issuedAt = instant(dependencies.clock(), "CLOCK");
  const expiresAt = new Date(Date.parse(issuedAt)
    + input.ttlMinutes * 60 * 1000).toISOString();
  const source = readPrivateJson(input.sourceInputFile, "SOURCE_INPUT_FILE");
  validateSourceInput(source.value);
  if (Date.parse(expiresAt) >= Date.parse(source.value.completionDeadline)) {
    fail("ACTIVATION_EXCEEDS_COMPLETION_DEADLINE");
  }
  const predecessor = readPrivateJson(input.predecessorCompositionFile,
    "PREDECESSOR_COMPOSITION_FILE");
  const unified = readPrivateJson(input.unifiedResultFile,
    "UNIFIED_RESULT_FILE");
  if (!HASH.test(String(unified.value?.programHash ?? ""))) {
    fail("OUTCOME_PROGRAM_HASH_INVALID");
  }
  const dispatch = validateDispatchBearer(input.formationDispatchTokenFile);
  const activationId = dependencies.randomUuidImpl();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
    .test(activationId)) fail("ACTIVATION_ID_INVALID");
  const orderRandom = secureRandom(dependencies, 16, "ORDER_RANDOM");
  const orderId = `order:sparkfun-user-held-${issuedAt.slice(0, 10)
    .replaceAll("-", "")}-${orderRandom.toString("hex")}`;
  orderRandom.fill(0);
  const attempt = issueFormationTransportValidationAttemptV1({
    predecessorComposition: predecessor.value,
    orderId,
    outcomeProgramHash: unified.value.programHash,
    adapterId: "sparkfun-magento-user-held-no-payment",
    adapterVersion: "1.0.0",
    provider: "SPARKFUN_MAGENTO_GUEST_CART",
    executionSurface: "USER_HELD_OUTBOUND_MACHINE_HTTPS",
    issuedAt,
  });
  const outputRoot = path.resolve(input.outputRoot);
  ensurePrivateDirectory(outputRoot);
  const outputDirectory = path.join(outputRoot, `activation-${activationId}`);
  mkdirSync(outputDirectory, { mode: 0o700 });
  chmodSync(outputDirectory, 0o700);
  const runtimeDirectory = path.join(outputDirectory, "runtime");
  mkdirSync(runtimeDirectory, { mode: 0o700 });
  chmodSync(runtimeDirectory, 0o700);

  const descendantInput = Object.freeze({ ...source.value,
    formationExpiresAt: expiresAt,
    paymentAuthorized: false,
    orderAuthorized: false });
  const descendantInputBytes = Buffer.from(
    `${canonicalizeStrict(descendantInput)}\n`, "utf8");
  const descendantInputName = "sparkfun-private-input-descendant-v1.json";
  const artifacts = [];
  artifacts.push(writePrivate(path.join(outputDirectory, descendantInputName),
    descendantInputBytes));
  const sourcePathHash = bytesHash(Buffer.from(source.absolute, "utf8"));
  const lineageBody = {
    schema: LINEAGE_SCHEMA,
    schemaVersion: "1.0.0",
    relation: "REISSUE_SUPERSEDES_EXPIRED_PRIVATE_INPUT",
    issuedAt,
    predecessor: {
      privatePathReferenceHash: sourcePathHash,
      privateBytesHash: bytesHash(source.bytes),
      formationExpiresAt: source.value.formationExpiresAt,
    },
    descendant: {
      relativePath: descendantInputName,
      privateBytesHash: bytesHash(descendantInputBytes),
      formationExpiresAt: expiresAt,
    },
    changedFields: ["formationExpiresAt"],
    sourceArtifactOverwritten: false,
    privateLineageProjected: false,
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const lineage = Object.freeze({ ...lineageBody,
    lineageHash: digest(LINEAGE_SCHEMA, lineageBody) });
  artifacts.push(writeCanonicalPrivate(outputDirectory,
    "sparkfun-private-input-lineage-v1.json", lineage));

  const capabilityEntropy = secureRandom(dependencies, 48,
    "CAPABILITY_ENTROPY");
  const executorBearerToken = capabilityEntropy.toString("base64url");
  capabilityEntropy.fill(0);
  const commitmentKey = secureRandom(dependencies, 32, "COMMITMENT_KEY");
  const commitmentKeyBase64Url = commitmentKey.toString("base64url");
  artifacts.push(writePrivate(path.join(outputDirectory,
    "central-origin.secret"), Buffer.from(`${CENTRAL_ORIGIN}\n`, "utf8")));
  artifacts.push(writePrivate(path.join(outputDirectory,
    "executor-bearer-token.secret"),
  Buffer.from(`${executorBearerToken}\n`, "utf8")));
  artifacts.push(writePrivate(path.join(outputDirectory,
    "commitment-key.secret"),
  Buffer.from(`${commitmentKeyBase64Url}\n`, "utf8")));

  const config = Object.freeze({
    schema: CONFIG_SCHEMA,
    schemaVersion: "1.0.0",
    centralApiVersion: TARGET_API_VERSION,
    enrollmentMode: "PUBLISH_THEN_CLAIM",
    orderId,
    outcomeProgramHash: unified.value.programHash,
    graphRefs: attempt.graphRefs,
    inputFile: descendantInputName,
    privateRoot: "runtime",
    issuedAt,
    expiresAt,
    paymentAuthorized: false,
    orderAuthorized: false,
  });
  artifacts.push(writeCanonicalPrivate(outputDirectory,
    "executor-config.json", config));
  artifacts.push(writeCanonicalPrivate(outputDirectory,
    "formation-attempt.json", attempt.attemptRecord));
  artifacts.push(writeCanonicalPrivate(outputDirectory,
    "episode-attempt-set-composition.json",
    attempt.episodeAttemptSetComposition));

  const runtimeReferences = Object.freeze({
    schema: RUNTIME_REFERENCES_SCHEMA,
    schemaVersion: "1.0.0",
    targetApiVersion: TARGET_API_VERSION,
    configFile: "executor-config.json",
    centralOriginFile: "central-origin.secret",
    publicationBearerTokenFile: dispatch.absolute,
    executorBearerTokenFile: "executor-bearer-token.secret",
    commitmentKeyBase64UrlFile: "commitment-key.secret",
    paymentAuthorized: false,
    orderAuthorized: false,
  });
  artifacts.push(writeCanonicalPrivate(outputDirectory,
    "executor-runtime-references.json", runtimeReferences));
  const dispatchTokenReferenceCommitment = keyedBytesHash(commitmentKey,
    "outsider/private-formation-dispatch-token-file-reference/v1", [
      Buffer.from(dispatch.absolute, "utf8"), dispatch.bytes,
    ]);
  commitmentKey.fill(0);

  const manifest = Object.freeze({
    schema: ACTIVATION_SCHEMA,
    schemaVersion: "1.0.0",
    activationId,
    issuedAt,
    expiresAt,
    target: {
      centralOrigin: CENTRAL_ORIGIN,
      apiVersion: TARGET_API_VERSION,
      executionSurface: "USER_HELD_OUTBOUND_MACHINE_HTTPS",
    },
    orderId,
    outcomeProgramHash: unified.value.programHash,
    attemptRecordHash: attempt.attemptRecord.attemptHash,
    predecessorCompositionHash: predecessor.value.compositionHash,
    descendantCompositionHash:
      attempt.episodeAttemptSetComposition.compositionHash,
    attemptOrdinal: attempt.attemptRecord.attemptOrdinal,
    sameEpisode: attempt.attemptRecord.episodeHash
      === predecessor.value.episodeBinding.episodeHash,
    descendantCompositionVerified: attempt.verification.ok,
    privateInputLineageHash: lineage.lineageHash,
    sourceArtifactOverwritten: false,
    dispatchTokenReferenceCommitment,
    dispatchTokenReferencedFromExistingPrivateFile: true,
    dispatchTokenCopied: false,
    dispatchTokenExternalBindingVerifiedByCompiler: false,
    artifactInventory: artifacts,
    artifactCountBeforeManifest: artifacts.length,
    allArtifactsPrivate0600: artifacts.every((row) => row.mode === "0600"),
    activationDirectoryMode: "0700",
    runtimeDirectoryMode: "0700",
    rawPrivateInputProjected: false,
    rawPrivateHashesProjected: false,
    secretMaterialProjected: false,
    paymentAuthorized: false,
    orderAuthorized: false,
    paymentPerformed: false,
    orderSubmitted: false,
    authorityMinted: false,
    capacityEstablished: false,
    outcomeCommitted: false,
  });
  const manifestArtifact = writeCanonicalPrivate(outputDirectory,
    "activation-private-manifest.json", manifest);
  return Object.freeze({
    outputDirectory,
    runtimeReferencesFile: path.join(outputDirectory,
      "executor-runtime-references.json"),
    safeProjection: Object.freeze({
      ok: true,
      schema: "outsider/user-held-sparkfun-activation-result/v1",
      activationId,
      targetApiVersion: TARGET_API_VERSION,
      attemptOrdinal: attempt.attemptRecord.attemptOrdinal,
      sameEpisode: manifest.sameEpisode,
      newAttemptHash: attempt.attemptRecord.attemptHash
        !== predecessor.value.attempts.at(-1).attemptHash,
      descendantCompositionVerified: manifest.descendantCompositionVerified,
      sourceArtifactOverwritten: false,
      dispatchTokenReferenced: true,
      dispatchTokenCopied: false,
      artifactCount: artifacts.length + 1,
      allArtifactsPrivate0600: manifest.allArtifactsPrivate0600
        && manifestArtifact.mode === "0600",
      boundary: OUTSIDER_USER_HELD_SPARKFUN_ACTIVATION_V1_BOUNDARY,
    }),
  });
}

function parseArgs(argv) {
  if (!Array.isArray(argv)) fail("ARGV_INVALID");
  const values = new Map();
  const allowed = new Set(["--source-input", "--predecessor-composition",
    "--unified-result", "--dispatch-token-file", "--output-root",
    "--ttl-minutes"]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || values.has(flag) || typeof value !== "string") {
      fail("ARGV_INVALID");
    }
    values.set(flag, value);
  }
  for (const flag of ["--source-input", "--predecessor-composition",
    "--unified-result", "--dispatch-token-file"]) {
    if (!values.has(flag)) fail("ARGV_REQUIRED");
  }
  const ttlSource = values.get("--ttl-minutes")
    ?? String(DEFAULT_TTL_MINUTES);
  if (!/^\d{2,3}$/u.test(ttlSource)) fail("TTL_INVALID");
  return Object.freeze({
    sourceInputFile: values.get("--source-input"),
    predecessorCompositionFile: values.get("--predecessor-composition"),
    unifiedResultFile: values.get("--unified-result"),
    formationDispatchTokenFile: values.get("--dispatch-token-file"),
    outputRoot: values.get("--output-root")
      ?? path.join(process.cwd(), ".outsider", "private",
        "user-held-sparkfun-activation-v1"),
    centralOrigin: CENTRAL_ORIGIN,
    targetApiVersion: TARGET_API_VERSION,
    ttlMinutes: Number(ttlSource),
  });
}

export async function runUserHeldSparkFunActivationCliV1(input = {},
  dependencies = {}, io = {}) {
  exact(input, ["argv"], "CLI_INPUT");
  exact(dependencies, ["clock", "randomBytesImpl", "randomUuidImpl"],
    "DEPENDENCIES");
  exact(io, ["stdout", "stderr"], "IO");
  try {
    const result = createUserHeldSparkFunActivationV1(parseArgs(input.argv),
      dependencies);
    io.stdout(`${canonicalizeStrict(result.safeProjection)}\n`);
    return 0;
  } catch (error) {
    io.stderr(`${canonicalizeStrict({ ok: false,
      schema: "outsider/user-held-sparkfun-activation-failure/v1",
      errorCode: safeErrorCode(error) })}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const exitCode = await runUserHeldSparkFunActivationCliV1({
    argv: process.argv.slice(2),
  }, {
    clock: () => new Date().toISOString(),
    randomBytesImpl: randomBytes,
    randomUuidImpl: randomUUID,
  }, {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  });
  process.exitCode = exitCode;
}
