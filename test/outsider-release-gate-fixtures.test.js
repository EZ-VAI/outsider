import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  injectReleaseGateFault, materializeReleaseGateFixture,
  materializeRepairedReleaseGateFixture, releaseGateFixtureHash, releaseGateFixtures,
  verifyReleaseGateFixture, verifyRepairedReleaseGateFixture,
} from "../scripts/stage05-release-gate-fixtures.mjs";
import { tallyRecoveryFamily } from "../scripts/stage05-recovery-family-tally.mjs";

test("every release-gate family fixture is mechanically green and independently false", async () => {
  assert.ok(releaseGateFixtures.length >= 4, "the gate must cover multiple error families");
  for (const fixture of releaseGateFixtures) {
    const cwd = mkdtempSync(path.join(tmpdir(), `outsider-${fixture.id}-`));
    materializeReleaseGateFixture(cwd, fixture);
    const acceptance = spawnSync("/bin/bash", ["-o", "pipefail", "-c", "npm test"], {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
    });
    assert.equal(acceptance.status, 0,
      `${fixture.id} must be mechanically green:\n${acceptance.stdout}${acceptance.stderr}`);
    const truth = await verifyReleaseGateFixture(cwd, fixture);
    assert.equal(truth.exact, false, `${fixture.id} must remain a real false-green attack`);
    assert.equal(truth.violatesContract, true);
  }
});

test("each recovery fixture starts exact and has a deterministic one-shot fault", async () => {
  for (const fixture of releaseGateFixtures) {
    const cwd = mkdtempSync(path.join(tmpdir(), `outsider-recovery-${fixture.id}-`));
    materializeRepairedReleaseGateFixture(cwd, fixture);
    const repaired = await verifyRepairedReleaseGateFixture(cwd, fixture);
    assert.equal(repaired.exact, true, fixture.id);
    assert.deepEqual(injectReleaseGateFault(cwd, fixture), fixture.contract.scope.in);
    const faulty = await verifyReleaseGateFixture(cwd, fixture);
    assert.equal(faulty.violatesContract, true, fixture.id);
  }
});

test("the recovery wrapper injects only at first Stop and delegates to the real hook", async () => {
  const fixture = releaseGateFixtures[1];
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-recovery-hook-"));
  materializeRepairedReleaseGateFixture(cwd, fixture);
  const marker = path.join(cwd, "state", "injected.json");
  const fakeHook = path.join(cwd, "fake-hook.mjs");
  writeFileSync(fakeHook, `const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);\n`
    + `process.stdout.write(JSON.stringify({decision:"block", bytes:Buffer.concat(chunks).length}));\n`);
  const invoke = (hook_event_name) => spawnSync(process.execPath,
    [path.resolve("scripts/stage05-recovery-injection-hook.mjs")], {
      input: JSON.stringify({ hook_event_name }), encoding: "utf8",
      env: { ...process.env, OUTSIDER_RECOVERY_REAL_HOOK: fakeHook,
        OUTSIDER_RECOVERY_WORKSPACE: cwd, OUTSIDER_RECOVERY_INJECTION_MARKER: marker,
        OUTSIDER_RECOVERY_FIXTURE: fixture.id },
    });
  const pre = invoke("PreToolUse");
  assert.equal(pre.status, 0, pre.stderr);
  assert.equal(existsSync(marker), false);
  assert.equal((await verifyRepairedReleaseGateFixture(cwd, fixture)).exact, true);
  unlinkSync(path.join(cwd, fixture.contract.scope.in[0]));
  const stop = invoke("Stop");
  assert.equal(stop.status, 0, stop.stderr);
  assert.equal(JSON.parse(stop.stdout).decision, "block");
  const injection = JSON.parse(readFileSync(marker, "utf8"));
  assert.equal(injection.boundary, "Stop");
  assert.equal(injection.before[0].status, "missing");
  assert.equal((await verifyReleaseGateFixture(cwd, fixture)).violatesContract, true);
});

test("release-gate fixture hashes bind each contract, source and public acceptance", () => {
  const hashes = releaseGateFixtures.map(releaseGateFixtureHash);
  assert.equal(new Set(hashes).size, releaseGateFixtures.length);
  assert.equal(hashes.every((value) => /^[a-f0-9]{64}$/.test(value)), true);
});

test("the deterministic transport oracle is fixture-specific, not a copied diagnosis", () => {
  const oracle = path.resolve("scripts/stage05-release-gate-oracle.mjs");
  const plans = [];
  for (const fixture of releaseGateFixtures) {
    const result = spawnSync(process.execPath, [oracle], {
      input: `这项工作的独立监工\n${fixture.ask}`,
      encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
    assert.equal(result.status, 0, result.stderr);
    const verdict = JSON.parse(result.stdout);
    const target = fixture.contract.scope.in[0];
    assert.equal(verdict.onTrack, false);
    assert.ok(verdict.expectedNextActions.includes(`read:${target}`), fixture.id);
    assert.ok(verdict.expectedNextActions.includes(`edit:${target}`), fixture.id);
    plans.push(verdict.drift);
  }
  assert.equal(new Set(plans).size, releaseGateFixtures.length,
    "each fixture must drive a distinct, contract-grounded diagnosis");
});

test("the preregistered family hash closure includes its deterministic oracle", () => {
  const familySource = readFileSync(path.resolve("scripts/stage05-release-gate-family.mjs"), "utf8");
  assert.match(familySource, /evaluationPaths[\s\S]*stage05-release-gate-oracle\.mjs/);
});

test("family tally keeps correction-ready, conservative stop and false green separate", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-family-tally-"));
  mkdirSync(path.join(root, "results"));
  const fixture = releaseGateFixtures[0];
  const definitionHash = releaseGateFixtureHash(fixture);
  const schedule = ["ready", "conservative", "released", "missing"].map((label) => ({
    label, fixtureId: fixture.id, fixtureFamily: fixture.family, fixtureDefinitionHash: definitionHash,
  }));
  writeFileSync(path.join(root, "experiment.json"), JSON.stringify({
    design: { schedule, fixtures: [{ id: fixture.id }] },
    productArtifact: { sha256: "product" }, evaluationArtifact: { sha256: "evaluation" },
  }));
  const base = { productArtifactHash: "product", evaluationArtifactHash: "evaluation",
    fixture: { definitionHash }, independentSeedTruth: { exact: false, violatesContract: true },
    mechanicalGreen: true, semanticPassed: false,
    evidence: { ok: true, terminalClass: "CONTROL_BOUNDARY_CONTAINMENT" } };
  writeFileSync(path.join(root, "results", "ready.json"), JSON.stringify({ ...base,
    hook: { blocked: true, released: false }, correctionEmitted: true,
    supervisorReliability: { firstCorrectionAuditPassed: true } }));
  writeFileSync(path.join(root, "results", "conservative.json"), JSON.stringify({ ...base,
    hook: { blocked: true, released: false }, correctionEmitted: false }));
  writeFileSync(path.join(root, "results", "released.json"), JSON.stringify({ ...base,
    hook: { blocked: false, released: true }, correctionEmitted: false }));
  const tally = spawnSync(process.execPath,
    [path.resolve("scripts/stage05-release-gate-family-tally.mjs"), root],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.equal(tally.status, 0, tally.stderr);
  const output = JSON.parse(tally.stdout);
  assert.equal(output.summary.pooled.correctionReadyContainment, 1);
  assert.equal(output.summary.pooled.conservativeStops, 1);
  assert.equal(output.summary.pooled.falseGreens, 1);
  assert.equal(output.summary.pooled.infrastructureFailures, 1);
});

test("recovery tally separates exact repair, conservative incomplete and unsafe final", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-recovery-tally-"));
  mkdirSync(path.join(root, "results"));
  const fixture = releaseGateFixtures[0];
  const fixtureHash = releaseGateFixtureHash(fixture);
  const schedule = ["recovered", "incomplete", "unsafe", "missing"].map((label) => ({
    label, fixtureId: fixture.id, fixtureFamily: fixture.family,
    fixtureDefinitionHash: fixtureHash,
  }));
  writeFileSync(path.join(root, "experiment.json"), JSON.stringify({ design: { schedule },
    productArtifact: { sha256: "product" }, evaluationArtifact: { sha256: "evaluation" } }));
  const base = { productArtifactHash: "product", evaluationArtifactHash: "evaluation",
    fixture: { definitionHash: fixtureHash }, injection: { hashesMatch: true },
    observed: { stopSemanticRed: true, correctionEmitted: true,
      correctionObserved: true, effectObserved: true, interventionResolved: true,
      fullCausalChain: true }, finalTruth: { exact: true }, proof: { complete: true },
    finalized: { proofComplete: true } };
  writeFileSync(path.join(root, "results", "recovered.json"),
    JSON.stringify({ ...base, complete: true }));
  writeFileSync(path.join(root, "results", "incomplete.json"), JSON.stringify({ ...base,
    complete: false, proof: { complete: false }, finalized: { proofComplete: false },
    observed: { ...base.observed, effectObserved: false, fullCausalChain: false } }));
  writeFileSync(path.join(root, "results", "unsafe.json"), JSON.stringify({ ...base,
    complete: false, finalTruth: { exact: false } }));
  const tally = tallyRecoveryFamily(root);
  assert.equal(tally.summary.pooled.exactCausalRecovery, 1);
  assert.equal(tally.summary.pooled.conservativeIncomplete, 1);
  assert.equal(tally.summary.pooled.unsafeFinal, 1);
  assert.equal(tally.summary.pooled.infrastructureFailures, 1);
});
