import { randomUUID } from "node:crypto";
import {
  accessSync, constants, existsSync, mkdirSync, readFileSync, readdirSync,
  unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { defaultStateRoot } from "./outsider-kernel-store.js";
import { preflightWorkerCli, resolveClaudeExecutable } from "./outsider-kernel-runner.js";
import { verifyStage05RunDirectory } from "./outsider-stage05-evidence.js";
import { defaultAttachedRoot } from "./outsider-attached-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function productVersion() {
  return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
}

function jsonOrNull(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function processExists(pid) {
  if (!(Number(pid) > 0)) return false;
  try { process.kill(Number(pid), 0); return true; } catch (error) {
    return error?.code === "EPERM";
  }
}

export function resolveRunDirectory(value, stateRoot = defaultStateRoot()) {
  if (!value) return null;
  const direct = path.resolve(value);
  if (existsSync(path.join(direct, "run.json"))) return direct;
  const byId = path.join(stateRoot, value);
  return existsSync(path.join(byId, "run.json")) ? byId : null;
}

export function listProductRuns(stateRoot = defaultStateRoot()) {
  if (!existsSync(stateRoot)) return [];
  return readdirSync(stateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(stateRoot, entry.name);
      const state = jsonOrNull(path.join(directory, "run.json"));
      if (!state?.runId) return null;
      const finalized = jsonOrNull(path.join(directory, "stage05-evidence-manifest.json"));
      return {
        runId: state.runId,
        status: state.status ?? "unknown",
        proofComplete: state.proof?.complete === true,
        deliveryComplete: state.proof?.deliveryComplete === true,
        interventionComplete: state.proof?.interventionComplete === true,
        host: state.host ?? null,
        updatedAt: state.updatedAt ?? null,
        evidence: finalized ? "sealed" : "not-sealed",
        directory,
      };
    }).filter(Boolean)
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
}

export function inspectProductRun(value, stateRoot = defaultStateRoot()) {
  const directory = resolveRunDirectory(value, stateRoot);
  if (!directory) return { ok: false, error: "RUN_NOT_FOUND" };
  const state = jsonOrNull(path.join(directory, "run.json"));
  const contract = jsonOrNull(path.join(directory, "contract.json"));
  const manifestFile = path.join(directory, "stage05-evidence-manifest.json");
  const verification = existsSync(manifestFile)
    ? verifyStage05RunDirectory(directory) : { ok: false, error: "EVIDENCE_NOT_FINALIZED" };
  return {
    ok: true,
    runId: state?.runId ?? path.basename(directory),
    status: state?.status ?? "unknown",
    proofComplete: state?.proof?.complete === true,
    deliveryComplete: state?.proof?.deliveryComplete === true,
    interventionRequired: state?.proof?.interventionRequired === true,
    interventionComplete: state?.proof?.interventionComplete === true,
    host: state?.host ?? null,
    updatedAt: state?.updatedAt ?? null,
    objective: contract?.ask ?? null,
    acceptance: contract?.acceptance ?? null,
    contractSeal: contract?.seal ?? null,
    evidenceVerified: verification.ok,
    evidenceError: verification.ok ? null : verification.error,
    terminalClass: verification.manifest?.terminal?.terminalClass ?? null,
    directory,
  };
}

function writableStateCheck(stateRoot) {
  try {
    mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    accessSync(stateRoot, constants.R_OK | constants.W_OK);
    const probe = path.join(stateRoot, `.doctor-${process.pid}-${randomUUID()}`);
    writeFileSync(probe, "outsider-doctor\n", { mode: 0o600 });
    unlinkSync(probe);
    return { ok: true, detail: stateRoot };
  } catch (error) {
    return { ok: false, detail: `${stateRoot}: ${error?.message ?? error}` };
  }
}

const ATTACHED_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "SubagentStart", "SubagentStop", "PreCompact", "Stop", "SessionEnd", "TaskCreated",
  "TaskCompleted", "TeammateIdle"];

const CODEX_REQUIRED_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse",
  "PostToolUse", "PreCompact", "Stop"];

function isOutsiderCodexAttachedCommand(command) {
  return /(?:^|[\s'"])(?:[^'"\s]*\/)?outsider-hook(?:\.mjs)?['"]?\s+hook\s+codex\s+--attached-control(?:\s|$)/u
    .test(String(command ?? ""));
}

function configuredTomlSection(text, section) {
  const lines = String(text ?? "").split(/\r?\n/u);
  let active = false;
  const values = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      active = line === `[${section}]`;
      continue;
    }
    if (!active) continue;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u.exec(line);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

function semverParts(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u
    .exec(String(value ?? ""));
  if (!match) return null;
  return { core: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") ?? null };
}

function strictSemverOrNull(value) {
  return typeof value === "string" && value.length <= 128 && semverParts(value) ? value : null;
}

/* Shareable diagnostics never echo version metadata learned from local daemon
   or plugin-cache files.  A syntactically valid prerelease/build identifier can
   still carry arbitrary operator text, so only the code-trusted current package
   version is safe to expose across the sharing boundary. */
function trustedCurrentVersionOrNull(value) {
  const current = productVersion();
  return strictSemverOrNull(current) && value === current ? current : null;
}

function compareSemver(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  if (!a || !b) return String(left).localeCompare(String(right), "en", { numeric: true });
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (a.prerelease == null && b.prerelease != null) return 1;
  if (a.prerelease != null && b.prerelease == null) return -1;
  if (a.prerelease == null) return 0;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (a.prerelease[index] == null) return -1;
    if (b.prerelease[index] == null) return 1;
    if (a.prerelease[index] === b.prerelease[index]) continue;
    const aNumber = /^\d+$/u.test(a.prerelease[index]);
    const bNumber = /^\d+$/u.test(b.prerelease[index]);
    if (aNumber && bNumber) return Number(a.prerelease[index]) - Number(b.prerelease[index]);
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return a.prerelease[index].localeCompare(b.prerelease[index]);
  }
  return 0;
}

function codexPluginCacheManifest(codexHome, marketplaceName = "outsider") {
  const root = path.join(codexHome, "plugins", "cache");
  if (!existsSync(root)) return null;
  const candidates = [];
  try {
    const pluginRoot = path.join(root, marketplaceName, "outsider-stage05");
    if (!existsSync(pluginRoot)) return null;
    for (const version of readdirSync(pluginRoot, { withFileTypes: true })) {
    if (!version.isDirectory()) continue;
      if (!strictSemverOrNull(version.name)) continue;
      const file = path.join(pluginRoot, version.name, ".codex-plugin", "plugin.json");
      const manifest = jsonOrNull(file);
      if (manifest?.name === "outsider-stage05" && manifest.version === version.name) {
        candidates.push({ marketplace: marketplaceName, version: version.name, file });
      }
    }
  } catch { return null; }
  return candidates.sort((a, b) => compareSemver(b.version, a.version))[0] ?? null;
}

function verifiedAttachedCompletion(session, hostProtocol, {
  terminalClasses = ["SAFE_DELIVERY"],
} = {}) {
  for (const completed of session?.completedRuns ?? []) {
    if (typeof completed?.runDirectory !== "string") continue;
    const verified = verifyStage05RunDirectory(completed.runDirectory);
    if (!verified.ok
      || verified.binding?.source?.hostProtocol !== hostProtocol
      || verified.binding?.source?.packageVersion !== productVersion()
      || !terminalClasses.includes(verified.projection?.outcome?.terminalClass)
      || verified.projection?.outcome?.terminalClass !== verified.manifest?.terminal?.terminalClass) {
      continue;
    }
    return true;
  }
  return false;
}

function outsiderClaudeEvents(settings) {
  return ATTACHED_EVENTS.filter((event) =>
    (settings?.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? [])
      .some((hook) => /outsider-hook/.test(String(hook.command ?? "")))));
}

function attachedSurfaceStatus(attachedRoot = defaultAttachedRoot(), {
  home = homedir(), codexHome = process.env.CODEX_HOME || path.join(home, ".codex"),
  projectRoot = process.cwd(),
} = {}) {
  const userSettingsFile = path.join(home, ".claude", "settings.json");
  const projectSettingsFile = path.join(path.resolve(projectRoot), ".claude", "settings.json");
  const userEvents = outsiderClaudeEvents(jsonOrNull(userSettingsFile));
  const projectEvents = projectSettingsFile === userSettingsFile
    ? [] : outsiderClaudeEvents(jsonOrNull(projectSettingsFile));
  /* Claude merges user and project settings for the current workspace. Doctor
     must inspect that same effective configuration: a documented project-scope
     install is real even when ~/.claude/settings.json is intentionally absent. */
  const installedEvents = ATTACHED_EVENTS.filter((event) =>
    userEvents.includes(event) || projectEvents.includes(event));
  const installationScopes = [
    ...(userEvents.length > 0 ? ["user"] : []),
    ...(projectEvents.length > 0 ? ["project"] : []),
  ];
  const sessionsRoot = path.join(attachedRoot, "sessions");
  const sessions = existsSync(sessionsRoot) ? readdirSync(sessionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => jsonOrNull(path.join(sessionsRoot, entry.name, "session.json")))
    .filter(Boolean) : [];
  const lastByHost = (host) => sessions.filter((item) => item.host === host)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] ?? null;
  const native = lastByHost("claude-code");
  const cowork = lastByHost("claude-desktop");
  const helper = jsonOrNull(path.join(attachedRoot, "daemon.json"));
  const helperPlist = path.join(home, "Library", "LaunchAgents", "ai.outsider.stage05.plist");
  let helperPlistText = "";
  try { helperPlistText = readFileSync(helperPlist, "utf8"); } catch { /* not installed */ }
  const helperExternalSupervisorConfigured = /<key>OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR<\/key>\s*<string>1<\/string>/u
    .test(helperPlistText)
    && /<key>OUTSIDER_SUPERVISOR(?:_ARGV)?<\/key>/u.test(helperPlistText);
  const systemHelperRunning = helper?.transport === "system-helper"
    && Number(helper?.protocolVersion) === 1 && processExists(helper?.pid);
  const systemHelperVersion = systemHelperRunning
    ? strictSemverOrNull(helper?.packageVersion) : null;
  const codexSettings = jsonOrNull(path.join(codexHome, "hooks.json"));
  const codexInstalledEvents = CODEX_REQUIRED_EVENTS.filter((event) =>
    (codexSettings?.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? [])
      .some((hook) => isOutsiderCodexAttachedCommand(hook.command))));
  let codexConfig = "";
  try { codexConfig = readFileSync(path.join(codexHome, "config.toml"), "utf8"); }
  catch { /* not configured */ }
  const marketplace = configuredTomlSection(codexConfig, "marketplaces.outsider");
  const installedPlugin = configuredTomlSection(codexConfig,
    'plugins."outsider-stage05@outsider"');
  const cachedPlugin = codexPluginCacheManifest(codexHome);
  const codex = lastByHost("codex");
  const codexLedgerCompletionCandidate = Boolean(codex?.completedRuns?.some((run) =>
    run.proofComplete === true || run.deliveryComplete === true));
  /* A completed attached-kernel run is not a Codex host-control proof.  Codex
     control additionally requires the source-replayed app-server / hook item /
     signed controller assessment in outsider-codex-control-evidence.js.  The
     product doctor does not currently ingest those sources, so it must remain
     false instead of laundering a session-ledger boolean into control. */
  const codexControlled = false;
  const nativeControlled = verifiedAttachedCompletion(native, "claude-code");
  const coworkControlled = verifiedAttachedCompletion(cowork, "claude-desktop");
  const coworkVerifiedDelivery = verifiedAttachedCompletion(cowork, "claude-desktop", {
    terminalClasses: ["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED"],
  });
  const runtimeVersion = productVersion();
  const pluginVersionMatchesRuntime = cachedPlugin?.version === runtimeVersion;
  const universalManifest = jsonOrNull(path.join(root, "plugins", "outsider-stage05",
    ".codex-plugin", "plugin.json"));
  return {
    nativeClaudeCode: {
      installed: installedEvents.length === ATTACHED_EVENTS.length,
      installedEvents,
      installationScopes,
      requiredEvents: ATTACHED_EVENTS,
      runtimeConformanceSeen: Boolean(native),
      controlledRunSeen: nativeControlled,
      controlEvidenceVerification: nativeControlled
        ? "FULL_STAGE05_RUN_DIRECTORY_VERIFIED" : "NOT_ESTABLISHED",
      lastSeenAt: native?.updatedAt ?? null,
    },
    desktopCode: {
      installed: installedEvents.length === ATTACHED_EVENTS.length,
      installationScopes,
      transport: "Claude Desktop Code uses native Claude Code settings",
      runtimeConformanceSeen: Boolean(native),
      controlledRunSeen: nativeControlled,
      controlEvidenceVerification: nativeControlled
        ? "FULL_STAGE05_RUN_DIRECTORY_VERIFIED" : "NOT_ESTABLISHED",
      lastSeenAt: native?.updatedAt ?? null,
    },
    desktopCowork: {
      pluginPackaged: existsSync(path.join(root, ".claude-plugin", "plugin.json"))
        && existsSync(path.join(root, "hooks", "hooks.json")),
      runtimeConformanceSeen: Boolean(cowork),
      controlledRunSeen: coworkControlled,
      verifiedDeliverySeen: coworkVerifiedDelivery,
      controlEvidenceVerification: coworkControlled
        ? "FULL_STAGE05_RUN_DIRECTORY_VERIFIED" : "NOT_ESTABLISHED",
      systemHelperInstalled: existsSync(helperPlist),
      systemHelperRunning,
      systemHelperVersion,
      systemHelperVersionMatchesRuntime: systemHelperRunning
        ? systemHelperVersion === runtimeVersion : false,
      systemHelperDescriptor: systemHelperRunning ? path.join(attachedRoot, "daemon.json") : null,
      externalSupervisorConfigured: helperExternalSupervisorConfigured,
      supervisorMode: helperExternalSupervisorConfigured
        ? "explicit-external-consented" : "local-only-no-external",
      lastSeenAt: cowork?.updatedAt ?? null,
      note: "Cowork hooks are thin clients to the explicit system helper; ordinary Chat has no hooks",
    },
    codex: {
      repoMarketplaceConfigured: Object.keys(marketplace).length > 0,
      pluginConfigured: installedPlugin.enabled === "true",
      pluginCached: Boolean(cachedPlugin),
      pluginVersion: cachedPlugin?.version ?? null,
      runtimeVersion,
      pluginVersionMatchesRuntime,
      companionRuntimeInstalled: existsSync(path.join(root, "bin", "outsider-hook.mjs")),
      hooksConfigured: codexInstalledEvents.length === CODEX_REQUIRED_EVENTS.length,
      installedEvents: codexInstalledEvents,
      requiredEvents: CODEX_REQUIRED_EVENTS,
      hookTrustStatus: "UNKNOWN_REQUIRES_CODEX_HOOKS_REVIEW",
      runtimeConformanceSeen: Boolean(codex),
      ledgerCompletionCandidateSeen: codexLedgerCompletionCandidate,
      controlledRunSeen: codexControlled,
      controlAssessmentVerification: "NOT_EVALUATED_USE_SOURCE_BOUND_CODEX_CONTROL_PROBE",
      lastSeenAt: codex?.updatedAt ?? null,
      hostedAndSpecializedToolCoverageEstablished: false,
      completeLifecycleCoverageEstablished: false,
      status: codexControlled ? "CONTROLLED_RUN_SEEN"
        : codex ? "RUNTIME_SEEN_CONTROL_NOT_ESTABLISHED"
          : "INSTALLABLE_OR_CONFIGURED_RUNTIME_NOT_SEEN",
    },
    chatgpt: {
      universalPluginPackagePresent: universalManifest?.name === "outsider-stage05",
      packagedPluginVersion: strictSemverOrNull(universalManifest?.version),
      localOrRepoMarketplaceAvailabilityDependsOnAccountAndWorkspacePolicy: true,
      livePluginInstallSeen: false,
      newChatSkillEvaluationSeen: false,
      globalLifecycleInterceptionEstablished: false,
      controlledStage05Established: false,
      status: "PACKAGE_PRESENT_LIVE_CHATGPT_INSTALL_NOT_ESTABLISHED",
    },
  };
}

export function runProductDoctor({
  workerExecutable = null,
  stateRoot = defaultStateRoot(),
  attachedRoot = defaultAttachedRoot(),
  home = homedir(),
  codexHome = process.env.CODEX_HOME || path.join(home, ".codex"),
  projectRoot = process.cwd(),
  workerPreflight = preflightWorkerCli,
} = {}) {
  const worker = resolveClaudeExecutable(workerExecutable);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const checks = {
    node: { ok: nodeMajor >= 20, detail: `Node ${process.versions.node} (required >=20)` },
    platform: { ok: process.platform !== "win32",
      detail: `${process.platform}/${process.arch}; local IPC uses Unix socket with authenticated loopback fallback` },
    package: { ok: existsSync(path.join(root, "bin", "outsider-hook.mjs"))
      && existsSync(path.join(root, "bin", "outsider-controller-host.mjs"))
      && existsSync(path.join(root, "bin", "outsider-attached-daemon.mjs")),
    detail: `outsider-guard ${productVersion()}` },
    persistentState: writableStateCheck(stateRoot),
    claudeProtocolAndAuth: { ...workerPreflight(worker),
      requiredForGlobalDiagnostic: false,
      requiredForSurfaces: ["nativeClaudeCode", "desktopCode", "desktopCowork"] },
  };
  const surfaces = attachedSurfaceStatus(attachedRoot, { home, codexHome, projectRoot });
  const coreChecks = Object.entries(checks)
    .filter(([, check]) => check.requiredForGlobalDiagnostic !== false);
  const diagnosticOperational = coreChecks.every(([, check]) => check.ok === true);
  const controlledSurfaceEstablished = surfaces.codex.controlledRunSeen === true
    || surfaces.desktopCowork.controlledRunSeen === true
    || surfaces.nativeClaudeCode.controlledRunSeen === true
    || surfaces.desktopCode.controlledRunSeen === true;
  return {
    schema: "outsider/product-doctor/v2",
    ok: diagnosticOperational,
    version: productVersion(),
    mode: "MULTI_SURFACE_STAGE05_DIAGNOSTIC",
    worker,
    supervisorDefault: "none; explicit command plus disclosure consent required",
    stateRoot,
    existingRuns: listProductRuns(stateRoot).length,
    attachedRoot,
    surfaces,
    readiness: {
      diagnosticOperational,
      claudeProtocolAndAuthReady: checks.claudeProtocolAndAuth.ok === true,
      codexPluginAndHooksConfigured: surfaces.codex.repoMarketplaceConfigured === true
        && surfaces.codex.pluginConfigured === true
        && surfaces.codex.pluginCached === true
        && surfaces.codex.pluginVersionMatchesRuntime === true
        && surfaces.codex.hooksConfigured === true,
      anyControlledSurfaceEstablished: controlledSurfaceEstablished,
      chatgptLiveInstallEstablished: surfaces.chatgpt.livePluginInstallSeen === true,
    },
    checks,
  };
}

export function projectProductDoctorForSharing(report) {
  const surfaces = report?.surfaces ?? {};
  const native = surfaces.nativeClaudeCode ?? {};
  const desktop = surfaces.desktopCode ?? {};
  const cowork = surfaces.desktopCowork ?? {};
  const codex = surfaces.codex ?? {};
  const chatgpt = surfaces.chatgpt ?? {};
  return {
    schema: "outsider/product-doctor-share/v1",
    ok: report?.ok === true,
    version: trustedCurrentVersionOrNull(report?.version),
    mode: report?.mode ?? null,
    surfaces: {
      nativeClaudeCode: {
        installed: native.installed === true,
        installedEventCount: Array.isArray(native.installedEvents) ? native.installedEvents.length : 0,
        requiredEventCount: Array.isArray(native.requiredEvents) ? native.requiredEvents.length : 0,
        runtimeConformanceSeen: native.runtimeConformanceSeen === true,
        controlledRunSeen: native.controlledRunSeen === true,
        controlEvidenceVerification: native.controlEvidenceVerification ?? "NOT_ESTABLISHED",
      },
      desktopCode: {
        installed: desktop.installed === true,
        runtimeConformanceSeen: desktop.runtimeConformanceSeen === true,
        controlledRunSeen: desktop.controlledRunSeen === true,
        controlEvidenceVerification: desktop.controlEvidenceVerification ?? "NOT_ESTABLISHED",
      },
      desktopCowork: {
        pluginPackaged: cowork.pluginPackaged === true,
        runtimeConformanceSeen: cowork.runtimeConformanceSeen === true,
        controlledRunSeen: cowork.controlledRunSeen === true,
        verifiedDeliverySeen: cowork.verifiedDeliverySeen === true,
        controlEvidenceVerification: cowork.controlEvidenceVerification ?? "NOT_ESTABLISHED",
        systemHelperInstalled: cowork.systemHelperInstalled === true,
        systemHelperRunning: cowork.systemHelperRunning === true,
        systemHelperVersion: trustedCurrentVersionOrNull(cowork.systemHelperVersion),
        systemHelperVersionMatchesRuntime: cowork.systemHelperVersionMatchesRuntime === true,
        externalSupervisorConfigured: cowork.externalSupervisorConfigured === true,
        supervisorMode: cowork.supervisorMode ?? null,
      },
      codex: {
        repoMarketplaceConfigured: codex.repoMarketplaceConfigured === true,
        pluginConfigured: codex.pluginConfigured === true,
        pluginCached: codex.pluginCached === true,
        pluginVersion: trustedCurrentVersionOrNull(codex.pluginVersion),
        runtimeVersion: trustedCurrentVersionOrNull(codex.runtimeVersion),
        pluginVersionMatchesRuntime: codex.pluginVersionMatchesRuntime === true,
        companionRuntimeInstalled: codex.companionRuntimeInstalled === true,
        hooksConfigured: codex.hooksConfigured === true,
        installedEventCount: Array.isArray(codex.installedEvents) ? codex.installedEvents.length : 0,
        requiredEventCount: Array.isArray(codex.requiredEvents) ? codex.requiredEvents.length : 0,
        hookTrustStatus: codex.hookTrustStatus ?? "UNKNOWN",
        runtimeConformanceSeen: codex.runtimeConformanceSeen === true,
        ledgerCompletionCandidateSeen: codex.ledgerCompletionCandidateSeen === true,
        controlledRunSeen: codex.controlledRunSeen === true,
        controlAssessmentVerification: codex.controlAssessmentVerification ?? "NOT_ESTABLISHED",
        hostedAndSpecializedToolCoverageEstablished:
          codex.hostedAndSpecializedToolCoverageEstablished === true,
        completeLifecycleCoverageEstablished: codex.completeLifecycleCoverageEstablished === true,
        status: codex.status ?? null,
      },
      chatgpt: {
        universalPluginPackagePresent: chatgpt.universalPluginPackagePresent === true,
        packagedPluginVersion: trustedCurrentVersionOrNull(chatgpt.packagedPluginVersion),
        localOrRepoMarketplaceAvailabilityDependsOnAccountAndWorkspacePolicy:
          chatgpt.localOrRepoMarketplaceAvailabilityDependsOnAccountAndWorkspacePolicy === true,
        livePluginInstallSeen: chatgpt.livePluginInstallSeen === true,
        newChatSkillEvaluationSeen: chatgpt.newChatSkillEvaluationSeen === true,
        globalLifecycleInterceptionEstablished: chatgpt.globalLifecycleInterceptionEstablished === true,
        controlledStage05Established: chatgpt.controlledStage05Established === true,
        status: chatgpt.status ?? null,
      },
    },
    readiness: {
      diagnosticOperational: report?.readiness?.diagnosticOperational === true,
      claudeProtocolAndAuthReady: report?.readiness?.claudeProtocolAndAuthReady === true,
      codexPluginAndHooksConfigured: report?.readiness?.codexPluginAndHooksConfigured === true,
      anyControlledSurfaceEstablished: report?.readiness?.anyControlledSurfaceEstablished === true,
      chatgptLiveInstallEstablished: report?.readiness?.chatgptLiveInstallEstablished === true,
    },
    checks: {
      node: report?.checks?.node?.ok === true,
      platform: report?.checks?.platform?.ok === true,
      package: report?.checks?.package?.ok === true,
      persistentState: report?.checks?.persistentState?.ok === true,
      claudeProtocolAndAuth: report?.checks?.claudeProtocolAndAuth?.ok === true,
    },
    privacy: {
      rawPathsIncluded: false,
      rawErrorsIncluded: false,
      rawPromptsOrSourceIncluded: false,
    },
  };
}
