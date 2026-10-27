import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { startKernelRun } from "../src/outsider-kernel-runner.js";
import { canonicalizeStrict } from "../src/canonical.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";
import {
  censusPaths, findCensusRun, registerCensusIntake, settleCensusRun,
  verifyCensusRegistration, verifyRunCensus,
} from "../src/outsider-run-census.js";
import {
  createStage05ControlledWayBinding, finalizeStage05Evidence,
} from "../src/outsider-stage05-evidence.js";
import { freezeContract } from "../src/outsider-work-contract.js";

const evidence = (letter = "e") => `sha256:${letter.repeat(64)}`;
const hash = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;

function fixture(label = "outsider-kernel-census-") {
  const root = mkdtempSync(path.join(tmpdir(), label));
  const cwd = path.join(root, "workspace");
  const stateRoot = path.join(root, "runs");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 1;\n");
  return { root, cwd, stateRoot };
}

function contract(cwd, ask = "preserve the exact value") {
  return freezeContract({ cwd, ask, acceptance: "node --test" });
}

function finalizableFixture(label = "outsider-kernel-census-sealed-") {
  const { cwd, stateRoot } = fixture(label);
  const baseline = snapshotWorkspace(cwd);
  const frozen = freezeContract({ cwd, ask: "preserve one sealed result",
    acceptance: "node --test",
    semantic: { objective: "preserve value", successCriteria: ["value remains one"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: evidence("f") },
    baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract: frozen,
    workerExecutable: "/private/worker", supervisorCommand: "judge" });
  const store = RunStore.create({ cwd, contract: frozen, supervisorCommand: "judge",
    host: "codex", stateRoot, binding, runId: "sealed-census-run-0001" });
  store.writeJson("baseline.json", baseline);
  store.append("contract_frozen", { baselineFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: true,
    finalFingerprint: baseline.fingerprint });
  store.saveState({ status: "complete", proof: { complete: true,
    deliveryComplete: true, interventionRequired: false, interventionComplete: true } });
  return { cwd, stateRoot, store, frozen };
}

function historicalV2Fixture(label = "outsider-kernel-historical-v2-") {
  const { cwd, stateRoot } = fixture(label);
  const frozen = contract(cwd, "read a pre-census historical run");
  const runId = "historical-v2-run-0001";
  const directory = path.join(stateRoot, runId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const store = new RunStore({ runId, directory, cwd, contract: frozen,
    supervisorCommand: "judge", host: "codex",
    eventSchema: "outsider/kernel-event/v2",
    stateSchema: "outsider/kernel-run/v2" });
  store.writeJson("contract.json", frozen);
  store.saveState({
    schema: "outsider/kernel-run/v2",
    cwd,
    host: "codex",
    contractSeal: frozen.seal,
    bindingHash: null,
    workspaceIdentityHash: null,
    eventSchema: "outsider/kernel-event/v2",
    supervisorCommandHash: hash("judge"),
    status: "starting",
    openIntervention: null,
  });
  return { cwd, stateRoot, store, frozen };
}

test("RunStore binds one pre-action census intake into durable v3 state", () => {
  const { cwd, stateRoot } = fixture();
  const frozen = contract(cwd);
  const runId = "census-bound-run-0001";
  const registration = registerCensusIntake({
    stateRoot, runId, ask: frozen.ask, host: "codex",
  });
  const store = RunStore.create({
    cwd, contract: frozen, supervisorCommand: "judge", host: "codex",
    stateRoot, runId, censusRegistration: registration,
  });
  const state = store.readState();
  assert.equal(state.schema, "outsider/kernel-run/v3");
  assert.equal(state.census.runCommitment, registration.runCommitment);
  assert.notEqual(state.census.registrationHash, registration.registrationHash,
    "the contract-bound registration has its own commitment");
  assert.equal(store.census.registrationHash, state.census.registrationHash);
  assert.equal(verifyCensusRegistration({
    stateRoot, registration: state.census, runId, ask: frozen.ask,
    contractSeal: frozen.seal, host: "codex",
  }).ok, true);
  const census = verifyRunCensus(stateRoot);
  assert.equal(census.ok, true);
  assert.equal(census.startedCount, 1);
  assert.equal(census.contractBoundCount, 1);
  assert.equal(census.openCount, 1);
  assert.doesNotThrow(() => RunStore.open({
    directory: store.directory, supervisorCommand: "judge",
  }));
});

test("a preflight failure remains in the denominator before any RunStore exists", async () => {
  const { cwd, stateRoot, root } = fixture();
  const runId = "preflight-visible-run-0001";
  await assert.rejects(startKernelRun({
    cwd,
    ask: "PRIVATE OPERATOR GOAL MUST NOT ENTER THE CENSUS",
    acceptance: "node --test",
    supervisorCommand: "judge",
    hookEntry: path.join(root, "missing-hook.mjs"),
    stateRoot,
    runId,
    host: "codex",
  }), /HOOK_ENTRY_NOT_FOUND/);
  const census = verifyRunCensus(stateRoot);
  assert.equal(census.ok, true);
  assert.equal(census.startedCount, 1);
  assert.equal(census.contractBoundCount, 0);
  assert.equal(census.openCount, 1);
  assert.match(census.runs[0].runCommitment, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(census), /PRIVATE OPERATOR GOAL/);
});

test("a supplied registration needs an exact run id and cannot be rebound", async () => {
  const { cwd, stateRoot, root } = fixture();
  const ask = "bind the planned attempt once";
  const runId = "supplied-census-run-0001";
  const registration = registerCensusIntake({ stateRoot, runId, ask, host: "codex" });
  await assert.rejects(startKernelRun({
    cwd, ask, acceptance: "node --test", supervisorCommand: "judge",
    hookEntry: path.join(root, "missing-hook.mjs"), stateRoot, host: "codex",
    censusRegistration: registration,
  }), /CENSUS_PREREGISTRATION_REQUIRES_RUN_ID/);
  await assert.rejects(startKernelRun({
    cwd, ask, acceptance: "node --test", supervisorCommand: "judge",
    hookEntry: path.join(root, "missing-hook.mjs"), stateRoot, host: "codex",
    runId: "different-run-0000001", censusRegistration: registration,
  }), /CENSUS_PREREGISTRATION_BROKEN/);
  const census = verifyRunCensus(stateRoot);
  assert.equal(census.ok, true);
  assert.equal(census.startedCount, 1);
  assert.equal(census.runs[0].runCommitment, registration.runCommitment);
});

test("RunStore recovery rejects a census registration relabel", () => {
  const { cwd, stateRoot } = fixture();
  const frozen = contract(cwd, "recover the same census-bound run");
  const store = RunStore.create({
    cwd, contract: frozen, supervisorCommand: "judge", host: "codex",
    stateRoot, runId: "tamper-census-run-0001",
  });
  const statePath = path.join(store.directory, "run.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.census.hostClass = "claude-code";
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  assert.throws(() => RunStore.open({
    directory: store.directory, supervisorCommand: "judge",
  }), /RUN_STORE_CENSUS_BROKEN/);
});

test("findCensusRun is read-only and distinguishes missing, matching, and broken ledgers", () => {
  const missing = fixture("outsider-kernel-census-lookup-missing-");
  assert.deepEqual(findCensusRun({ stateRoot: missing.stateRoot,
    runId: "lookup-census-run-0001", ask: "find this exact run", host: "codex" }),
  { ok: true, found: false, run: null });
  assert.equal(existsSync(censusPaths(missing.stateRoot).root), false,
    "a lookup must never initialize the census");

  const matched = fixture("outsider-kernel-census-lookup-match-");
  const frozen = contract(matched.cwd, "find this exact run");
  const store = RunStore.create({ cwd: matched.cwd, contract: frozen,
    supervisorCommand: "judge", host: "codex", stateRoot: matched.stateRoot,
    runId: "lookup-census-run-0001" });
  const found = findCensusRun({ stateRoot: matched.stateRoot, runId: store.runId,
    ask: frozen.ask, host: "codex" });
  assert.equal(found.ok, true);
  assert.equal(found.found, true);
  assert.equal(found.run.runCommitment, store.census.runCommitment);
  assert.equal(found.run.terminal, null);

  const firstEntry = readFileSync(censusPaths(matched.stateRoot).head, "utf8");
  writeFileSync(censusPaths(matched.stateRoot).head,
    firstEntry.replace('"startedCount": 1', '"startedCount": 2'));
  const broken = findCensusRun({ stateRoot: matched.stateRoot, runId: store.runId,
    ask: frozen.ask, host: "codex" });
  assert.equal(broken.ok, false);
  assert.match(broken.error, /HEAD_BROKEN|HEAD_MISMATCH/);
});

test("saveState cannot rewrite the v3 schema or census registration", () => {
  const { cwd, stateRoot } = fixture("outsider-kernel-census-state-lock-");
  const frozen = contract(cwd);
  const store = RunStore.create({ cwd, contract: frozen, supervisorCommand: "judge",
    host: "codex", stateRoot, runId: "state-lock-run-0001" });
  const before = store.readState();
  assert.throws(() => store.saveState({ schema: "outsider/kernel-run/v2" }),
    /STATE_SCHEMA_IMMUTABLE/);
  assert.throws(() => store.saveState({ census: null }), /STATE_CENSUS_IMMUTABLE/);
  assert.throws(() => store.saveState({ census: { ...before.census,
    runOrdinal: before.census.runOrdinal + 1 } }), /STATE_CENSUS_IMMUTABLE/);
  assert.doesNotThrow(() => store.saveState({ schema: before.schema,
    census: before.census, status: "running" }));
  const after = store.readState();
  assert.equal(after.schema, "outsider/kernel-run/v3");
  assert.deepEqual(after.census, before.census);
});

test("open accepts only v2/v3 and detects a v3-to-v2 census downgrade", () => {
  const unsupported = fixture("outsider-kernel-census-schema-");
  const frozenUnsupported = contract(unsupported.cwd);
  const unsupportedStore = RunStore.create({ cwd: unsupported.cwd,
    contract: frozenUnsupported, supervisorCommand: "judge", host: "codex",
    stateRoot: unsupported.stateRoot, runId: "unsupported-run-0001" });
  const unsupportedState = unsupportedStore.readState();
  unsupportedState.schema = "outsider/kernel-run/v4";
  writeFileSync(unsupportedStore.statePath, JSON.stringify(unsupportedState, null, 2));
  assert.throws(() => RunStore.open({ directory: unsupportedStore.directory,
    supervisorCommand: "judge" }), /RUN_STORE_SCHEMA_UNSUPPORTED/);

  const downgraded = fixture("outsider-kernel-census-downgrade-");
  const frozenDowngraded = contract(downgraded.cwd);
  const downgradedStore = RunStore.create({ cwd: downgraded.cwd,
    contract: frozenDowngraded, supervisorCommand: "judge", host: "codex",
    stateRoot: downgraded.stateRoot, runId: "downgraded-run-0001" });
  const downgradedState = downgradedStore.readState();
  downgradedState.schema = "outsider/kernel-run/v2";
  delete downgradedState.census;
  writeFileSync(downgradedStore.statePath, JSON.stringify(downgradedState, null, 2));
  assert.throws(() => RunStore.open({ directory: downgradedStore.directory,
    supervisorCommand: "judge" }), /RUN_STORE_V2_CENSUS_DOWNGRADE_DETECTED/);
});

test("a genuine v2 run with no matching census remains readable and keeps v2 on save", () => {
  const { stateRoot, store } = historicalV2Fixture();
  assert.equal(existsSync(censusPaths(stateRoot).root), false,
    "the historical fixture must never create and then erase a census");
  const legacy = RunStore.open({ directory: store.directory, supervisorCommand: "judge" });
  assert.equal(legacy.readState().schema, "outsider/kernel-run/v2");
  legacy.saveState({ status: "legacy-readable" });
  assert.equal(legacy.readState().schema, "outsider/kernel-run/v2");
  assert.equal(Object.hasOwn(legacy.readState(), "census"), false);
  assert.equal(existsSync(censusPaths(stateRoot).root), false,
    "opening and saving a genuine v2 run must remain census-read-only");
});

test("an unsealed v3 run cannot resume after its census is terminal", () => {
  const { cwd, stateRoot } = fixture("outsider-kernel-census-terminal-unsealed-");
  const frozen = contract(cwd);
  const store = RunStore.create({ cwd, contract: frozen, supervisorCommand: "judge",
    host: "codex", stateRoot, runId: "terminal-unsealed-run-0001" });
  settleCensusRun({ stateRoot, registration: store.census, terminalStatus: "BLOCKED",
    evidenceCommitment: evidence("b"), reasonCode: "TEST_TERMINAL_WITHOUT_SEAL",
    terminalFacts: { terminalClass: "CONSERVATIVE_STOP", proofComplete: false,
      deliveryComplete: false } });
  assert.throws(() => RunStore.open({ directory: store.directory,
    supervisorCommand: "judge" }), /RUN_STORE_UNSEALED_CENSUS_ALREADY_TERMINAL/);
});

test("a correctly sealed v3 opens read-only only when census and manifest match", () => {
  const fixtureValue = finalizableFixture();
  const finalized = finalizeStage05Evidence({ directory: fixtureValue.store.directory });
  const manifestPath = path.join(fixtureValue.store.directory,
    "stage05-evidence-manifest.json");
  const originalManifestBytes = readFileSync(manifestPath);
  const sealed = RunStore.open({ directory: fixtureValue.store.directory,
    supervisorCommand: "judge" });
  assert.equal(sealed.readOnly, true);
  assert.throws(() => sealed.append("after_seal"), /RUN_EVIDENCE_ALREADY_SEALED/);
  assert.throws(() => sealed.saveState({ status: "rewritten" }),
    /RUN_EVIDENCE_ALREADY_SEALED/);
  assert.throws(() => sealed.writeJson("after-seal.json", { forbidden: true }),
    /RUN_EVIDENCE_ALREADY_SEALED/);

  unlinkSync(manifestPath);
  assert.throws(() => sealed.saveState({ status: "manifest-deletion-must-not-unseal" }),
    /RUN_EVIDENCE_ALREADY_SEALED/);
  writeFileSync(manifestPath, originalManifestBytes);

  const terminalTamper = JSON.parse(originalManifestBytes.toString("utf8"));
  terminalTamper.terminal.workerStarted = !terminalTamper.terminal.workerStarted;
  const { manifestHash: terminalHashIgnored, ...terminalBody } = terminalTamper;
  terminalTamper.manifestHash = hash(terminalBody);
  writeFileSync(manifestPath, JSON.stringify(terminalTamper, null, 2));
  assert.throws(() => RunStore.open({ directory: fixtureValue.store.directory,
    supervisorCommand: "judge" }), /RUN_STORE_SEALED_MANIFEST_TERMINAL_MISMATCH/);
  writeFileSync(manifestPath, originalManifestBytes);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.product = { ...manifest.product, packageVersion: "forged-after-settlement" };
  const { manifestHash: ignored, ...body } = manifest;
  manifest.manifestHash = hash(body);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.notEqual(manifest.manifestHash, finalized.manifest.manifestHash);
  assert.throws(() => RunStore.open({ directory: fixtureValue.store.directory,
    supervisorCommand: "judge" }), /RUN_STORE_SEALED_CENSUS_TERMINAL_MANIFEST_MISMATCH/);
});
