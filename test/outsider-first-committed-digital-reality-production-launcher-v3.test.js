import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { OUTSIDER_DURABLE_OUTCOME_EMERGENCY_FAIL_CLOSE_V1_SCHEMA }
  from "../src/outsider-durable-outcome-emergency-fail-close-v1.js";
import { createFirstCommittedDigitalRealityProductionLauncherV3 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v3.js";
import { OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V2 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v2.js";
import { OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v1.js";
import { createDurableOutcomeProgramOrchestratorV1 }
  from "../src/outsider-durable-outcome-program-orchestrator-v1.js";

const CLOCK = "2026-09-04T12:00:00.000Z";
const ARTIFACT = Buffer.from("outsider emergency fail-close v3\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;

function privateWrite(file, value, mode = 0o600) {
  writeFileSync(file, Buffer.isBuffer(value) ? value
    : Buffer.from(`${JSON.stringify(value)}\n`, "utf8"), { mode });
  chmodSync(file, mode);
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-reality-v3-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profileDirectory = path.join(root, "profile");
  const runtimeDirectory = path.join(root, "runtime");
  mkdirSync(profileDirectory, { mode: 0o700 });
  mkdirSync(runtimeDirectory, { mode: 0o700 });
  privateWrite(path.join(profileDirectory, "artifact.txt"), ARTIFACT);
  privateWrite(path.join(profileDirectory,
    OUTSIDER_FIRST_COMMITTED_REALITY_PROFILE_FILE_V1), {
    schema:
      "outsider/first-committed-digital-reality-production-profile/v1",
    artifactFile: "artifact.txt",
    artifactHash: ARTIFACT_HASH,
    contentType: "text/plain; charset=utf-8",
    formationLeadMs: 300_000,
    observationWindowMs: 600_000,
    cleanupGraceMs: 600_000,
    cloudflare: {
      accountId: "a".repeat(32),
      workersDevSubdomain: "outsider-test",
      controlledFailureStatus: 503,
    },
    github: { owner: "owner", repository: "repository" },
    uptimeRobot: {
      permissionGrantHash: `sha256:${"9".repeat(64)}`,
      intervalSeconds: 300,
      timeoutSeconds: 30,
      successHttpResponseCodes: ["2xx"],
    },
  });
  return { root, profileDirectory, runtimeDirectory };
}

function goal(requestId) {
  return {
    requestId,
    goal: "Publish, recover, independently witness, then remove the result.",
    completionDeadline: "2026-09-04T12:30:00.000Z",
    budget: { currency: "USD", maximumAmountMinor: "0" },
  };
}

function emergencyRequest(proposal) {
  return {
    schema: OUTSIDER_DURABLE_OUTCOME_EMERGENCY_FAIL_CLOSE_V1_SCHEMA,
    schemaVersion: "1.0.0",
    interventionId: "intervention_launcher_v3_001",
    requestId: proposal.requestId,
    programId: proposal.programId,
    programHash: proposal.programHash,
    expectedEventCount: 20,
    expectedJournalHeadHash: `sha256:${"1".repeat(64)}`,
    blockedNodeId: "publish_result",
    blockedOperationId: "op_blocked_witness_001",
    blockedObservationOccurrence: 1,
    blockedReason: "DETERMINISTIC_REDIRECT_INCOMPATIBILITY",
    productDefectCode: "GLOBALPING_REDIRECT_ADAPTER_INCOMPATIBLE",
    diagnosisEvidenceHash: `sha256:${"2".repeat(64)}`,
    stoppedDriverLeaseHash: `sha256:${"4".repeat(64)}`,
  };
}

function emergencyNetwork() {
  function common(adapterId) {
    return {
      adapterId,
      providerRef: adapterId,
      async reserve({ requirement }) {
        return {
          status: "RESERVED",
          reservationId: `reservation:${adapterId}`,
          validUntil: "2026-09-04T13:00:00.000Z",
          adapterState: { route: `https://${requirement.role}.example/` },
        };
      },
      async closeObligation() { return { status: "CLOSED" }; },
      async release() { return { status: "RELEASED" }; },
    };
  }
  const primaryId = "cloudflare-worker-production-v1";
  const recoveryId = "github-release-asset-production-recovery-v2";
  const witnessId = "first-committed-reality-route-witness-v1";
  return {
    adapters: {
      [primaryId]: {
        ...common(primaryId),
        async execute() { return { status: "FAILED" }; },
      },
      [recoveryId]: {
        ...common(recoveryId),
        async execute() { return { status: "SUCCEEDED" }; },
      },
      [witnessId]: {
        ...common(witnessId),
        async observe() {
          return { status: "INCONCLUSIVE",
            reason: "DETERMINISTIC_REDIRECT_INCOMPATIBILITY" };
        },
      },
    },
    async discover({ requirement }) {
      return { adapterId: {
        primary_publication: primaryId,
        recovery_publication: recoveryId,
        independent_http_witness: witnessId,
      }[requirement.requirementId] };
    },
  };
}

test("v3 preserves credential-free v2 proposal behavior", async (t) => {
  const state = fixture(t);
  let calls = 0;
  const forbidden = async () => { calls += 1; throw new Error("network"); };
  const launcher = createFirstCommittedDigitalRealityProductionLauncherV3({
    profileDirectory: state.profileDirectory,
    runtimeDirectory: state.runtimeDirectory,
    clock: () => CLOCK,
    providerIO: {
      cloudflareFetch: forbidden,
      githubContentsFetch: forbidden,
      githubAdministrationFetch: forbidden,
      uptimeRobotRequest: forbidden,
      globalpingFetch: forbidden,
    },
  });
  const proposal = await launcher.requestOutcome(goal("reality_v3_goal_001"));
  assert.equal(proposal.nextAction, "CONFIRM_ONCE");
  assert.equal(launcher.proposal(proposal.requestId).programHash,
    proposal.programHash);
  assert.equal(calls, 0);
});

test("v3 replays confirmation and credential readiness before any emergency journal append",
  async (t) => {
    const state = fixture(t);
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV3({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
    });
    const proposal = await launcher.requestOutcome(goal("reality_v3_fc_001"));
    const requestKey = createHash("sha256").update(proposal.requestId)
      .digest("hex");
    privateWrite(path.join(state.runtimeDirectory, "requests",
      `${requestKey}.confirmation.json`), {
      schema: "outsider/outcome-confirmation/v1",
      requestId: proposal.requestId,
      proposalId: proposal.proposalId,
      programHash: proposal.programHash,
      confirmedAt: CLOCK,
    });

    await assert.rejects(launcher.requestEmergencyFailClose(
      emergencyRequest(proposal)), /CREDENTIALS_FILE_MISSING/u);
    assert.deepEqual(readdirSync(path.join(state.runtimeDirectory,
      "executions")).filter((name) => name.endsWith(".events.jsonl")), [],
    "failed preflight must not append an intervention");
  });

test("v3 CLI requires a private emergency request and rejects secret flags",
  async (t) => {
    const state = fixture(t);
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV3({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
    });
    const proposal = await launcher.requestOutcome(goal("reality_v3_cli_001"));
    const requestFile = path.join(state.root, "emergency.json");
    privateWrite(requestFile, emergencyRequest(proposal), 0o644);
    const script = path.resolve(
      "scripts/outsider-first-committed-reality-production-v3.mjs");
    const common = ["--profile-dir", state.profileDirectory,
      "--runtime-dir", state.runtimeDirectory];
    const insecure = spawnSync(process.execPath, [script,
      "emergency-proposal", "--request", requestFile, ...common], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(insecure.status, 1);
    assert.match(insecure.stderr,
      /EMERGENCY_REQUEST_FILE_NOT_PRIVATE_REGULAR_FILE/u);

    const secret = "should-never-be-printed-private-token";
    const unexpected = spawnSync(process.execPath, [script, "proposal",
      "--request-id", proposal.requestId, ...common, "--api-token", secret], {
      cwd: path.resolve("."), encoding: "utf8",
    });
    assert.equal(unexpected.status, 1);
    assert.equal(unexpected.stderr.includes(secret), false);
  });

test("v3 requires a module-issued stop lease and a separate exact emergency confirmation",
  async (t) => {
    const state = fixture(t);
    privateWrite(path.join(state.profileDirectory,
      OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V2), {
      schema:
        "outsider/first-committed-digital-reality-production-credentials/v2",
      cloudflare: { apiToken: "cloudflare-private-token-v3-000001" },
      githubReleaseAsset: {
        contentsWriteApiToken: "github-private-token-v3-000001",
        administrationReadApiToken: "github-private-token-v3-000001",
        administrationReadCapabilityConfirmed: true,
      },
      uptimeRobot: {
        apiToken: "uptimerobot-private-token-v3-000001",
        expiresAt: "2026-09-04T14:00:00.000Z",
      },
    });
    let driverActive = true;
    let interruptJournalWrite = false;
    const launcher = createFirstCommittedDigitalRealityProductionLauncherV3({
      profileDirectory: state.profileDirectory,
      runtimeDirectory: state.runtimeDirectory,
      clock: () => CLOCK,
      legacyDriverProcessScan: async () => driverActive ? [{
        pid: 45678,
        commandLineHash: `sha256:${"5".repeat(64)}`,
        commandKind: "resume",
        launcherVersion: "v2",
        exactMigrationInvocation: true,
        pausedBeforeUserCode: true,
      }] : [],
      emergencyJournalWriteChunk(descriptor, bytes, offset, length) {
        if (interruptJournalWrite) {
          interruptJournalWrite = false;
          writeSync(descriptor, bytes, offset, Math.min(31, length));
          throw new Error("SIMULATED_V3_PROCESS_DEATH_PARTIAL_APPEND");
        }
        return writeSync(descriptor, bytes, offset, length);
      },
    });
    const proposal = await launcher.requestOutcome(goal("reality_v3_auth_001"));
    const requestKey = createHash("sha256").update(proposal.requestId)
      .digest("hex");
    const privateRequest = JSON.parse(readFileSync(path.join(
      state.runtimeDirectory, "requests", `${requestKey}.request.json`),
    "utf8"));
    privateWrite(path.join(state.runtimeDirectory, "requests",
      `${requestKey}.confirmation.json`), {
      schema: "outsider/outcome-confirmation/v1",
      requestId: proposal.requestId,
      proposalId: proposal.proposalId,
      programHash: proposal.programHash,
      confirmedAt: CLOCK,
    });
    const network = emergencyNetwork();
    const orchestrator = createDurableOutcomeProgramOrchestratorV1({
      directory: path.join(state.runtimeDirectory, "executions"),
      adapters: network.adapters,
      discover: network.discover,
      clock: () => CLOCK,
    });
    const paused = await orchestrator.run(privateRequest.program);
    assert.equal(paused.state, "PAUSED_RETRYABLE");

    await launcher.observeLegacyDriver({
      observationId: "observation_v3_auth_001",
      requestId: proposal.requestId,
      programId: proposal.programId,
      programHash: proposal.programHash,
      driverPid: 45678,
    });
    driverActive = false;
    const lease = await launcher.finalizeStoppedDriver({
      observationId: "observation_v3_auth_001",
      stopAuthorizationEvidenceHash: `sha256:${"6".repeat(64)}`,
    });
    await assert.rejects(async () => launcher.resumeConfirmed(
      proposal.requestId),
      /STOP_HANDOFF_ACTIVE_NORMAL_EXECUTION_FORBIDDEN/u,
    "v3 must not reopen normal execution after stop handoff");
    const emergencyProposal = await launcher.requestEmergencyFailClose({
      ...emergencyRequest(proposal),
      expectedEventCount: lease.journalEventCount,
      expectedJournalHeadHash: lease.journalHeadHash,
      blockedNodeId: paused.retry.subjectId,
      blockedOperationId: paused.retry.operationId,
      blockedObservationOccurrence: paused.retry.observationOccurrence,
      blockedReason: paused.retry.reason,
      stoppedDriverLeaseHash: lease.leaseHash,
    });
    const before = launcher.inspectProgram(proposal.programId).eventCount;
    await assert.rejects(launcher.confirmEmergencyFailClose({
      interventionId: emergencyProposal.interventionId,
      emergencyRequestHash: `sha256:${"7".repeat(64)}`,
      authorizationEvidenceHash: `sha256:${"8".repeat(64)}`,
    }), /EMERGENCY_CONFIRMATION_HASH_MISMATCH/u);
    assert.equal(launcher.inspectProgram(proposal.programId).eventCount,
      before, "wrong emergency confirmation cannot append history");

    const exactEmergencyConfirmation = {
      interventionId: emergencyProposal.interventionId,
      emergencyRequestHash: emergencyProposal.emergencyRequestHash,
      authorizationEvidenceHash: `sha256:${"8".repeat(64)}`,
    };
    interruptJournalWrite = true;
    await assert.rejects(launcher.confirmEmergencyFailClose(
      exactEmergencyConfirmation), /SIMULATED_V3_PROCESS_DEATH_PARTIAL_APPEND/u);
    const closing = await launcher.confirmEmergencyFailClose(
      exactEmergencyConfirmation);
    assert.equal(closing.state, "PAUSED_RETRYABLE");
    assert.equal(closing.telemetry.zeroInternalOpsObserved, false);
    assert.equal(closing.telemetry.outsiderStaffTouchCount, null);
    const events = readdirSync(path.join(state.runtimeDirectory, "executions"))
      .filter((name) => name.endsWith(".events.jsonl"));
    assert.equal(events.length, 1);
    const journal = readFileSync(path.join(state.runtimeDirectory,
      "executions", events[0]), "utf8");
    assert.match(journal, /EMERGENCY_FAIL_CLOSE_REQUESTED_V1/u);
    assert.doesNotMatch(journal, /NODE_WITNESS_COMPLETED/u);
  });
