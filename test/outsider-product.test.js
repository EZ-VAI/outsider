import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  inspectProductRun, listProductRuns, productVersion, projectProductDoctorForSharing,
  runProductDoctor,
} from "../src/outsider-product.js";

test("product doctor proves persistent storage and host capabilities without a model call", () => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-product-doctor-"));
  const home = mkdtempSync(path.join(tmpdir(), "outsider-product-home-"));
  let preflightCalls = 0;
  const report = runProductDoctor({
    workerExecutable: "/fake/claude",
    stateRoot,
    attachedRoot: path.join(home, ".outsider", "attached"),
    home,
    codexHome: path.join(home, ".codex"),
    workerPreflight: (worker) => {
      preflightCalls += 1;
      assert.equal(worker, "/fake/claude");
      return { ok: true, detail: "protocol and auth available" };
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.stateRoot, stateRoot);
  assert.equal(report.existingRuns, 0);
  assert.equal(preflightCalls, 1);
  assert.match(report.supervisorDefault, /none; explicit command/);
  assert.match(report.surfaces.desktopCowork.supervisorMode,
    /^(?:local-only-no-external|explicit-external-consented)$/);
  assert.equal(report.surfaces.codex.hookTrustStatus,
    "UNKNOWN_REQUIRES_CODEX_HOOKS_REVIEW");
  assert.deepEqual(report.surfaces.codex.requiredEvents,
    ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest",
      "PostToolUse", "PreCompact", "PostCompact", "SubagentStart", "SubagentStop", "Stop"]);
  assert.deepEqual(report.surfaces.codex.advisoryEvents, ["SessionEnd"]);
  assert.equal(report.surfaces.codex.advisoryHooksConfigured, false);
  assert.equal(report.surfaces.codex.controlledRunSeen, false);
  assert.equal(report.surfaces.chatgpt.universalPluginPackagePresent, true);
  assert.equal(report.surfaces.chatgpt.livePluginInstallSeen, false);
  assert.equal(report.surfaces.chatgpt.globalLifecycleInterceptionEstablished, false);
  assert.equal(report.readiness.anyControlledSurfaceEstablished, false);
});

test("product doctor separates Codex install, trust, runtime and controlled states", () => {
  const home = mkdtempSync(path.join(tmpdir(), "outsider-product-codex-home-"));
  const codexHome = path.join(home, ".codex");
  const attachedRoot = path.join(home, ".outsider", "attached");
  const stateRoot = path.join(home, ".outsider", "runs");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(path.join(codexHome, "config.toml"), [
    "[marketplaces.outsider]", 'source_type = "local"',
    "", '[plugins.\"outsider-stage05@outsider\"]', "enabled = true", "",
  ].join("\n"));
  const events = ["SessionStart", "UserPromptSubmit", "PreToolUse",
    "PermissionRequest", "PostToolUse", "PreCompact", "PostCompact", "SubagentStart",
    "SubagentStop", "Stop"];
  writeFileSync(path.join(codexHome, "hooks.json"), JSON.stringify({ hooks:
    Object.fromEntries(events.map((event) => [event, [{ hooks: [{ type: "command",
      command: "'/usr/local/bin/node' '/opt/outsider/bin/outsider-hook.mjs' hook codex --attached-control" }] }]])) }));
  const cache = path.join(codexHome, "plugins", "cache", "outsider",
    "outsider-stage05", productVersion(), ".codex-plugin");
  mkdirSync(cache, { recursive: true });
  writeFileSync(path.join(cache, "plugin.json"), JSON.stringify({
    name: "outsider-stage05", version: productVersion(),
  }));
  const session = path.join(attachedRoot, "sessions", "codex-session");
  mkdirSync(session, { recursive: true });
  writeFileSync(path.join(session, "session.json"), JSON.stringify({
    host: "codex", updatedAt: "2026-08-22T04:00:00.000Z", completedRuns: [{
      proofComplete: true, deliveryComplete: true,
      runDirectory: path.join(home, "unverified-codex-run"),
    }],
  }));
  const report = runProductDoctor({ stateRoot, attachedRoot, home, codexHome,
    workerExecutable: "/fake/claude", workerPreflight: () => ({ ok: true }) });
  assert.equal(report.surfaces.codex.repoMarketplaceConfigured, true);
  assert.equal(report.surfaces.codex.pluginConfigured, true);
  assert.equal(report.surfaces.codex.pluginCached, true);
  assert.equal(report.surfaces.codex.hooksConfigured, true);
  assert.equal(report.surfaces.codex.advisoryHooksConfigured, false,
    "SessionEnd is reported separately instead of making the ten-core inventory red");
  assert.deepEqual(report.surfaces.codex.installedAdvisoryEvents, []);
  assert.equal(report.surfaces.codex.runtimeConformanceSeen, true);
  assert.equal(report.surfaces.codex.ledgerCompletionCandidateSeen, true);
  assert.equal(report.surfaces.codex.consequentialClosedLoopRunSeen, false,
    "an unverified ledger completion cannot become source-bound run evidence");
  assert.equal(report.surfaces.codex.consequentialControlEvidenceVerification,
    "NOT_ESTABLISHED");
  assert.equal(report.surfaces.codex.controlledRunSeen, false);
  assert.equal(report.surfaces.codex.controlAssessmentVerification,
    "NOT_EVALUATED_USE_SOURCE_BOUND_CODEX_CONTROL_PROBE");
  assert.equal(report.surfaces.codex.pluginVersionMatchesRuntime, true);
  assert.equal(report.surfaces.codex.hookTrustStatus,
    "UNKNOWN_REQUIRES_CODEX_HOOKS_REVIEW");
  assert.equal(report.surfaces.codex.hostedAndSpecializedToolCoverageEstablished, false);
});

test("product doctor selects cached plugins by semver and rejects runtime version skew", () => {
  const home = mkdtempSync(path.join(tmpdir(), "outsider-product-codex-skew-"));
  const codexHome = path.join(home, ".codex");
  const stateRoot = path.join(home, ".outsider", "runs");
  const attachedRoot = path.join(home, ".outsider", "attached");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(path.join(codexHome, "config.toml"), [
    "[marketplaces.outsider]", 'source_type = "local"',
    "", '[plugins.\"outsider-stage05@outsider\"]', "enabled = true", "",
  ].join("\n"));
  const events = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse",
    "PermissionRequest", "PostToolUse", "PreCompact", "PostCompact", "SubagentStart",
    "SubagentStop", "Stop"];
  writeFileSync(path.join(codexHome, "hooks.json"), JSON.stringify({ hooks:
    Object.fromEntries(events.map((event) => [event, [{ hooks: [{ type: "command",
      command: "'/usr/local/bin/node' '/opt/outsider/bin/outsider-hook.mjs' hook codex --attached-control" }] }]])) }));
  for (const version of ["1.3.9", "1.3.10", "1.3.97"]) {
    const directory = path.join(codexHome, "plugins", "cache", "outsider",
      "outsider-stage05", version, ".codex-plugin");
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "plugin.json"), JSON.stringify({
      name: "outsider-stage05", version,
    }));
  }
  const foreign = path.join(codexHome, "plugins", "cache", "evil",
    "outsider-stage05", productVersion(), ".codex-plugin");
  mkdirSync(foreign, { recursive: true });
  writeFileSync(path.join(foreign, "plugin.json"), JSON.stringify({
    name: "outsider-stage05", version: productVersion(),
  }));
  const report = runProductDoctor({ stateRoot, attachedRoot, home, codexHome,
    workerExecutable: "/fake/claude", workerPreflight: () => ({ ok: true }) });
  assert.equal(report.surfaces.codex.pluginVersion, "1.3.97");
  assert.equal(report.surfaces.codex.pluginVersionMatchesRuntime, false);
  assert.equal(report.readiness.codexPluginAndHooksConfigured, false);
});

test("a Codex-only diagnostic does not fail globally because Claude auth is absent", () => {
  const home = mkdtempSync(path.join(tmpdir(), "outsider-product-codex-only-"));
  const report = runProductDoctor({
    home, codexHome: path.join(home, ".codex"),
    stateRoot: path.join(home, ".outsider", "runs"),
    attachedRoot: path.join(home, ".outsider", "attached"),
    workerExecutable: "/missing/claude",
    workerPreflight: () => ({ ok: false, detail: "Claude unavailable" }),
  });
  assert.equal(report.ok, true);
  assert.equal(report.checks.claudeProtocolAndAuth.ok, false);
  assert.equal(report.checks.claudeProtocolAndAuth.requiredForGlobalDiagnostic, false);
  assert.equal(report.readiness.claudeProtocolAndAuthReady, false);
  assert.equal(report.surfaces.codex.hookTrustStatus,
    "UNKNOWN_REQUIRES_CODEX_HOOKS_REVIEW");
});

test("Claude install readiness requires the team lifecycle events as well as the original attached events", () => {
  const home = mkdtempSync(path.join(tmpdir(), "outsider-product-claude-events-"));
  const stateRoot = path.join(home, ".outsider", "runs");
  const attachedRoot = path.join(home, ".outsider", "attached");
  const codexHome = path.join(home, ".codex");
  const settingsDirectory = path.join(home, ".claude");
  mkdirSync(settingsDirectory, { recursive: true });
  const originalEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
    "SubagentStart", "SubagentStop", "PreCompact", "Stop", "SessionEnd"];
  const settingsFor = (events) => ({ hooks: Object.fromEntries(events.map((event) =>
    [event, [{ hooks: [{ type: "command", command: "node outsider-hook.mjs hook claude-code" }] }]])) });
  writeFileSync(path.join(settingsDirectory, "settings.json"),
    JSON.stringify(settingsFor(originalEvents)));
  const incomplete = runProductDoctor({ stateRoot, attachedRoot, home, codexHome,
    workerExecutable: "/fake/claude", workerPreflight: () => ({ ok: true }) });
  assert.equal(incomplete.surfaces.nativeClaudeCode.installed, false);
  assert.deepEqual(incomplete.surfaces.nativeClaudeCode.requiredEvents.slice(-3),
    ["TaskCreated", "TaskCompleted", "TeammateIdle"]);
  writeFileSync(path.join(settingsDirectory, "settings.json"), JSON.stringify(settingsFor([
    ...originalEvents, "TaskCreated", "TaskCompleted", "TeammateIdle",
  ])));
  const complete = runProductDoctor({ stateRoot, attachedRoot, home, codexHome,
    workerExecutable: "/fake/claude", workerPreflight: () => ({ ok: true }) });
  assert.equal(complete.surfaces.nativeClaudeCode.installed, true);
  assert.equal(complete.surfaces.nativeClaudeCode.installedEvents.length, 12);
});

test("product doctor detects the documented project-scope Claude hook installation", () => {
  const home = mkdtempSync(path.join(tmpdir(), "outsider-product-project-home-"));
  const projectRoot = mkdtempSync(path.join(tmpdir(), "outsider-product-project-root-"));
  const stateRoot = path.join(home, ".outsider", "runs");
  const attachedRoot = path.join(home, ".outsider", "attached");
  const settingsDirectory = path.join(projectRoot, ".claude");
  mkdirSync(settingsDirectory, { recursive: true });
  writeFileSync(path.join(settingsDirectory, "settings.json"), JSON.stringify({
    hooks: Object.fromEntries([
      "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "SubagentStart",
      "SubagentStop", "PreCompact", "Stop", "SessionEnd", "TaskCreated", "TaskCompleted",
      "TeammateIdle",
    ].map((event) => [event, [{ hooks: [{ type: "command",
      command: "node outsider-hook.mjs hook claude-code" }] }]])),
  }));

  const report = runProductDoctor({
    home,
    projectRoot,
    stateRoot,
    attachedRoot,
    codexHome: path.join(home, ".codex"),
    workerExecutable: "/fake/claude",
    workerPreflight: () => ({ ok: true }),
  });
  assert.equal(report.surfaces.nativeClaudeCode.installed, true);
  assert.equal(report.surfaces.nativeClaudeCode.installedEvents.length, 12);
  assert.deepEqual(report.surfaces.nativeClaudeCode.installationScopes, ["project"]);
  assert.equal(report.surfaces.desktopCode.installed, true);
  assert.deepEqual(report.surfaces.desktopCode.installationScopes, ["project"]);
});

test("shareable doctor projection excludes local paths and raw diagnostic details", () => {
  const marker = "PRIVATE-OPERATOR-PATH-9f7d";
  const home = mkdtempSync(path.join(tmpdir(), `${marker}-home-`));
  const stateRoot = path.join(home, marker, "runs");
  const attachedRoot = path.join(home, marker, "attached");
  const report = runProductDoctor({
    home, stateRoot, attachedRoot, codexHome: path.join(home, marker, ".codex"),
    workerExecutable: path.join(home, marker, "private-worker"),
    workerPreflight: () => ({ ok: false, detail: `${marker}: bearer secret-token-value` }),
  });
  const shared = projectProductDoctorForSharing(report);
  const serialized = JSON.stringify(shared);
  assert.equal(shared.schema, "outsider/product-doctor-share/v1");
  assert.equal(shared.privacy.rawPathsIncluded, false);
  assert.doesNotMatch(serialized, new RegExp(marker));
  assert.doesNotMatch(serialized, /secret-token-value|private-worker|\/tmp\//u);
  assert.equal(Object.hasOwn(shared, "worker"), false);
  assert.equal(Object.hasOwn(shared, "stateRoot"), false);
  assert.equal(Object.hasOwn(shared, "attachedRoot"), false);
});

test("shareable doctor rejects untrusted helper and plugin version strings", () => {
  const helperMarker = "1.2.3-sk-PRIVATE-MARKER";
  const pluginMarker = "1.2.3+PRIVATE-MARKER";
  const home = mkdtempSync(path.join(tmpdir(), "outsider-product-version-privacy-"));
  const stateRoot = path.join(home, ".outsider", "runs");
  const attachedRoot = path.join(home, ".outsider", "attached");
  const codexHome = path.join(home, ".codex");
  mkdirSync(attachedRoot, { recursive: true });
  writeFileSync(path.join(attachedRoot, "daemon.json"), JSON.stringify({
    transport: "system-helper", protocolVersion: 1, pid: process.pid,
    packageVersion: helperMarker,
  }));
  const cache = path.join(codexHome, "plugins", "cache", "outsider",
    "outsider-stage05", pluginMarker, ".codex-plugin");
  mkdirSync(cache, { recursive: true });
  writeFileSync(path.join(cache, "plugin.json"), JSON.stringify({
    name: "outsider-stage05", version: pluginMarker,
  }));
  const report = runProductDoctor({ stateRoot, attachedRoot, home, codexHome,
    workerExecutable: "/fake/claude", workerPreflight: () => ({ ok: true }) });
  assert.equal(report.surfaces.desktopCowork.systemHelperVersion, helperMarker);
  assert.equal(report.surfaces.codex.pluginVersion, pluginMarker);
  const shared = projectProductDoctorForSharing({
    ...report,
    version: helperMarker,
    surfaces: {
      ...report.surfaces,
      desktopCowork: { ...report.surfaces.desktopCowork,
        systemHelperVersion: helperMarker },
      codex: { ...report.surfaces.codex, pluginVersion: pluginMarker,
        runtimeVersion: helperMarker },
      chatgpt: { ...report.surfaces.chatgpt, packagedPluginVersion: pluginMarker },
    },
  });
  const serialized = JSON.stringify(shared);
  assert.equal(serialized.includes(helperMarker), false);
  assert.equal(serialized.includes(pluginMarker), false);
  assert.equal(shared.version, null);
  assert.equal(shared.surfaces.desktopCowork.systemHelperVersion, null);
  assert.equal(shared.surfaces.codex.pluginVersion, null);
  assert.equal(shared.surfaces.codex.runtimeVersion, null);
  assert.equal(shared.surfaces.chatgpt.packagedPluginVersion, null);
});

test("runs and show expose durable status without treating unsealed evidence as complete", () => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-product-runs-"));
  const directory = path.join(stateRoot, "run-one");
  mkdirSync(directory);
  writeFileSync(path.join(directory, "run.json"), JSON.stringify({
    runId: "run-one", status: "running", host: "claude-code",
    proof: { complete: false }, updatedAt: "2026-08-11T00:00:00.000Z",
  }));
  writeFileSync(path.join(directory, "contract.json"), JSON.stringify({
    ask: "fix the product", acceptance: "npm test", seal: "sha256:contract",
  }));
  const runs = listProductRuns(stateRoot);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].evidence, "not-sealed");
  const detail = inspectProductRun("run-one", stateRoot);
  assert.equal(detail.ok, true);
  assert.equal(detail.proofComplete, false);
  assert.equal(detail.evidenceVerified, false);
  assert.equal(detail.evidenceError, "EVIDENCE_NOT_FINALIZED");
});

test("unified CLI has stable help, version, runs and show product surfaces", () => {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-product-cli-"));
  const cli = path.resolve("bin/outsider.mjs");
  const version = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), productVersion());
  const help = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /outsider doctor/);
  assert.match(help.stdout, /outsider runs/);
  const doctor = spawnSync(process.execPath,
    [cli, "doctor", "--state-root", stateRoot], {
      encoding: "utf8", env: { ...process.env, HOME: stateRoot, CODEX_HOME: path.join(stateRoot, ".codex") },
    });
  assert.match(doctor.stdout, /DIAGNOSTIC (?:OK|FAILED)/);
  assert.doesNotMatch(doctor.stdout, / · READY(?:\s|$)/);
  const shareDoctor = spawnSync(process.execPath,
    [cli, "doctor", "--state-root", stateRoot, "--share-json"], {
      encoding: "utf8", env: { ...process.env, HOME: stateRoot, CODEX_HOME: path.join(stateRoot, ".codex") },
    });
  assert.equal(shareDoctor.status, 0, shareDoctor.stderr);
  assert.equal(JSON.parse(shareDoctor.stdout).schema, "outsider/product-doctor-share/v1");
  assert.doesNotMatch(shareDoctor.stdout, new RegExp(stateRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  const runs = spawnSync(process.execPath,
    [cli, "runs", "--state-root", stateRoot, "--json"], { encoding: "utf8" });
  assert.equal(runs.status, 0);
  assert.deepEqual(JSON.parse(runs.stdout), []);
  const missing = spawnSync(process.execPath,
    [cli, "show", "missing", "--state-root", stateRoot], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).error, "RUN_NOT_FOUND");
});

test("the installed npm-style symlink executes the CLI instead of returning an empty false green", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-product-symlink-"));
  const link = path.join(directory, "outsider");
  symlinkSync(path.resolve("bin/outsider.mjs"), link);
  const result = spawnSync(link, ["--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), productVersion());
});
