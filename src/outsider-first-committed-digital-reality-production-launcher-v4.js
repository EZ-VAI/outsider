/*
 * Versioned launcher descendant for the first committed digital reality.
 *
 * Goal compilation and proposal persistence are delegated to the frozen v1
 * launcher. Exact-hash confirmation is then executed with the v4 composition:
 * preactivated Cloudflare primary, GitHub Release Asset recovery, and a
 * formation-preflighted UptimeRobot/redirect-aware Globalping witness path.
 * The existing v2 credential file names Contents write and Administration read
 * separately, but both fields must carry the same token because the policy
 * observation must authorize the credential that performs the release
 * lifecycle.
 *
 * Proposal paths never open the credential file or construct a provider
 * adapter. Confirmation paths load the fixed local 0600 credential file only
 * after recalling and matching the exact proposal hash.
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
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { createFirstCommittedDigitalRealityProductionCompositionV4 }
  from "./outsider-first-committed-digital-reality-production-composition-v4.js";
import {
  createFirstCommittedDigitalRealityProductionLauncherV1,
  driveConfirmedProductionOutcomeV1,
  OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1,
} from "./outsider-first-committed-digital-reality-production-launcher-v1.js";
import { createProductionOutcomeRunnerV1 }
  from "./outsider-production-outcome-runner-v1.js";

const PREFIX = "OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_LAUNCHER_V4_";
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
const MAXIMUM_TIMER_SLICE_MS = 30_000;

export const OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V4
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
      publicEntries.set(requestId, (publicEntries.get(requestId) ?? 0) + 1);
    },
    async measureOperations({ program }) {
      const requestId = program?.orderId;
      const lease = active.get(requestId) ?? null;
      const publicEntryCount = publicEntries.get(requestId) ?? 0;
      if (lease?.firstDurableLaunch === true
        && lease.programHash === program?.programHash
        && publicEntryCount === 0) {
        return {
          outsiderStaffTouchCount: 0,
          humanQueueCreated: false,
          source: "FIRST_REALITY_IN_PROCESS_CONFIRM_AND_DRIVE_LEASE_V1",
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
    }),
  });
}

function loadCredentials(directory) {
  const input = jsonPrivateFile(directory,
    OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V4,
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
  return createFirstCommittedDigitalRealityProductionCompositionV4({
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
      ...(io.uptimeRobotRequest === undefined
        ? {} : { requestImpl: io.uptimeRobotRequest }),
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
 * V1 owns goal -> proposal. V4 takes over only after exact confirmation, so
 * proposal hashes and user confirmation semantics do not fork by adapter.
 */
export function createFirstCommittedDigitalRealityProductionLauncherV4(
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
  const executionControl = createExecutionControl(directory, clock);
  const proposalLauncher =
    createFirstCommittedDigitalRealityProductionLauncherV1({
      profileDirectory: profile.directory,
      runtimeDirectory: directory,
      clock,
      waitUntil,
    });
  let executor = null;

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
    const proposal = proposalLauncher.proposal(confirmation.requestId);
    if (proposal.programHash !== confirmation.programHash) {
      fail("CONFIRMATION_PROGRAM_MISMATCH");
    }
    return proposal;
  }

  function confirmOutcome(confirmation, runOptions = {}) {
    checkedConfirmation(confirmation);
    executionControl.recordPublicEntry(confirmation.requestId);
    return executionRunner().confirmOutcome(confirmation, runOptions);
  }

  return Object.freeze({
    requestOutcome(request) {
      return proposalLauncher.requestOutcome(request);
    },
    proposal(requestId) {
      return proposalLauncher.proposal(requestId);
    },
    confirmOutcome,
    async confirmAndDrive(confirmation, runOptions = {}) {
      const proposal = checkedConfirmation(confirmation);
      if (priorExecutionStartExists(directory, confirmation.requestId,
        proposal.programId)) {
        fail("AUTONOMOUS_RUN_ALREADY_CLAIMED_USE_PUBLIC_RESUME");
      }
      const runner = executionRunner();
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
      executionControl.recordPublicEntry(requestId);
      return executionRunner().resumeConfirmed(requestId, runOptions);
    },
    inspectProgram(programId) {
      return proposalLauncher.inspectProgram(programId);
    },
  });
}
