/*
 * Maintained production launcher for new first-reality runs.
 *
 * Stable v1 goal compilation/proposal semantics and v2 credentials are reused;
 * execution uses the current composition directly. Runtime and per-request
 * ownership keep historical runs on their original entrypoint.
 * No credentials or provider adapters are opened before exact confirmation.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { createFirstCommittedDigitalRealityProductionComposition,
  normalizeDigitalWitnessLifecycleConfiguration }
  from "./outsider-first-committed-digital-reality-production-composition.js";
import {
  createFirstCommittedDigitalRealityProductionLauncherV1,
  driveConfirmedProductionOutcomeV1,
  OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1,
} from "./outsider-first-committed-digital-reality-production-launcher-v1.js";
import { createProductionOutcomeRunnerV1 }
  from "./outsider-production-outcome-runner-v1.js";

const PREFIX = "OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_LAUNCHER_";
const PROFILE_SCHEMA
  = "outsider/first-committed-digital-reality-production-profile/v1";
const CREDENTIALS_SCHEMA
  = "outsider/first-committed-digital-reality-production-credentials/v2";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ACCOUNT_ID = /^[a-f0-9]{32}$/u;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const REPOSITORY_PART = /^[A-Za-z0-9_.-]{1,100}$/u;
const LOCAL_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const RUN_CONTROL_SCHEMA
  = "outsider/first-committed-reality-autonomous-run-control/v1";
const AUTONOMOUS_RESUME_SCHEMA
  = "outsider/current-first-reality-autonomous-resume-grant/v1";
const MAXIMUM_TIMER_SLICE_MS = 30_000;
const CURRENT_ENTRYPOINT = "outsider-first-committed-reality-production";
const CURRENT_RUNTIME_FILE = "current-production-runtime.json";

export const OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE
  = "outsider-first-reality-credentials-v2.json";

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function privateFile(directory, name, maximumBytes, code) {
  const file = path.join(directory, name);
  let metadata;
  try { metadata = lstatSync(file); } catch { fail(`${code}_MISSING`); }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== 0o600
    || metadata.size < 1 || metadata.size > maximumBytes) {
    fail(`${code}_NOT_PRIVATE_REGULAR_FILE`);
  }
  return Object.freeze({ file: realpathSync(file), bytes: readFileSync(file) });
}

function jsonPrivateFile(directory, name, code) {
  const record = privateFile(directory, name, 64 * 1024, code);
  let value;
  try { value = JSON.parse(record.bytes.toString("utf8")); }
  catch { fail(`${code}_INVALID_JSON`); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function positiveInteger(value, code, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(code);
  return value;
}

function clockInstant(clock) {
  let value;
  try { value = clock(); } catch { fail("DRIVER_CLOCK_FAILED"); }
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail("DRIVER_CLOCK_INVALID");
  return value;
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writePrivateRecord(file, value) {
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
    if (writeSync(descriptor, bytes) !== bytes.length) {
      fail("CURRENT_ENTRYPOINT_RECORD_PARTIAL");
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  syncDirectory(path.dirname(file));
}

function claimCurrentRuntime(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const expected = {
    schema: "outsider/current-first-reality-runtime/v1",
    entrypoint: CURRENT_ENTRYPOINT,
  };
  const marker = path.join(directory, CURRENT_RUNTIME_FILE);
  if (!existsSync(marker)) {
    if (readdirSync(directory).length !== 0) {
      fail("HISTORICAL_RUNTIME_REQUIRES_ORIGINAL_ENTRYPOINT");
    }
    writePrivateRecord(marker, expected);
  }
  const actual = jsonPrivateFile(directory, CURRENT_RUNTIME_FILE,
    "CURRENT_RUNTIME");
  if (canonicalizeStrict(actual) !== canonicalizeStrict(expected)) {
    fail("RUNTIME_ENTRYPOINT_MISMATCH");
  }
}

function createEntrypointOwnership(directory) {
  const root = path.join(directory, "current-entrypoint");
  mkdirSync(root, { mode: 0o700, recursive: true });
  function name(kind, requestId) {
    return `${kind}-${createHash("sha256").update(requestId)
      .digest("hex")}.json`;
  }
  function binding(kind, proposal) {
    return { schema: "outsider/current-first-reality-entry/v1",
      entrypoint: CURRENT_ENTRYPOINT, kind, requestId: proposal.requestId,
      programId: proposal.programId, programHash: proposal.programHash };
  }
  function has(kind, requestId) {
    return existsSync(path.join(root, name(kind, requestId)));
  }
  function check(kind, proposal) {
    if (!has(kind, proposal.requestId)) fail("REQUEST_NOT_OWNED_BY_CURRENT_ENTRYPOINT");
    const actual = jsonPrivateFile(root, name(kind, proposal.requestId),
      "CURRENT_ENTRYPOINT_RECORD");
    if (canonicalizeStrict(actual) !== canonicalizeStrict(binding(kind, proposal))) {
      fail("CURRENT_ENTRYPOINT_RECORD_MISMATCH");
    }
  }
  return {
    has,
    check,
    prepareRequest(request) {
      if (typeof request?.requestId !== "string") fail("REQUEST_INVALID");
      const fileName = name("request-intent", request.requestId);
      const expected = { schema: "outsider/current-first-reality-request-intent/v1",
        entrypoint: CURRENT_ENTRYPOINT, requestId: request.requestId,
        requestHash: sha256(canonicalizeStrict(request)) };
      if (!existsSync(path.join(root, fileName))) {
        const key = createHash("sha256").update(request.requestId).digest("hex");
        if (existsSync(path.join(directory, "requests", `${key}.request.json`))) {
          fail("REQUEST_NOT_OWNED_BY_CURRENT_ENTRYPOINT");
        }
        // Record ownership before the stable proposal compiler persists its
        // request. Retrying after an interruption can then finish this entry.
        writePrivateRecord(path.join(root, fileName), expected);
      }
      const actual = jsonPrivateFile(root, fileName, "CURRENT_REQUEST_INTENT");
      if (canonicalizeStrict(actual) !== canonicalizeStrict(expected)) {
        fail("CURRENT_REQUEST_INTENT_MISMATCH");
      }
    },
    record(kind, proposal) {
      if (!has(kind, proposal.requestId)) {
        writePrivateRecord(path.join(root, name(kind, proposal.requestId)),
          binding(kind, proposal));
      }
      check(kind, proposal);
    },
  };
}

/*
 * This intentionally shares the v1 marker schema and path derivation. A v1
 * and any later launcher therefore cannot both claim the same autonomous run.
 */
function createExecutionControl(directory, clock) {
  const root = path.join(directory, "execution-control");
  const active = new Map();
  const publicEntries = new Map();

  function markerFile(requestId) {
    return path.join(root, `${createHash("sha256").update(requestId)
      .digest("hex")}.first-autonomous-launch.json`);
  }

  function controlName(requestId, suffix) {
    return `${createHash("sha256").update(requestId).digest("hex")}.${suffix}.json`;
  }

  function hasPublicEntry(requestId) {
    const name = controlName(requestId, "first-public-entry");
    if (!existsSync(path.join(root, name))) return false;
    const record = jsonPrivateFile(root, name, "PUBLIC_ENTRY_RECORD");
    if (record.schema !== "outsider/current-first-reality-public-entry/v1"
      || record.requestId !== requestId) fail("PUBLIC_ENTRY_RECORD_MISMATCH");
    return true;
  }

  function grantName(requestId) {
    return controlName(requestId, "autonomous-resume-grant");
  }

  function grantBinding(value) {
    if (typeof value.autonomousResumeBindingHash !== "string"
      || !HASH.test(value.autonomousResumeBindingHash)) {
      fail("AUTONOMOUS_RESUME_BINDING_INVALID");
    }
    return { schema: AUTONOMOUS_RESUME_SCHEMA, entrypoint: CURRENT_ENTRYPOINT,
      requestId: value.requestId, programHash: value.programHash,
      autonomousResumeBindingHash: value.autonomousResumeBindingHash };
  }

  function checkGrant(value) {
    const expected = grantBinding(value);
    const record = jsonPrivateFile(root, grantName(value.requestId),
      "AUTONOMOUS_RESUME_GRANT");
    const { authorizedAt, ...binding } = record;
    if (typeof authorizedAt !== "string" || !Number.isFinite(Date.parse(authorizedAt))
      || new Date(authorizedAt).toISOString() !== authorizedAt
      || canonicalizeStrict(binding) !== canonicalizeStrict(expected)) {
      fail("AUTONOMOUS_RESUME_GRANT_MISMATCH");
    }
    if (hasPublicEntry(value.requestId)) fail("AUTONOMOUS_RESUME_PUBLIC_ENTRY_RECORDED");
  }

  function checkFirstLaunch(value) {
    const record = jsonPrivateFile(root, path.basename(markerFile(value.requestId)),
      "AUTONOMOUS_LAUNCH_RECORD");
    if (record.schema !== RUN_CONTROL_SCHEMA || record.requestId !== value.requestId
      || record.programHash !== value.programHash
      || record.launchKind !== "CONFIRM_AND_DRIVE") fail("AUTONOMOUS_LAUNCH_RECORD_MISMATCH");
  }

  function claimFirstLaunch(requestId, programHash) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const bytes = Buffer.from(`${canonicalizeStrict({
      schema: RUN_CONTROL_SCHEMA,
      requestId,
      programHash,
      launchKind: "CONFIRM_AND_DRIVE",
      claimedAt: clockInstant(clock),
    })}\n`, "utf8");
    let descriptor;
    try {
      descriptor = openSync(markerFile(requestId), "wx", 0o600);
      writeSync(descriptor, bytes);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      syncDirectory(root);
      return true;
    } catch (error) {
      if (error?.code === "EEXIST") return false;
      fail("RUN_CONTROL_PERSIST_FAILED");
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }

  return Object.freeze({
    hasDurableGrant(requestId) {
      return existsSync(path.join(root, grantName(requestId)));
    },
    prepareDurableRun(value) {
      const binding = grantBinding(value);
      if (hasPublicEntry(value.requestId)) fail("AUTONOMOUS_RESUME_PUBLIC_ENTRY_RECORDED");
      if (existsSync(path.join(root, grantName(value.requestId)))) {
        checkGrant(value);
      } else {
        if (existsSync(markerFile(value.requestId))) {
          fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
        }
        mkdirSync(root, { recursive: true, mode: 0o700 });
        writePrivateRecord(path.join(root, grantName(value.requestId)), {
          ...binding, authorizedAt: clockInstant(clock),
        });
      }
      return Object.freeze({ ...binding, prepared: true });
    },
    beginDurableRun(value, resume) {
      grantBinding(value);
      if (active.has(value.requestId)) fail("AUTONOMOUS_RUN_ALREADY_ACTIVE");
      if (hasPublicEntry(value.requestId)) fail("AUTONOMOUS_RESUME_PUBLIC_ENTRY_RECORDED");
      if (resume) {
        checkGrant(value);
        // A crash may occur after grant fsync but before first-launch fsync.
        // The original grant, never a fresh public confirmation, closes it.
        if (!existsSync(markerFile(value.requestId))) {
          claimFirstLaunch(value.requestId, value.programHash);
        }
      } else {
        if (existsSync(markerFile(value.requestId))) {
          fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
        }
        checkGrant(value);
        if (!claimFirstLaunch(value.requestId, value.programHash)) {
          fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
        }
      }
      checkFirstLaunch(value);
      const lease = Object.freeze({ requestId: value.requestId,
        programHash: value.programHash, firstDurableLaunch: true,
        durableAutonomousResume: true });
      active.set(value.requestId, lease);
      return lease;
    },
    beginConfirmAndDrive(requestId, programHash) {
      if (active.has(requestId)) fail("AUTONOMOUS_RUN_ALREADY_ACTIVE");
      if (!claimFirstLaunch(requestId, programHash)) {
        fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
      }
      const lease = Object.freeze({ requestId, programHash,
        firstDurableLaunch: true });
      active.set(requestId, lease);
      return lease;
    },
    endConfirmAndDrive(lease) {
      if (active.get(lease.requestId) === lease) active.delete(lease.requestId);
    },
    recordPublicEntry(requestId) {
      // A public/manual entry permanently prevents a later process from
      // laundering the same run back into zero-touch autonomous execution.
      mkdirSync(root, { recursive: true, mode: 0o700 });
      const file = path.join(root, controlName(requestId, "first-public-entry"));
      if (!existsSync(file)) writePrivateRecord(file, {
        schema: "outsider/current-first-reality-public-entry/v1", requestId,
        recordedAt: clockInstant(clock),
      });
      publicEntries.set(requestId, (publicEntries.get(requestId) ?? 0) + 1);
    },
    async measureOperations({ program }) {
      const requestId = program?.orderId;
      const lease = active.get(requestId) ?? null;
      const publicEntryCount = Math.max(publicEntries.get(requestId) ?? 0,
        hasPublicEntry(requestId) ? 1 : 0);
      if (lease?.firstDurableLaunch === true
        && lease.programHash === program?.programHash
        && publicEntryCount === 0) {
        return {
          outsiderStaffTouchCount: 0,
          humanQueueCreated: false,
          source: lease.durableAutonomousResume === true
            ? "FIRST_REALITY_DURABLE_AUTONOMOUS_RESUME_GRANT_V1"
            : "FIRST_REALITY_IN_PROCESS_CONFIRM_AND_DRIVE_LEASE_V1",
        };
      }
      const observedTouches = publicEntryCount
        + (lease !== null && !lease.firstDurableLaunch ? 1 : 0);
      return {
        outsiderStaffTouchCount: observedTouches > 0 ? observedTouches : null,
        humanQueueCreated: false,
        source: observedTouches > 0
          ? "FIRST_REALITY_PUBLIC_OR_REPEATED_ENTRY_V1"
          : "FIRST_REALITY_EXECUTION_CONTROL_UNPROVEN_V1",
      };
    },
  });
}

function priorExecutionStartExists(directory, requestId, programId) {
  const requestKey = createHash("sha256").update(requestId).digest("hex");
  const programKey = createHash("sha256").update(programId).digest("hex");
  return existsSync(path.join(directory, "requests",
    `${requestKey}.confirmation.json`))
    || existsSync(path.join(directory, "executions",
      `${programKey}.events.jsonl`));
}

async function defaultWaitUntil(target, context) {
  while (true) {
    const remaining = Date.parse(target) - Date.parse(
      clockInstant(context.clock));
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve,
      Math.min(remaining, context.maximumTimerSliceMs)));
  }
}

function loadExecutionProfile(profileDirectory) {
  if (typeof profileDirectory !== "string" || profileDirectory.length < 1) {
    fail("PROFILE_DIRECTORY_INVALID");
  }
  let directory;
  try { directory = realpathSync(path.resolve(profileDirectory)); }
  catch { fail("PROFILE_DIRECTORY_MISSING"); }
  const input = jsonPrivateFile(directory,
    OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1, "PROFILE_FILE");
  if (input.schema !== PROFILE_SCHEMA
    || typeof input.artifactFile !== "string"
    || !LOCAL_FILE.test(input.artifactFile)
    || typeof input.artifactHash !== "string" || !HASH.test(input.artifactHash)
    || typeof input.contentType !== "string" || input.contentType.length < 1
    || Buffer.byteLength(input.contentType, "utf8") > 200
    || /[\r\n]/u.test(input.contentType)
    || input.cloudflare === null || typeof input.cloudflare !== "object"
    || !ACCOUNT_ID.test(input.cloudflare.accountId)
    || !HOST_LABEL.test(input.cloudflare.workersDevSubdomain)
    || (input.cloudflare.controlledFailureStatus !== undefined
      && input.cloudflare.controlledFailureStatus !== 503)
    || input.github === null || typeof input.github !== "object"
    || !REPOSITORY_PART.test(input.github.owner)
    || !REPOSITORY_PART.test(input.github.repository)
    || (input.github.baseBranch !== undefined
      && (typeof input.github.baseBranch !== "string"
        || input.github.baseBranch.length < 1
        || input.github.baseBranch.length > 200
        || /[\u0000-\u001f\u007f]/u.test(input.github.baseBranch)))
    || input.uptimeRobot === null || typeof input.uptimeRobot !== "object"
    || typeof input.uptimeRobot.permissionGrantHash !== "string"
    || !HASH.test(input.uptimeRobot.permissionGrantHash)) {
    fail("PROFILE_INVALID");
  }
  const observationWindowMs = positiveInteger(input.observationWindowMs,
    "OBSERVATION_WINDOW_INVALID", 31_536_000_000);
  const intervalSeconds = positiveInteger(
    input.uptimeRobot.intervalSeconds ?? 300,
    "UPTIMEROBOT_INTERVAL_INVALID", 2_678_400);
  const timeoutSeconds = positiveInteger(
    input.uptimeRobot.timeoutSeconds ?? 30,
    "UPTIMEROBOT_TIMEOUT_INVALID", 60);
  if (intervalSeconds < 30 || observationWindowMs < intervalSeconds * 1_000) {
    fail("OBSERVATION_WINDOW_TOO_SHORT_FOR_MONITOR");
  }
  const codes = input.uptimeRobot.successHttpResponseCodes ?? ["2xx"];
  if (!Array.isArray(codes) || codes.length < 1
    || new Set(codes).size !== codes.length
    || codes.some((value) => typeof value !== "string"
      || !/^(?:[1-5]xx|[1-5]\d\d)$/u.test(value))) {
    fail("UPTIMEROBOT_SUCCESS_CODES_INVALID");
  }
  const artifact = privateFile(directory, input.artifactFile, 10 * 1024,
    "ARTIFACT_FILE");
  if (sha256(artifact.bytes) !== input.artifactHash) {
    fail("ARTIFACT_HASH_MISMATCH");
  }
  try { new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes); }
  catch { fail("ARTIFACT_NOT_UTF8"); }
  return Object.freeze({
    directory,
    artifactBytes: Buffer.from(artifact.bytes),
    contentType: input.contentType,
    cloudflare: Object.freeze({ ...input.cloudflare }),
    github: Object.freeze({ ...input.github }),
    uptimeRobot: Object.freeze({
      permissionGrantHash: input.uptimeRobot.permissionGrantHash,
      intervalSeconds,
      timeoutSeconds,
      successHttpResponseCodes: Object.freeze([...codes]),
      ...(input.uptimeRobot.lifecycle === undefined ? {} : {
        lifecycle: normalizeDigitalWitnessLifecycleConfiguration(
          input.uptimeRobot.lifecycle),
      }),
    }),
  });
}

function loadCredentials(directory) {
  const input = jsonPrivateFile(directory,
    OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE,
    "CREDENTIALS_FILE");
  const github = input.githubReleaseAsset;
  if (input.schema !== CREDENTIALS_SCHEMA
    || input.cloudflare === null || typeof input.cloudflare !== "object"
    || typeof input.cloudflare.apiToken !== "string"
    || input.cloudflare.apiToken.length < 20
    || github === null || typeof github !== "object"
    || typeof github.contentsWriteApiToken !== "string"
    || github.contentsWriteApiToken.length < 20
    || typeof github.administrationReadApiToken !== "string"
    || github.administrationReadApiToken.length < 20
    || github.contentsWriteApiToken !== github.administrationReadApiToken
    || github.administrationReadCapabilityConfirmed !== true
    || input.uptimeRobot === null || typeof input.uptimeRobot !== "object"
    || typeof input.uptimeRobot.apiToken !== "string"
    || input.uptimeRobot.apiToken.length < 1
    || /\s/u.test(input.uptimeRobot.apiToken)
    || typeof input.uptimeRobot.expiresAt !== "string"
    || !Number.isFinite(Date.parse(input.uptimeRobot.expiresAt))
    || new Date(input.uptimeRobot.expiresAt).toISOString()
      !== input.uptimeRobot.expiresAt) {
    fail("CREDENTIALS_INVALID");
  }
  return input;
}

function checkedIO(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("PROVIDER_IO_INVALID");
  }
  for (const [key, value] of Object.entries(input)) {
    if (!["cloudflareFetch", "githubContentsFetch",
      "githubAdministrationFetch", "uptimeRobotRequest", "globalpingFetch",
      "wait"].includes(key)) fail("PROVIDER_IO_FIELD_UNKNOWN");
    if (typeof value !== "function") fail("PROVIDER_IO_FUNCTION_INVALID");
  }
  return input;
}

function executionComposition(profile, credentials, directory, io, clock) {
  return createFirstCommittedDigitalRealityProductionComposition({
    directory: path.join(directory, "provider-state"),
    cloudflare: {
      apiToken: credentials.cloudflare.apiToken,
      accountId: profile.cloudflare.accountId,
      workersDevSubdomain: profile.cloudflare.workersDevSubdomain,
      ...(profile.cloudflare.controlledFailureStatus === undefined ? {}
        : { controlledFailureStatus:
          profile.cloudflare.controlledFailureStatus }),
      artifactBytes: profile.artifactBytes,
      contentType: profile.contentType,
      ...(io.cloudflareFetch === undefined
        ? {} : { fetchImpl: io.cloudflareFetch }),
    },
    githubReleaseAsset: {
      contentsWriteApiToken:
        credentials.githubReleaseAsset.contentsWriteApiToken,
      administrationReadApiToken:
        credentials.githubReleaseAsset.administrationReadApiToken,
      administrationReadCapabilityConfirmed:
        credentials.githubReleaseAsset.administrationReadCapabilityConfirmed,
      owner: profile.github.owner,
      repository: profile.github.repository,
      ...(profile.github.baseBranch === undefined
        ? {} : { baseBranch: profile.github.baseBranch }),
      artifactBytes: profile.artifactBytes,
      ...(io.githubContentsFetch === undefined
        ? {} : { contentsFetchImpl: io.githubContentsFetch }),
      ...(io.githubAdministrationFetch === undefined
        ? {} : { administrationFetchImpl: io.githubAdministrationFetch }),
    },
    uptimeRobot: {
      apiToken: credentials.uptimeRobot.apiToken,
      expiresAt: credentials.uptimeRobot.expiresAt,
      permissionGrantHash: profile.uptimeRobot.permissionGrantHash,
      intervalSeconds: profile.uptimeRobot.intervalSeconds,
      timeoutSeconds: profile.uptimeRobot.timeoutSeconds,
      successHttpResponseCodes: profile.uptimeRobot.successHttpResponseCodes,
      ...(profile.uptimeRobot.lifecycle === undefined ? {} : {
        lifecycle: profile.uptimeRobot.lifecycle,
      }),
      ...(io.uptimeRobotRequest === undefined
        ? {} : { requestImpl: io.uptimeRobotRequest }),
      ...(io.wait === undefined ? {} : { readinessWait: io.wait }),
      clock,
    },
    globalping: {
      ...(io.globalpingFetch === undefined
        ? {} : { fetchImpl: io.globalpingFetch }),
      ...(io.wait === undefined ? {} : { wait: io.wait }),
      clock,
    },
  });
}

/**
 * V1 owns goal -> proposal. Current execution begins after exact confirmation, so
 * proposal hashes and user confirmation semantics do not fork by adapter.
 */
export function createFirstCommittedDigitalRealityProductionLauncher(
  input = {}) {
  if (typeof input.runtimeDirectory !== "string"
    || input.runtimeDirectory.length < 1) fail("RUNTIME_DIRECTORY_INVALID");
  const profile = loadExecutionProfile(input.profileDirectory);
  const directory = path.resolve(input.runtimeDirectory);
  const clock = input.clock ?? (() => new Date().toISOString());
  if (typeof clock !== "function") fail("CLOCK_INVALID");
  const waitUntil = input.waitUntil ?? defaultWaitUntil;
  if (typeof waitUntil !== "function") fail("WAIT_UNTIL_INVALID");
  const io = checkedIO(input.providerIO);
  claimCurrentRuntime(directory);
  const ownership = createEntrypointOwnership(directory);
  const executionControl = createExecutionControl(directory, clock);
  const proposalLauncher =
    createFirstCommittedDigitalRealityProductionLauncherV1({
      profileDirectory: profile.directory,
      runtimeDirectory: directory,
      clock,
      waitUntil,
    });
  let executor = null;

  function ownedProposal(requestId) {
    const proposal = proposalLauncher.proposal(requestId);
    ownership.check("request", proposal);
    return proposal;
  }

  function claimExecution(proposal) {
    if (!ownership.has("execution", proposal.requestId)
      && priorExecutionStartExists(directory, proposal.requestId,
        proposal.programId)) {
      fail("HISTORICAL_EXECUTION_REQUIRES_ORIGINAL_ENTRYPOINT");
    }
    ownership.record("execution", proposal);
  }

  function executionRunner() {
    if (executor !== null) return executor;
    const credentials = loadCredentials(profile.directory);
    const composition = executionComposition(profile, credentials, directory,
      io, clock);
    executor = createProductionOutcomeRunnerV1({
      directory,
      composition: Object.freeze({
        ...composition,
        compileGoal() { fail("EXECUTION_COMPILER_DISABLED"); },
      }),
      clock,
      measureOperations: executionControl.measureOperations,
    });
    return executor;
  }

  function checkedConfirmation(confirmation) {
    if (confirmation === null || typeof confirmation !== "object"
      || typeof confirmation.requestId !== "string"
      || typeof confirmation.programHash !== "string") {
      fail("CONFIRMATION_INVALID");
    }
    const proposal = ownedProposal(confirmation.requestId);
    if (proposal.programHash !== confirmation.programHash) {
      fail("CONFIRMATION_PROGRAM_MISMATCH");
    }
    return proposal;
  }

  function confirmOutcome(confirmation, runOptions = {}) {
    const proposal = checkedConfirmation(confirmation);
    const runner = executionRunner();
    claimExecution(proposal);
    executionControl.recordPublicEntry(confirmation.requestId);
    return runner.confirmOutcome(confirmation, runOptions);
  }

  // The caller must hold one cross-process lock for this job/runtime during
  // both methods. The binding hash identifies a pre-authorized node job; it
  // is not a bearer credential or a public/manual re-entry exemption.
  function prepareDurableExecution(input) {
    const proposal = checkedConfirmation(input);
    if (typeof input.autonomousResumeBindingHash !== "string"
      || !HASH.test(input.autonomousResumeBindingHash)) {
      fail("AUTONOMOUS_RESUME_BINDING_INVALID");
    }
    if (priorExecutionStartExists(directory, input.requestId, proposal.programId)
      && !executionControl.hasDurableGrant(input.requestId)) {
      fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
    }
    claimExecution(proposal);
    return executionControl.prepareDurableRun(input);
  }

  async function driveDurableConfirmation(input, runOptions, resume) {
    const proposal = checkedConfirmation(input);
    if (resume) {
      ownership.check("execution", proposal);
    } else {
      if (priorExecutionStartExists(directory, input.requestId, proposal.programId)) {
        fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
      }
      prepareDurableExecution(input);
    }
    const lease = executionControl.beginDurableRun(input, resume);
    try {
      const runner = executionRunner();
      // Stable confirmOutcome replays the same frozen program and journal.
      // It also closes crash gaps before confirmation or PROGRAM_ACCEPTED;
      // resumeConfirmed alone cannot recreate those missing initial records.
      const initial = await runner.confirmOutcome({ requestId: input.requestId,
        programHash: input.programHash }, runOptions);
      return await driveConfirmedProductionOutcomeV1({ projection: initial,
        resume: () => runner.resumeConfirmed(input.requestId, runOptions),
        clock, waitUntil });
    } finally {
      executionControl.endConfirmAndDrive(lease);
    }
  }

  return Object.freeze({
    async requestOutcome(request) {
      ownership.prepareRequest(request);
      const proposal = await proposalLauncher.requestOutcome(request);
      ownership.record("request", proposal);
      return proposal;
    },
    proposal(requestId) {
      return ownedProposal(requestId);
    },
    confirmOutcome,
    prepareDurableExecution,
    confirmAndDriveDurably(confirmation, runOptions = {}) {
      return driveDurableConfirmation(confirmation, runOptions, false);
    },
    resumeAndDrive(confirmation, runOptions = {}) {
      return driveDurableConfirmation(confirmation, runOptions, true);
    },
    async confirmAndDrive(confirmation, runOptions = {}) {
      const proposal = checkedConfirmation(confirmation);
      if (priorExecutionStartExists(directory, confirmation.requestId,
        proposal.programId)) {
        fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
      }
      const runner = executionRunner();
      claimExecution(proposal);
      const lease = executionControl.beginConfirmAndDrive(
        confirmation.requestId, confirmation.programHash);
      try {
        const initial = await runner.confirmOutcome(confirmation, runOptions);
        return await driveConfirmedProductionOutcomeV1({
          projection: initial,
          resume: () => runner.resumeConfirmed(
            confirmation.requestId, runOptions),
          clock,
          waitUntil,
        });
      } finally {
        executionControl.endConfirmAndDrive(lease);
      }
    },
    resumeConfirmed(requestId, runOptions = {}) {
      const proposal = ownedProposal(requestId);
      ownership.check("execution", proposal);
      executionControl.recordPublicEntry(requestId);
      return executionRunner().resumeConfirmed(requestId, runOptions);
    },
    inspectProgram(programId) {
      return proposalLauncher.inspectProgram(programId);
    },
  });
}
