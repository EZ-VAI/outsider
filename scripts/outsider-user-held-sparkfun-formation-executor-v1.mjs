#!/usr/bin/env node

/*
 * User-held SparkFun Formation executor bootstrap v1.
 *
 * One process performs one outbound-only machine path:
 * hash-only enrollment -> atomic claim -> local private execution ->
 * hash-only receipt.  Private address/contact bytes and unkeyed private
 * hashes never leave this process.  The underlying composition forbids both
 * payment and order endpoints.
 */

import {
  closeSync, constants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { createSparkFunMagentoFormationNodeCompositionV1 }
  from "../src/outsider-sparkfun-magento-formation-node-composition-v1.js";
import {
  reconcileUserHeldFormationExecutorOnceV1,
  runUserHeldFormationExecutorOnceV1,
}
  from "../src/outsider-user-held-formation-executor-client-v1.js";
import {
  createUserHeldFormationPrivateBindingV1,
  deriveUserHeldFormationExecutorCapabilityHashV1,
}
  from "../src/outsider-user-held-formation-executor-protocol-v1.js";

const PREFIX = "OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_";
const CONFIG_SCHEMA
  = "outsider/private-user-held-sparkfun-formation-executor-config/v1";
const RESULT_SCHEMA
  = "outsider/user-held-sparkfun-formation-executor-run-result/v1";
const FAILURE_SCHEMA
  = "outsider/user-held-sparkfun-formation-executor-run-failure/v1";
const PUBLISH_REQUEST_SCHEMA
  = "outsider/user-held-formation-execution-publish-request/v1";
const PUBLISH_RESPONSE_SCHEMA
  = "outsider/user-held-formation-execution-publish-response/v1";
const SAFE_ERROR = /^[A-Z][A-Z0-9_]{1,159}$/u;
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_SECRET_BYTES = 4096;
const MAX_RESPONSE_BYTES = 64 * 1024;

export const OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_ENV = Object.freeze({
  configFile: "OUTSIDER_USER_HELD_EXECUTOR_CONFIG_FILE",
  centralOrigin: "OUTSIDER_USER_HELD_CENTRAL_ORIGIN",
  centralOriginFile: "OUTSIDER_USER_HELD_CENTRAL_ORIGIN_FILE",
  publicationBearerToken: "OUTSIDER_USER_HELD_PUBLICATION_BEARER_TOKEN",
  publicationBearerTokenFile:
    "OUTSIDER_USER_HELD_PUBLICATION_BEARER_TOKEN_FILE",
  executorBearerToken: "OUTSIDER_USER_HELD_EXECUTOR_BEARER_TOKEN",
  executorBearerTokenFile:
    "OUTSIDER_USER_HELD_EXECUTOR_BEARER_TOKEN_FILE",
  commitmentKeyBase64Url: "OUTSIDER_USER_HELD_COMMITMENT_KEY_BASE64URL",
  commitmentKeyBase64UrlFile:
    "OUTSIDER_USER_HELD_COMMITMENT_KEY_BASE64URL_FILE",
});

export const OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_BOUNDARY
  = Object.freeze({
    supportedExecutionModes: Object.freeze(["ONE_SHOT", "RECONCILE_ONLY"]),
    networkDirection: "OUTBOUND_ONLY",
    transport: "MACHINE_HTTPS",
    inboundPortOpened: false,
    browserOrMouseUsed: false,
    rawPrivateInputProjected: false,
    unkeyedPrivateHashProjected: false,
    secretMaterialProjected: false,
    paymentEndpointAllowed: false,
    orderEndpointAllowed: false,
    paymentPerformed: false,
    orderSubmitted: false,
    reconcileProviderOriginIoAllowed: false,
    authorityMinted: false,
    capacityEstablished: false,
    independentOutcomeTruthEstablished: false,
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

function privateBytes(file, maximum, code) {
  if (typeof file !== "string" || file.length < 1 || file.length > 4096) {
    fail(`${code}_PATH_INVALID`);
  }
  const absolute = path.resolve(file);
  let descriptor;
  let info;
  let value;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    info = fstatSync(descriptor);
    if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.size < 1
      || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
    value = readFileSync(descriptor);
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail(`${code}_UNREADABLE`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (value.length < 1 || value.length > maximum) fail(`${code}_SIZE_INVALID`);
  return Object.freeze({ absolute, bytes: Buffer.from(value) });
}

function privateText(file, code) {
  const record = privateBytes(file, MAX_SECRET_BYTES, code);
  let value;
  try {
    value = new TextDecoder("utf8", { fatal: true }).decode(record.bytes);
  } catch { fail(`${code}_UTF8_INVALID`); }
  if (value.endsWith("\n")) value = value.slice(0, -1);
  if (value.length < 1 || value !== value.trim()
    || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${code}_TEXT_INVALID`);
  return value;
}

function secureEnvironmentValue(environment, directName, fileName, code) {
  const directPresent = environment[directName] !== undefined;
  const filePresent = environment[fileName] !== undefined;
  if (directPresent === filePresent) fail(`${code}_SOURCE_INVALID`);
  if (directPresent) {
    const value = environment[directName];
    if (typeof value !== "string" || value.length < 1
      || Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES
      || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
      fail(`${code}_ENV_INVALID`);
    }
    return value;
  }
  if (typeof environment[fileName] !== "string") {
    fail(`${code}_FILE_ENV_INVALID`);
  }
  return privateText(environment[fileName], code);
}

function centralOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) {
    fail("CENTRAL_ORIGIN_INVALID");
  }
  let parsed;
  try { parsed = new URL(value); }
  catch { fail("CENTRAL_ORIGIN_INVALID"); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.pathname !== "/"
    || parsed.search !== "" || parsed.hash !== "") {
    fail("CENTRAL_ORIGIN_INVALID");
  }
  return parsed.origin;
}

function bearerToken(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32
    || Buffer.byteLength(value, "utf8") > 512
    || /[\u0000-\u0020\u007f]/u.test(value)) fail("BEARER_TOKEN_INVALID");
  return value;
}

function commitmentKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43,86}$/u.test(value)) {
    fail("COMMITMENT_KEY_INVALID");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length < 32 || decoded.length > 64
    || decoded.toString("base64url") !== value) fail("COMMITMENT_KEY_INVALID");
  return decoded;
}

function readConfig(file) {
  const record = privateBytes(file, MAX_CONFIG_BYTES, "CONFIG_FILE");
  let value;
  try { value = JSON.parse(record.bytes.toString("utf8")); }
  catch { fail("CONFIG_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== record.bytes.toString("utf8")) {
    fail("CONFIG_NOT_CANONICAL");
  }
  exact(value, ["schema", "schemaVersion", "centralApiVersion",
    "enrollmentMode", "orderId", "outcomeProgramHash", "graphRefs",
    "inputFile", "privateRoot", "issuedAt", "expiresAt",
    "paymentAuthorized", "orderAuthorized"],
  "CONFIG");
  if (value.schema !== CONFIG_SCHEMA || value.schemaVersion !== "1.0.0"
    || value.centralApiVersion !== "2.5.0"
    || !["PUBLISH_THEN_CLAIM", "CLAIM_PREPUBLISHED"]
      .includes(value.enrollmentMode)
    || typeof value.inputFile !== "string" || value.inputFile.length < 1
    || typeof value.privateRoot !== "string" || value.privateRoot.length < 1
    || value.paymentAuthorized !== false || value.orderAuthorized !== false) {
    fail("CONFIG_FIELDS_INVALID");
  }
  const base = path.dirname(record.absolute);
  return Object.freeze({ ...value,
    inputFile: path.resolve(base, value.inputFile),
    privateRoot: path.resolve(base, value.privateRoot) });
}

function safeErrorCode(error) {
  const code = error?.outsiderCode;
  return typeof code === "string" && SAFE_ERROR.test(code)
    ? code : "UNCLASSIFIED_FAILURE";
}

async function responseJson(response) {
  if (!(response instanceof Response)) fail("PUBLISH_RESPONSE_INVALID");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d{1,6}$/u.test(declared)
    || Number(declared) > MAX_RESPONSE_BYTES)) {
    fail("PUBLISH_RESPONSE_TOO_LARGE");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 2 || bytes.length > MAX_RESPONSE_BYTES) {
    fail("PUBLISH_RESPONSE_TOO_LARGE");
  }
  try {
    return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
  } catch { fail("PUBLISH_RESPONSE_JSON_INVALID"); }
}

async function publishEnrollment(input, fetchImpl) {
  const request = Object.freeze({
    schema: PUBLISH_REQUEST_SCHEMA,
    job: input.binding.job,
    bindingProjection: input.binding.publicProjection,
    executorCapabilityHash: input.executorCapabilityHash,
    publishedAt: input.publishedAt,
  });
  const response = await fetchImpl(`${input.centralOrigin}/v1/client-executions`, {
    method: "POST",
    headers: Object.freeze({
      authorization: `Bearer ${input.bearerToken}`,
      "content-type": "application/json",
      accept: "application/json",
    }),
    body: canonicalizeStrict(request),
  });
  if (!(response instanceof Response)
    || ![200, 201].includes(response.status)) {
    fail(`PUBLISH_HTTP_${response instanceof Response ? response.status : "INVALID"}`);
  }
  const body = await responseJson(response);
  exact(body, ["schema", "apiVersion", "ok", "state", "jobKey", "jobHash",
    "replayed", "durableStorage", "privateParameterBytesStored",
    "privateParameterUnkeyedHashStored", "authorityMinted",
    "capacityEstablished", "independentOutcomeTruthEstablished",
    "outcomeCommitted"], "PUBLISH_RESPONSE");
  if (body.schema !== PUBLISH_RESPONSE_SCHEMA || body.apiVersion !== "2.5.0"
    || body.ok !== true || body.state !== "PUBLISHED"
    || body.jobKey !== input.binding.jobKey
    || body.jobHash !== input.binding.jobHash
    || typeof body.replayed !== "boolean"
    || body.durableStorage !== "SQLITE_DURABLE_OBJECT"
    || body.privateParameterBytesStored !== false
    || body.privateParameterUnkeyedHashStored !== false
    || body.authorityMinted !== false || body.capacityEstablished !== false
    || body.independentOutcomeTruthEstablished !== false
    || body.outcomeCommitted !== false) fail("PUBLISH_RESPONSE_MISMATCH");
  return Object.freeze({ replayed: body.replayed });
}

/**
 * Prepare one private runtime.  `publicEnrollment` is safe to hand to the
 * Formation coordinator, but is intentionally absent from CLI stdout.
 */
export function prepareUserHeldSparkFunFormationExecutorV1(input = {},
  dependencies = {}) {
  exact(input, ["configFile", "environment", "executionMode"],
    "PREPARE_INPUT");
  exact(dependencies, ["fetchImpl", "clock"], "DEPENDENCIES");
  if (input.environment === null || typeof input.environment !== "object"
    || typeof dependencies.fetchImpl !== "function"
    || typeof dependencies.clock !== "function") fail("DEPENDENCIES_INVALID");
  if (!["ONE_SHOT", "RECONCILE_ONLY"].includes(input.executionMode)) {
    fail("EXECUTION_MODE_INVALID");
  }
  const config = readConfig(input.configFile);
  const env = OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_ENV;
  const origin = centralOrigin(secureEnvironmentValue(input.environment,
    env.centralOrigin, env.centralOriginFile, "CENTRAL_ORIGIN"));
  const publicationToken = bearerToken(secureEnvironmentValue(
    input.environment, env.publicationBearerToken,
    env.publicationBearerTokenFile, "PUBLICATION_BEARER_TOKEN"));
  const executorToken = bearerToken(secureEnvironmentValue(input.environment,
    env.executorBearerToken, env.executorBearerTokenFile,
    "EXECUTOR_BEARER_TOKEN"));
  const key = commitmentKey(secureEnvironmentValue(input.environment,
    env.commitmentKeyBase64Url, env.commitmentKeyBase64UrlFile,
    "COMMITMENT_KEY"));
  const privateEnvelope = privateBytes(config.inputFile, MAX_CONFIG_BYTES,
    "PRIVATE_INPUT").bytes;
  let reconciliationProviderAttempted = false;
  const executorFetchImpl = input.executionMode === "RECONCILE_ONLY"
    ? async () => {
      reconciliationProviderAttempted = true;
      fail("RECONCILIATION_PROVIDER_IO_FORBIDDEN");
    }
    : dependencies.fetchImpl;
  const composition = createSparkFunMagentoFormationNodeCompositionV1({
    orderId: config.orderId,
    outcomeProgramHash: config.outcomeProgramHash,
    graphRefs: config.graphRefs,
    inputFile: config.inputFile,
    privateRoot: config.privateRoot,
    issuedAt: config.issuedAt,
    expiresAt: config.expiresAt,
  }, { fetchImpl: executorFetchImpl, clock: dependencies.clock });
  const binding = createUserHeldFormationPrivateBindingV1({
    composition,
    privateEnvelopeBytes: privateEnvelope,
    commitmentKeyBytes: key,
  });
  const capabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
    bearerToken: executorToken,
    jobHash: binding.jobHash,
  });
  privateEnvelope.fill(0);
  key.fill(0);
  let started = false;
  const publicEnrollment = Object.freeze({
    schema: PUBLISH_REQUEST_SCHEMA,
    job: binding.job,
    bindingProjection: binding.publicProjection,
    executorCapabilityHash: capabilityHash,
  });
  return Object.freeze({
    publicEnrollment,
    publicProjection: Object.freeze({
      schema: "outsider/user-held-sparkfun-formation-executor-preparation/v1",
      schemaVersion: "1.0.0",
      jobKey: binding.jobKey,
      jobHash: binding.jobHash,
      centralApiVersion: config.centralApiVersion,
      executionMode: input.executionMode,
      enrollmentMode: config.enrollmentMode,
      boundary: OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_BOUNDARY,
    }),
    async runOnce() {
      if (started) fail("RUNTIME_ALREADY_STARTED");
      started = true;
      let enrollmentPublished = false;
      let enrollmentReplayed = false;
      if (input.executionMode === "ONE_SHOT"
        && config.enrollmentMode === "PUBLISH_THEN_CLAIM") {
        const publishedAt = dependencies.clock();
        const publication = await publishEnrollment({ binding,
          executorCapabilityHash: capabilityHash, centralOrigin: origin,
          bearerToken: publicationToken, publishedAt }, dependencies.fetchImpl);
        enrollmentPublished = true;
        enrollmentReplayed = publication.replayed;
      }
      const clientOperation = input.executionMode === "RECONCILE_ONLY"
        ? reconcileUserHeldFormationExecutorOnceV1
        : runUserHeldFormationExecutorOnceV1;
      const clientDependencies = input.executionMode === "RECONCILE_ONLY"
        ? {
          fetchImpl: dependencies.fetchImpl,
          clock: dependencies.clock,
          localReplayGuard: (result) =>
            reconciliationProviderAttempted === false
            && result.state === "HOLD"
            && result.reasonCode
              === "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN"
            && result.externalEffect === "CONFIRMED"
            && result.retryDisposition === "DO_NOT_RETRY",
        }
        : { fetchImpl: dependencies.fetchImpl, clock: dependencies.clock };
      const result = await clientOperation({
        centralOrigin: origin,
        bearerToken: executorToken,
        executorCapabilityHash: capabilityHash,
        binding,
      }, clientDependencies);
      return Object.freeze({
        ok: true,
        schema: RESULT_SCHEMA,
        state: result.state,
        jobKey: result.jobKey,
        jobHash: result.jobHash,
        receiptHash: result.receiptHash,
        executionMode: input.executionMode,
        enrollmentPublished,
        enrollmentReplayed,
        replayed: result.replayed,
        reconciled: result.reconciled ?? false,
        executionPerformed: result.executionPerformed,
        localDurableReplayPerformed:
          result.localDurableReplayPerformed ?? false,
        receiptSubmitted: result.receiptSubmitted ?? !result.replayed,
        boundary: OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_BOUNDARY,
      });
    },
  });
}

export async function runUserHeldSparkFunFormationExecutorOnceFromFileV1(
  input = {}, dependencies = {}) {
  return prepareUserHeldSparkFunFormationExecutorV1(input, dependencies)
    .runOnce();
}

function readActivationReferences(file) {
  const record = privateBytes(file, MAX_CONFIG_BYTES, "ACTIVATION_FILE");
  let value;
  try { value = JSON.parse(record.bytes.toString("utf8")); }
  catch { fail("ACTIVATION_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== record.bytes.toString("utf8")) {
    fail("ACTIVATION_NOT_CANONICAL");
  }
  exact(value, ["schema", "schemaVersion", "targetApiVersion", "configFile",
    "centralOriginFile", "publicationBearerTokenFile",
    "executorBearerTokenFile",
    "commitmentKeyBase64UrlFile", "paymentAuthorized", "orderAuthorized"],
  "ACTIVATION");
  if (value.schema
      !== "outsider/private-user-held-sparkfun-executor-runtime-references/v1"
    || value.schemaVersion !== "1.0.0" || value.targetApiVersion !== "2.5.0"
    || value.paymentAuthorized !== false || value.orderAuthorized !== false) {
    fail("ACTIVATION_FIELDS_INVALID");
  }
  const base = path.dirname(record.absolute);
  const selected = {};
  for (const field of ["configFile", "centralOriginFile",
    "publicationBearerTokenFile", "executorBearerTokenFile",
    "commitmentKeyBase64UrlFile"]) {
    if (typeof value[field] !== "string" || value[field].length < 1
      || value[field].length > 4096) fail("ACTIVATION_PATH_INVALID");
    selected[field] = path.resolve(base, value[field]);
  }
  return Object.freeze(selected);
}

function runtimeInputFromArgs(argv, environment) {
  if (!Array.isArray(argv)) fail("ARGV_INVALID");
  let executionMode = null;
  let configFile = null;
  let activationFile = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--once" && executionMode === null) {
      executionMode = "ONE_SHOT";
    } else if (argv[index] === "--reconcile-only"
      && executionMode === null) {
      executionMode = "RECONCILE_ONLY";
    }
    else if (argv[index] === "--config" && configFile === null
      && typeof argv[index + 1] === "string") {
      configFile = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--activation" && activationFile === null
      && typeof argv[index + 1] === "string") {
      activationFile = argv[index + 1];
      index += 1;
    } else fail("ARGV_INVALID");
  }
  if (executionMode === null) fail("EXECUTION_MODE_REQUIRED");
  if (activationFile !== null) {
    if (configFile !== null) fail("CONFIG_SOURCE_INVALID");
    const names = OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_ENV;
    for (const name of Object.values(names)) {
      if (environment[name] !== undefined) fail("ACTIVATION_ENV_CONFLICT");
    }
    const references = readActivationReferences(activationFile);
    return Object.freeze({
      configFile: references.configFile,
      executionMode,
      environment: Object.freeze({
        [names.centralOriginFile]: references.centralOriginFile,
        [names.publicationBearerTokenFile]:
          references.publicationBearerTokenFile,
        [names.executorBearerTokenFile]: references.executorBearerTokenFile,
        [names.commitmentKeyBase64UrlFile]:
          references.commitmentKeyBase64UrlFile,
      }),
    });
  }
  const fromEnvironment
    = environment[OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_ENV.configFile];
  if (configFile !== null && fromEnvironment !== undefined
    || configFile === null && typeof fromEnvironment !== "string") {
    fail("CONFIG_SOURCE_INVALID");
  }
  return Object.freeze({ configFile: configFile ?? fromEnvironment,
    environment, executionMode });
}

/** CLI wrapper with deliberately redacted failure output. */
export async function runUserHeldSparkFunFormationExecutorCliV1(input = {},
  dependencies = {}, io = {}) {
  exact(input, ["argv", "environment"], "CLI_INPUT");
  exact(dependencies, ["fetchImpl", "clock"], "DEPENDENCIES");
  exact(io, ["stdout", "stderr"], "IO");
  if (typeof io.stdout !== "function" || typeof io.stderr !== "function") {
    fail("IO_INVALID");
  }
  try {
    const runtime = runtimeInputFromArgs(input.argv, input.environment);
    const result = await runUserHeldSparkFunFormationExecutorOnceFromFileV1({
      configFile: runtime.configFile,
      environment: runtime.environment,
      executionMode: runtime.executionMode,
    }, dependencies);
    io.stdout(`${canonicalizeStrict(result)}\n`);
    return 0;
  } catch (error) {
    io.stderr(`${canonicalizeStrict({ ok: false, schema: FAILURE_SCHEMA,
      errorCode: safeErrorCode(error) })}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const exitCode = await runUserHeldSparkFunFormationExecutorCliV1({
    argv: process.argv.slice(2),
    environment: process.env,
  }, {
    fetchImpl: (url, init) => globalThis.fetch(url, init),
    clock: () => new Date().toISOString(),
  }, {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  });
  process.exitCode = exitCode;
}
