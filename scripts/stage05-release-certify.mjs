#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assessReleaseReadiness,
  certifyEnduranceRun,
} from "../src/outsider-release-certification.js";
import {
  certifyAgentTeamEvidence,
  certifyCoworkEvidence,
  certifyR1RepeatabilityEvidence,
  certifyR4CrashRecoveryEvidence,
} from "../src/outsider-field-evidence.js";
import {
  machineIdentity,
  verifySecondMachineConformance,
} from "../src/outsider-second-machine-conformance.js";
import { validateOpenAIUniversalPlugin } from "./openai-universal-plugin-validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) options[value.slice(2)] = true;
    else { options[value.slice(2)] = next; index += 1; }
  }
  return options;
}

function execute(command, args, {
  cwd = root, env = process.env, timeout = 120_000, captureFullStdout = false,
} = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, env, timeout, encoding: "utf8", stdio: "pipe" });
  const stdout = String(result.stdout ?? "");
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
    durationMs: Date.now() - started,
    stdoutTail: stdout.slice(-4000),
    ...(captureFullStdout ? { stdout } : {}),
    stderrTail: String(result.stderr ?? "").slice(-4000),
  };
}

function sha256(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

const options = parse(process.argv.slice(2));
if (Boolean(options["cowork-state-root"]) !== Boolean(options["cowork-workspace"])) {
  throw new Error("COWORK_EVIDENCE_REQUIRES_STATE_ROOT_AND_WORKSPACE");
}
if (Boolean(options["second-machine-record"])
  !== Boolean(options["second-machine-public-key"])) {
  throw new Error("SECOND_MACHINE_EVIDENCE_REQUIRES_RECORD_AND_PUBLIC_KEY");
}
const artifact = path.resolve(options.artifact
  || path.join(root, "dist", `${pkg.name}-${pkg.version}.tgz`));
if (!existsSync(artifact)) throw new Error(`RELEASE_ARTIFACT_MISSING:${artifact}`);
const certificateFile = path.resolve(options.out
  || path.join(root, "dist", `release-certificate-${pkg.version}.json`));
const installation = mkdtempSync(path.join(tmpdir(), "outsider-clean-install-"));
const stateRoot = path.join(installation, "state");
mkdirSync(stateRoot, { recursive: true });
const primaryIdentity = machineIdentity({ platform: process.platform, arch: process.arch,
  release: os.release(), hostname: os.hostname() });

const certificate = {
  schema: "outsider/stage05-release-certificate/v1",
  product: { name: pkg.name, version: pkg.version },
  artifact: { file: path.basename(artifact), sha256: sha256(artifact) },
  environment: {
    node: process.version, platform: process.platform, arch: process.arch,
    sameMachineCleanPrefix: true,
    hostIdentity: primaryIdentity.environment,
    machineIdentityHash: primaryIdentity.machineIdentityHash,
  },
  checks: {},
  fieldEvidence: {
    liveCanary: { status: options.live ? "PENDING" : "NOT_RUN" },
    r1Repeatability: { status: options["r1-run"] ? "PENDING" : "NOT_RUN" },
    r2AgentTeamDelivery: { status: options["r2-run"] ? "PENDING" : "NOT_RUN" },
    r3IntegrationCorrection: { status: options["r3-run"] ? "PENDING" : "NOT_RUN" },
    r4CrashRecovery: { status: options["r4-run"] ? "PENDING" : "NOT_RUN" },
    localClaudeHost: { status: "PENDING" },
    transparentAttachedHook: { status: "PENDING" },
    desktopCoworkPlugin: { status: options["cowork-state-root"] && options["cowork-workspace"]
      ? "PENDING" : "PACKAGED_NOT_CONFORMED" },
    multiHourEndurance: { status: "NOT_RUN" },
    independentSecondMachineInstall: { status: options["second-machine-record"]
      && options["second-machine-public-key"] ? "PENDING" : "NOT_RUN" },
    codexLifecycleControl: { status: "NOT_ESTABLISHED" },
    chatgptLivePluginInstall: { status: "NOT_RUN" },
    chatgptNewChatSkillEvaluation: { status: "NOT_RUN" },
    openAIPluginsDirectoryPublication: { status: "NOT_RUN" },
    traeLifecycleControl: { status: "UNSUPPORTED" },
  },
  claimBoundary: [
    "certificate covers the named artifact on the recorded environment only",
    "deterministic tests do not prove multi-hour semantic reliability",
    "NOT_RUN and UNSUPPORTED are never counted as PASS",
    "plugin packaging does not establish ChatGPT live install or Codex lifecycle control",
  ],
};

if (options["endurance-run"]) {
  const minHours = Math.max(2, Number(options["endurance-min-hours"]) || 2);
  const endurance = certifyEnduranceRun(path.resolve(options["endurance-run"]), {
    minDurationMs: minHours * 60 * 60 * 1000,
    minimumTeammates: 2,
    minimumTeamTasks: 3,
    minimumPatrolVerdicts: 4,
  });
  certificate.fieldEvidence.multiHourEndurance = {
    status: endurance.ok ? "PASS" : "FAIL", ...endurance,
  };
}

try {
  certificate.checks.cleanInstall = execute("npm", ["install", "--offline", "--ignore-scripts",
    "--no-audit", "--no-fund", "--cache", path.join(installation, "npm-cache"),
    "--prefix", installation, artifact], { timeout: 180_000 });
  const installedRoot = path.join(installation, "node_modules", pkg.name);
  const runtimeSourceFiles = {
    controller: "src/outsider-kernel-controller.js",
    runner: "src/outsider-kernel-runner.js",
    hook: "bin/outsider-hook.mjs",
    contractCompiler: "src/outsider-contract-compiler.js",
    outcomeVerifier: "src/outsider-outcome-verifier.js",
  };
  const installedRuntimeReady = certificate.checks.cleanInstall.ok
    && Object.values(runtimeSourceFiles).every((relative) =>
      existsSync(path.join(installedRoot, relative)));
  const runtimeHashes = installedRuntimeReady ? Object.fromEntries(
    Object.entries(runtimeSourceFiles).map(([name, relative]) =>
      [name, sha256(path.join(installedRoot, relative))])) : {};
  const agentTeamSourceFiles = {
    probeHook: "scripts/stage05-agent-team-probe-hook.mjs",
    conformance: "src/outsider-agent-team-conformance.js",
    probe: "scripts/stage05-agent-team-probe.mjs",
    artifactBinding: "scripts/stage05-release-artifact-binding.mjs",
  };
  const r4SourceFiles = [
    "scripts/stage05-r4-recovery.mjs", "scripts/stage05-r4-recovery-oracle.mjs",
    "src/outsider-controller-watchdog.js", "src/outsider-controller-host.js",
    "src/outsider-controller-rpc.js", "src/outsider-intervention-recovery.js",
    "src/outsider-attached-daemon.js", "src/outsider-supervised-experience.js",
  ];
  const installedFilesAvailable = (files) => installedRuntimeReady
    && files.every((relative) => existsSync(path.join(installedRoot, relative)));
  const failUnavailableFieldEvidence = (gate, reason =
    "release artifact clean install is unavailable for field-evidence verification") => ({
    status: "FAIL", ok: false, gate, errors: [reason],
  });
  if (options["r1-run"]) {
    if (!installedRuntimeReady) {
      certificate.fieldEvidence.r1Repeatability = failUnavailableFieldEvidence("R1");
    } else {
    const experiment = (() => {
      try { return JSON.parse(readFileSync(path.join(path.resolve(options["r1-run"]),
        "experiment.json"), "utf8")); } catch { return null; }
    })();
    const expectedEvaluatorHashes = {};
    const missingEvaluatorFiles = [];
    for (const entry of experiment?.preregistration?.evaluator?.files ?? []) {
      const basename = path.basename(entry.path);
      const category = basename.startsWith("outsider-") ? "src" : "scripts";
      const current = path.join(installedRoot, category, basename);
      if (existsSync(current)) expectedEvaluatorHashes[entry.path] = sha256(current);
      else missingEvaluatorFiles.push(entry.path);
    }
    certificate.fieldEvidence.r1Repeatability = missingEvaluatorFiles.length > 0
      ? failUnavailableFieldEvidence("R1",
        "R1 evaluator closure is not present in the reviewed public runtime")
      : certifyR1RepeatabilityEvidence(path.resolve(options["r1-run"]), {
          expectedArtifactHash: certificate.artifact.sha256,
          expectedVersion: pkg.version,
          expectedEvaluatorHashes,
        });
    }
  }
  if (options["r2-run"]) {
    const available = installedFilesAvailable(Object.values(agentTeamSourceFiles));
    const agentTeamSourceHashes = available ? {
      controller: runtimeHashes.controller.slice("sha256:".length),
      runner: runtimeHashes.runner.slice("sha256:".length),
      hook: runtimeHashes.hook.slice("sha256:".length),
      ...Object.fromEntries(Object.entries(agentTeamSourceFiles).map(([name, relative]) =>
        [name, sha256(path.join(installedRoot, relative)).slice("sha256:".length)])),
    } : {};
    certificate.fieldEvidence.r2AgentTeamDelivery = available
      ? certifyAgentTeamEvidence(path.resolve(options["r2-run"]), {
          expectedArtifactHash: certificate.artifact.sha256,
          expectedVersion: pkg.version,
          expectedRuntimeHashes: runtimeHashes,
          expectedSourceHashes: agentTeamSourceHashes,
        })
      : failUnavailableFieldEvidence("R2",
        "R2 evaluator closure is not present in the reviewed public runtime");
  }
  if (options["r3-run"]) {
    const available = installedFilesAvailable(Object.values(agentTeamSourceFiles));
    const agentTeamSourceHashes = available ? {
      controller: runtimeHashes.controller.slice("sha256:".length),
      runner: runtimeHashes.runner.slice("sha256:".length),
      hook: runtimeHashes.hook.slice("sha256:".length),
      ...Object.fromEntries(Object.entries(agentTeamSourceFiles).map(([name, relative]) =>
        [name, sha256(path.join(installedRoot, relative)).slice("sha256:".length)])),
    } : {};
    certificate.fieldEvidence.r3IntegrationCorrection = available
      ? certifyAgentTeamEvidence(path.resolve(options["r3-run"]), {
          expectedArtifactHash: certificate.artifact.sha256,
          expectedVersion: pkg.version,
          expectedRuntimeHashes: runtimeHashes,
          expectedSourceHashes: agentTeamSourceHashes,
          requireIntegrationCorrection: true,
        })
      : failUnavailableFieldEvidence("R3",
        "R3 evaluator closure is not present in the reviewed public runtime");
  }
  if (options["r4-run"]) {
    const available = installedFilesAvailable(r4SourceFiles);
    const r4SourceHashes = available ? Object.fromEntries(r4SourceFiles.map((relative) =>
      [relative, sha256(path.join(installedRoot, relative))])) : {};
    certificate.fieldEvidence.r4CrashRecovery = available
      ? certifyR4CrashRecoveryEvidence(path.resolve(options["r4-run"]), {
          expectedArtifactHash: certificate.artifact.sha256,
          expectedVersion: pkg.version,
          expectedSourceHashes: r4SourceHashes,
        })
      : failUnavailableFieldEvidence("R4",
        "R4 evaluator closure is not present in the reviewed public runtime");
  }
  if (options["second-machine-record"] && options["second-machine-public-key"]) {
    let record = null;
    let publicKeyPem = null;
    try {
      record = JSON.parse(readFileSync(path.resolve(options["second-machine-record"]), "utf8"));
      publicKeyPem = readFileSync(path.resolve(options["second-machine-public-key"]), "utf8");
    } catch (error) {
      certificate.fieldEvidence.independentSecondMachineInstall = {
        status: "FAIL", ok: false, errors: [`second-machine evidence cannot be read:${error.message}`],
      };
    }
    const secondMachineFiles = [
      "scripts/stage05-second-machine-conformance.mjs",
      "src/outsider-second-machine-conformance.js",
    ];
    if (record && publicKeyPem && installedFilesAvailable(secondMachineFiles)) {
      certificate.fieldEvidence.independentSecondMachineInstall = verifySecondMachineConformance(
        record, { publicKeyPem, expectedArtifactHash: certificate.artifact.sha256,
          expectedVersion: pkg.version,
          expectedEvaluatorHashes: {
            script: sha256(path.join(installedRoot, "scripts",
              "stage05-second-machine-conformance.mjs")),
            library: sha256(path.join(installedRoot, "src",
              "outsider-second-machine-conformance.js")),
          },
          primaryMachineIdentityHash: certificate.environment.machineIdentityHash });
    } else if (record && publicKeyPem) {
      certificate.fieldEvidence.independentSecondMachineInstall = failUnavailableFieldEvidence(
        "SECOND_MACHINE", "second-machine evaluator closure is not present in the reviewed public runtime");
    }
  }
  const enduranceEvidence = certificate.fieldEvidence.multiHourEndurance;
  if (options["endurance-run"] && enduranceEvidence) {
    const artifactRuntimeMatches = enduranceEvidence.productVersion === pkg.version
      && enduranceEvidence.releaseArtifact?.sha256 === certificate.artifact.sha256
      && enduranceEvidence.releaseArtifact?.packageVersion === pkg.version
      && Object.entries(runtimeHashes).every(([name, value]) =>
        enduranceEvidence.runtimeHashes?.[name] === value);
    enduranceEvidence.artifactRuntimeMatches = artifactRuntimeMatches;
    enduranceEvidence.expectedRuntimeHashes = runtimeHashes;
    if (!artifactRuntimeMatches) {
      enduranceEvidence.status = "FAIL";
      enduranceEvidence.ok = false;
      enduranceEvidence.errors = [...(enduranceEvidence.errors ?? []),
        "endurance runtime does not match the release artifact"];
    }
  }
  const cli = path.join(installation, "node_modules", ".bin", "outsider");
  certificate.checks.version = execute(cli, ["--version"]);
  certificate.checks.version.semanticOk = certificate.checks.version.ok
    && certificate.checks.version.stdoutTail.trim() === pkg.version;
  certificate.checks.version.ok = certificate.checks.version.semanticOk;
  certificate.checks.help = execute(cli, ["help"]);
  certificate.checks.help.semanticOk = certificate.checks.help.ok
    && /outsider doctor/.test(certificate.checks.help.stdoutTail)
    && /outsider run/.test(certificate.checks.help.stdoutTail)
    && /outsider install/.test(certificate.checks.help.stdoutTail);
  certificate.checks.help.ok = certificate.checks.help.semanticOk;
  certificate.checks.doctor = execute(cli, ["doctor", "--json", "--state-root", stateRoot],
    { timeout: 60_000, captureFullStdout: true });
  try {
    certificate.checks.doctor.report = JSON.parse(certificate.checks.doctor.stdout);
  } catch { certificate.checks.doctor.report = null; }
  delete certificate.checks.doctor.stdout;
  const doctorReport = certificate.checks.doctor.report;
  const doctorExpectedOk = doctorReport?.readiness?.diagnosticOperational === true;
  certificate.checks.doctor.semanticOk = !certificate.checks.doctor.error
    && [0, 1].includes(certificate.checks.doctor.status)
    && doctorReport?.schema === "outsider/product-doctor/v2"
    && doctorReport?.mode === "MULTI_SURFACE_STAGE05_DIAGNOSTIC"
    && doctorReport?.version === pkg.version
    && doctorReport.ok === doctorExpectedOk
    && certificate.checks.doctor.status === (doctorReport.ok ? 0 : 1);
  certificate.checks.doctor.diagnosticOperational = doctorExpectedOk;
  certificate.checks.doctor.ok = certificate.checks.doctor.semanticOk && doctorExpectedOk;
  const claudeHostReady = doctorReport?.readiness?.claudeProtocolAndAuthReady === true;
  certificate.fieldEvidence.localClaudeHost = {
    status: claudeHostReady ? "PASS" : "BLOCKED_PRECONDITION",
    worker: doctorReport?.worker ?? null,
    reason: claudeHostReady ? null
      : doctorReport?.checks?.claudeProtocolAndAuth?.error
        ?? doctorReport?.checks?.claudeProtocolAndAuth?.detail ?? "Claude host is not ready",
  };
  certificate.checks.packageTests = execute("npm", ["test"], {
    cwd: installedRoot, timeout: 180_000,
  });
  certificate.checks.corpus = execute("npm", ["run", "test:corpus"], {
    cwd: installedRoot, timeout: 120_000,
  });
  const installHome = path.join(installation, "install-home");
  mkdirSync(path.join(installHome, ".claude"), { recursive: true });
  /* launchd's gui/<uid> namespace is machine-global, not HOME-scoped. A
     temporary HOME cannot isolate the production LaunchAgent label. The
     deterministic certificate therefore stages every user-install byte and
     hook in the temporary prefix without registering launchd; exact-version
     live host evidence remains a separate field gate. */
  certificate.checks.transparentInstall = execute(cli, ["install", "--stage-only"], {
    timeout: 60_000,
    env: { ...process.env, HOME: installHome,
      OUTSIDER_HOME: path.join(installHome, ".outsider") },
  });
  const installedSettings = (() => {
    try { return JSON.parse(readFileSync(path.join(installHome, ".claude", "settings.json"), "utf8")); }
    catch { return null; }
  })();
  const requiredAttachedEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
    "SubagentStart", "SubagentStop", "PreCompact", "Stop", "SessionEnd", "TaskCreated",
    "TaskCompleted", "TeammateIdle"];
  const installedAttachedEvents = requiredAttachedEvents.filter((event) =>
    (installedSettings?.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? [])
      .some((hook) => /outsider-hook/.test(String(hook.command ?? "")))));
  const stablePlugin = path.join(installHome, ".outsider", "plugin", "outsider-guard");
  const stagedHelper = path.join(installHome, ".outsider", "system-helper", "releases",
    pkg.version, "bin", "outsider-attached-daemon.mjs");
  const stagedHelperPlist = path.join(installHome, "Library", "LaunchAgents",
    "ai.outsider.stage05.plist");
  certificate.checks.transparentInstall.semanticOk = certificate.checks.transparentInstall.ok
    && installedAttachedEvents.length === requiredAttachedEvents.length
    && existsSync(path.join(stablePlugin, ".claude-plugin", "plugin.json"))
    && existsSync(path.join(stablePlugin, "hooks", "hooks.json"))
    && existsSync(stagedHelper) && existsSync(stagedHelperPlist);
  certificate.checks.transparentInstall.ok = certificate.checks.transparentInstall.semanticOk;
  certificate.checks.transparentInstall.installedEvents = installedAttachedEvents;
  certificate.checks.transparentInstall.stablePlugin = stablePlugin;
  certificate.checks.transparentInstall.systemHelper = stagedHelper;
  certificate.checks.transparentInstall.registrationMode = "STAGED_NOT_REGISTERED";
  certificate.fieldEvidence.transparentAttachedHook = {
    status: certificate.checks.packageTests.ok && certificate.checks.transparentInstall.ok
      ? "PACKAGED_NOT_CONFORMED" : "FAIL",
    evidence: "clean isolated staging; exact-version native host execution is a separate field gate",
  };
  const projectInstallRoot = path.join(installation, "project-scope");
  mkdirSync(projectInstallRoot, { recursive: true });
  certificate.checks.projectScopedInstall = execute(cli, ["install", "--scope", "project"], {
    cwd: projectInstallRoot, timeout: 60_000,
    env: { ...process.env, HOME: installHome,
      OUTSIDER_HOME: path.join(installHome, ".outsider") },
  });
  const projectSettings = (() => {
    try { return JSON.parse(readFileSync(path.join(projectInstallRoot,
      ".claude", "settings.json"), "utf8")); } catch { return null; }
  })();
  const projectEvents = requiredAttachedEvents.filter((event) =>
    (projectSettings?.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? [])
      .some((hook) => /outsider-hook/.test(String(hook.command ?? "")))));
  certificate.checks.projectScopedInstall.semanticOk = certificate.checks.projectScopedInstall.ok
    && projectEvents.length === requiredAttachedEvents.length;
  certificate.checks.projectScopedInstall.ok = certificate.checks.projectScopedInstall.semanticOk;
  certificate.checks.projectScopedInstall.installedEvents = projectEvents;
  const pluginArtifact = path.join(path.dirname(artifact),
    `${pkg.name}-${pkg.version}-claude.plugin.zip`);
  certificate.checks.desktopPluginPackage = {
    ok: existsSync(pluginArtifact),
    status: existsSync(pluginArtifact) ? 0 : 1,
    artifact: existsSync(pluginArtifact) ? path.basename(pluginArtifact) : null,
  };
  const universalPlugin = validateOpenAIUniversalPlugin({ root: installedRoot });
  certificate.checks.openAIUniversalPluginPackage = {
    ok: universalPlugin.ok === true,
    memberCount: universalPlugin.memberCount ?? null,
    errors: universalPlugin.errors ?? [],
    chatgptLiveInstallEstablished: false,
    codexControlledByPackageValidationAlone: false,
  };
  certificate.fieldEvidence.desktopCoworkPlugin = {
    status: existsSync(pluginArtifact) ? "PACKAGED_NOT_CONFORMED" : "MISSING",
    artifact: existsSync(pluginArtifact) ? path.basename(pluginArtifact) : null,
    reason: "Cowork host execution must be observed in a real Desktop session before claiming control",
  };
  if (existsSync(pluginArtifact) && options["cowork-state-root"] && options["cowork-workspace"]) {
    const expectedPrompt = options["cowork-expected-prompt-file"]
      ? readFileSync(path.resolve(options["cowork-expected-prompt-file"]), "utf8").trim() : null;
    certificate.fieldEvidence.desktopCoworkPlugin = {
      ...certifyCoworkEvidence({
        stateRoot: path.resolve(options["cowork-state-root"]),
        workspace: path.resolve(options["cowork-workspace"]), expectedPrompt,
      }, { expectedVersion: pkg.version, expectedRuntimeHashes: runtimeHashes }),
      artifact: path.basename(pluginArtifact), pluginSha256: sha256(pluginArtifact),
    };
  }
  if (options.live && claudeHostReady
    && existsSync(path.join(installedRoot, "scripts", "stage05-live-canary.mjs"))) {
    const liveState = path.join(installation, "live-state");
    mkdirSync(liveState, { recursive: true });
    const live = execute(process.execPath, [path.join(installedRoot, "scripts", "stage05-live-canary.mjs")], {
      cwd: installedRoot,
      env: { ...process.env, OUTSIDER_EXPERIMENT_STATE_ROOT: liveState,
        OUTSIDER_EXPERIMENT_ARM: "fixed", OUTSIDER_EXPERIMENT_SUITE: "recovery" },
      timeout: 25 * 60_000,
    });
    certificate.fieldEvidence.liveCanary = { status: live.ok ? "PASS" : "FAIL", ...live };
  } else if (options.live) {
    certificate.fieldEvidence.liveCanary = {
      status: "BLOCKED_PRECONDITION",
      reason: certificate.fieldEvidence.localClaudeHost.reason
        ?? "live canary evaluator is not present in the reviewed public runtime",
    };
  }
  const certifierClosure = [
    "scripts/stage05-release-certify.mjs",
    "src/outsider-release-certification.js",
    "src/outsider-field-evidence.js",
    "src/outsider-cowork-conformance.js",
    "src/outsider-second-machine-conformance.js",
  ];
  const installedCertificationBoundary = [
    "public-package-manifest.json",
    "release-public-files.json",
    "scripts/stage05-public-package-smoke.mjs",
    "scripts/openai-universal-plugin-validate.mjs",
  ];
  const operatorCertifierAvailable = certifierClosure.every((relative) =>
    existsSync(path.join(root, relative)));
  const installedCertificationBoundaryAvailable = installedCertificationBoundary.every((relative) =>
    existsSync(path.join(installedRoot, relative)));
  certificate.checks.certifierSourceClosure = {
    ok: installedRuntimeReady
      && operatorCertifierAvailable
      && installedCertificationBoundaryAvailable
      && certificate.checks.packageTests.ok === true,
    scope: "OPERATOR_CERTIFIER_SOURCE_PLUS_INSTALLED_PUBLIC_MANIFEST_VERIFIER_BOUNDARY",
    operatorSourceFiles: operatorCertifierAvailable
      ? Object.fromEntries(certifierClosure.map((relative) =>
          [relative, sha256(path.join(root, relative))])) : {},
    installedBoundaryFiles: installedCertificationBoundaryAvailable
      ? Object.fromEntries(installedCertificationBoundary.map((relative) =>
          [relative, sha256(path.join(installedRoot, relative))])) : {},
    certifierShippedInsidePublicRuntime: false,
  };
  const deterministicReady = ["cleanInstall", "version", "help", "doctor", "packageTests", "corpus",
    "transparentInstall", "projectScopedInstall", "desktopPluginPackage",
    "openAIUniversalPluginPackage", "certifierSourceClosure"]
    .every((name) => certificate.checks[name]?.ok === true);
  const readiness = assessReleaseReadiness({ deterministicReady,
    fieldEvidence: certificate.fieldEvidence });
  certificate.releaseDecision = readiness.releaseDecision;
  certificate.stablePublicReleaseReady = readiness.stablePublicReleaseReady;
  certificate.certifiedAt = new Date().toISOString();
  mkdirSync(path.dirname(certificateFile), { recursive: true });
  writeFileSync(certificateFile, JSON.stringify(certificate, null, 2));
  process.stdout.write(`${JSON.stringify({ certificate: certificateFile,
    releaseDecision: certificate.releaseDecision,
    stablePublicReleaseReady: certificate.stablePublicReleaseReady }, null, 2)}\n`);
  process.exitCode = deterministicReady ? 0 : 1;
} finally {
  rmSync(installation, { recursive: true, force: true });
}
