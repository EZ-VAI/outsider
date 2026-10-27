import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import {
  createPrimaryRecoveryWitnessCompositionV1,
  createProductionAdapterFederationV1,
  createProductionOutcomeRunnerV1,
  publicOutcomeRunViewV1,
} from "../src/outsider-production-outcome-runner-v1.js";

const ARTIFACT_HASH = `sha256:${"7".repeat(64)}`;
const TOKEN_SENTINEL = "must-never-enter-journal-or-terminal";
const CLOCK = "2026-09-03T12:00:00.000Z";
const MEASURED_ZERO_INTERNAL_OPS = async () => ({
  outsiderStaffTouchCount: 0,
  humanQueueCreated: false,
  source: "TEST_EXPLICIT_OPERATIONS_COUNTER",
});

function program(orderId = "production_order_001") {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: `program_${orderId}`,
    orderId,
    createdAt: CLOCK,
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
    statement: "Deliver one exact public result with reserved recovery.",
    observationWindowMs: 60_000,
  });
}

function fakeNetwork() {
  const calls = [];
  const credentialClosures = {
    primary: TOKEN_SENTINEL,
    recovery: TOKEN_SENTINEL,
    witness: TOKEN_SENTINEL,
  };
  function lifecycle(adapterId) {
    return {
      async reserve({ requirement, dependencyReservations }) {
        calls.push(["reserve", adapterId, requirement.requirementId,
          Object.keys(dependencyReservations)]);
        // Touch closure to make the non-persistence assertion meaningful.
        assert.equal(credentialClosures[adapterId.split(".")[0]],
          TOKEN_SENTINEL);
        return {
          status: "RESERVED",
          reservationId: `reservation:${adapterId}`,
          validUntil: "2026-09-03T13:00:00.000Z",
          providerReceipt: { accepted: true },
          adapterState: { publicRoute: `route:${adapterId}` },
        };
      },
      async release() {
        calls.push(["release", adapterId]);
        return { status: "RELEASED", receipt: "released" };
      },
      async closeObligation() {
        calls.push(["close", adapterId]);
        return { status: "CLOSED", receipt: "closed" };
      },
    };
  }
  const primary = {
    adapterId: "primary.cloudflare",
    providerRef: "cloudflare-workers",
    ...lifecycle("primary.cloudflare"),
    supports(requirement) {
      calls.push(["supports", this.adapterId, requirement.requirementId]);
      return requirement.capability === "PUBLIC_HTTPS_ARTIFACT_PUBLICATION";
    },
    async execute() {
      calls.push(["execute", this.adapterId]);
      return { status: "FAILED", reason: "INJECTED_PROVIDER_FAILURE" };
    },
  };
  const recovery = {
    adapterId: "recovery.github-pages",
    providerRef: "github-pages",
    ...lifecycle("recovery.github-pages"),
    supports(requirement) {
      calls.push(["supports", this.adapterId, requirement.requirementId]);
      return requirement.capability === "PUBLIC_HTTPS_ARTIFACT_PUBLICATION";
    },
    async execute({ primaryFailure }) {
      calls.push(["execute", this.adapterId]);
      assert.equal(primaryFailure.status, "FAILED");
      return { status: "SUCCEEDED", routeUrl: "https://recovery.invalid/" };
    },
  };
  const witness = {
    adapterId: "witness.route-aware",
    providerRef: "independent-route-witness",
    ...lifecycle("witness.route-aware"),
    supports(requirement) {
      calls.push(["supports", this.adapterId, requirement.requirementId]);
      return requirement.capability
        === "PUBLIC_HTTPS_LONGITUDINAL_EXACT_RESPONSE_OBSERVATION";
    },
    async observe({ effectiveRoute }) {
      calls.push(["observe", this.adapterId, effectiveRoute]);
      return { status: "SATISFIED", observationId: "public-observation" };
    },
  };
  return { calls, primary, recovery, witness };
}

function temporaryDirectory(t, prefix) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("candidate federation scans each order and picks deterministically", async () => {
  const seen = [];
  function candidate(adapterId, supported, priority) {
    return {
      adapter: {
        adapterId,
        reserve() {}, release() {}, closeObligation() {}, execute() {},
        supports(requirement) {
          seen.push([adapterId, requirement.requirementId]);
          return supported;
        },
      },
      roles: ["PRIMARY"],
      priority,
    };
  }
  const federation = createProductionAdapterFederationV1({ adapters: [
    candidate("provider.z", true, 5),
    candidate("provider.a", true, 5),
    candidate("provider.unavailable", false, 0),
  ] });
  const selected = await federation.discover({ requirement: {
    requirementId: "primary_one", role: "PRIMARY", capability: "ANY",
  } });
  assert.equal(selected.adapterId, "provider.a");
  assert.deepEqual(seen, [
    ["provider.unavailable", "primary_one"],
    ["provider.a", "primary_one"],
    ["provider.z", "primary_one"],
  ]);
});

test("primary and recovery cannot masquerade as separate adapters in one failure domain",
  () => {
    const network = fakeNetwork();
    const recovery = {
      ...network.recovery,
      providerRef: network.primary.providerRef,
    };
    assert.throws(() => createPrimaryRecoveryWitnessCompositionV1({
      primaryAdapter: network.primary,
      recoveryAdapter: recovery,
      witnessAdapter: network.witness,
    }), /PROVIDER_FAILURE_DOMAINS_NOT_DISTINCT/u);
  });

test("frozen proposal requires exact confirmation then forms and closes a recovery network",
  async (t) => {
    const directory = temporaryDirectory(t, "outsider-production-runner-");
    const network = fakeNetwork();
    const composition = createPrimaryRecoveryWitnessCompositionV1({
      primaryAdapter: network.primary,
      recoveryAdapter: network.recovery,
      witnessAdapter: network.witness,
    });
    const runner = createProductionOutcomeRunnerV1({
      directory,
      composition,
      clock: () => CLOCK,
      measureOperations: MEASURED_ZERO_INTERNAL_OPS,
    });
    const frozen = program();
    const proposal = await runner.proposeProgram(frozen);
    assert.equal(proposal.programHash, frozen.programHash);
    assert.equal(proposal.nextAction, "CONFIRM_ONCE");
    assert.equal(network.calls.length, 0, "proposal must have no effects");

    await assert.rejects(runner.confirmOutcome({
      requestId: frozen.orderId,
      programHash: `sha256:${"8".repeat(64)}`,
    }), /CONFIRMATION_PROGRAM_MISMATCH/);
    const projection = await runner.confirmOutcome({
      requestId: frozen.orderId,
      programHash: frozen.programHash,
    });
    assert.equal(projection.state, "SUCCEEDED");
    assert.equal(projection.committed, true);
    assert.equal(projection.humanQueueCreated, false);
    assert.equal(projection.nodes.publish_result.primary.status, "FAILED");
    assert.equal(projection.nodes.publish_result.recovery.status, "SUCCEEDED");
    assert.equal(projection.nodes.publish_result.witness.status, "SATISFIED");
    const witnessReservation = network.calls.find((call) =>
      call[0] === "reserve" && call[1] === "witness.route-aware");
    assert.deepEqual(witnessReservation[3], [
      "primary_publication", "recovery_publication",
    ]);
    assert.equal(network.calls.some((call) => call[0] === "observe"
      && call[2] === "RECOVERY"), true);

    const publicView = publicOutcomeRunViewV1(projection);
    assert.equal(publicView.nodes.publish_result.recovery, "SUCCEEDED");
    assert.equal(JSON.stringify(publicView).includes("adapterState"), false);
    assert.equal(JSON.stringify(publicView).includes(TOKEN_SENTINEL), false);
    const stored = readdirSync(directory, { recursive: true })
      .filter((name) => typeof name === "string" && name.endsWith(".jsonl"))
      .map((name) => readFileSync(path.join(directory, name), "utf8"))
      .join("\n");
    assert.equal(stored.includes(TOKEN_SENTINEL), false);

    const restarted = createProductionOutcomeRunnerV1({
      directory, composition, clock: () => CLOCK,
      measureOperations: MEASURED_ZERO_INTERNAL_OPS,
    });
    const replay = await restarted.resumeConfirmed(frozen.orderId);
    assert.equal(replay.journalHeadHash, projection.journalHeadHash);
    assert.equal(replay.state, "SUCCEEDED");
  });

test("goal compiler is injected and remains independent of one milestone domain",
  async (t) => {
    const directory = temporaryDirectory(t, "outsider-goal-runner-");
    const network = fakeNetwork();
    const seenGoals = [];
    const primary = { ...network.primary, roles: ["PRIMARY"] };
    const recovery = { ...network.recovery, roles: ["RECOVERY"] };
    const witness = { ...network.witness, roles: ["INDEPENDENT_WITNESS"] };
    const runner = createProductionOutcomeRunnerV1({
      directory,
      // No custom discover function: the runner scans the injected candidates
      // for every requirement and records the selected per-order bindings.
      composition: { adapters: {
        [primary.adapterId]: primary,
        [recovery.adapterId]: recovery,
        [witness.adapterId]: witness,
      } },
      clock: () => CLOCK,
      measureOperations: MEASURED_ZERO_INTERNAL_OPS,
      compileGoal(request) {
        seenGoals.push(request.goal);
        return createFirstCommittedDigitalRealityProgramV1({
          programId: `program_${request.requestId}`,
          orderId: request.requestId,
          createdAt: request.requestedAt,
          formationDeadline: "2026-09-03T12:10:00.000Z",
          completionDeadline: request.completionDeadline,
          cleanupDeadline: "2026-09-03T12:40:00.000Z",
          artifactHash: ARTIFACT_HASH,
          statement: request.goal,
          currency: request.budget.currency,
          maximumAmountMinor: request.budget.maximumAmountMinor,
          observationWindowMs: 60_000,
        });
      },
    });
    const proposal = await runner.requestOutcome({
      requestId: "arbitrary_outcome_001",
      goal: "A compiler-selected outcome; the runtime does not know its domain.",
      completionDeadline: "2026-09-03T12:30:00.000Z",
      budget: { currency: "USD", maximumAmountMinor: "0" },
    });
    assert.deepEqual(seenGoals,
      ["A compiler-selected outcome; the runtime does not know its domain."]);
    const result = await runner.confirmOutcome({
      requestId: "arbitrary_outcome_001",
      programHash: proposal.programHash,
    });
    assert.equal(result.state, "SUCCEEDED");
  });

test("CLI imports a frozen proposal without any provider or secret flags", (t) => {
  const directory = temporaryDirectory(t, "outsider-production-cli-");
  const programFile = path.join(directory, "program.json");
  const now = Date.now();
  const cliProgram = createFirstCommittedDigitalRealityProgramV1({
    programId: "program_cli_order_001",
    orderId: "cli_order_001",
    createdAt: new Date(now).toISOString(),
    formationDeadline: new Date(now + 600_000).toISOString(),
    completionDeadline: new Date(now + 1_800_000).toISOString(),
    cleanupDeadline: new Date(now + 2_400_000).toISOString(),
    artifactHash: ARTIFACT_HASH,
    statement: "Import one frozen CLI outcome without executing it.",
    observationWindowMs: 60_000,
  });
  writeFileSync(programFile, `${JSON.stringify(cliProgram)}\n`,
    { mode: 0o600 });
  const script = path.resolve("scripts/outsider-production-outcome-v1.mjs");
  const proposed = spawnSync(process.execPath, [script, "propose",
    "--program", programFile, "--runtime-dir", directory], {
    cwd: path.resolve("."), encoding: "utf8",
  });
  assert.equal(proposed.status, 0, proposed.stderr);
  const output = JSON.parse(proposed.stdout);
  assert.equal(output.programHash, cliProgram.programHash);
  assert.equal(proposed.stdout.includes(TOKEN_SENTINEL), false);

  const recalled = spawnSync(process.execPath, [script, "proposal",
    "--request-id", "cli_order_001", "--runtime-dir", directory], {
    cwd: path.resolve("."), encoding: "utf8",
  });
  assert.equal(recalled.status, 0, recalled.stderr);
  assert.equal(JSON.parse(recalled.stdout).programHash, output.programHash);

  const rejected = spawnSync(process.execPath, [script, "proposal",
    "--request-id", "cli_order_001", "--runtime-dir", directory,
    "--api-token", TOKEN_SENTINEL], { cwd: path.resolve("."),
    encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stderr.includes(TOKEN_SENTINEL), false);
  for (const name of readdirSync(path.join(directory, "requests"))) {
    assert.equal(statSync(path.join(directory, "requests", name)).mode & 0o777,
      0o600);
  }
});
