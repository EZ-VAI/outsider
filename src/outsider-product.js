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
  "SubagentStart", "SubagentStop", "PreCompact", "Stop", "SessionEnd"];

function attachedSurfaceStatus(attachedRoot = defaultAttachedRoot()) {
  const settings = jsonOrNull(path.join(homedir(), ".claude", "settings.json"));
  const installedEvents = ATTACHED_EVENTS.filter((event) =>
    (settings?.hooks?.[event] ?? []).some((entry) => (entry.hooks ?? [])
      .some((hook) => /outsider-hook/.test(String(hook.command ?? "")))));
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
  const helperPlist = path.join(homedir(), "Library", "LaunchAgents", "ai.outsider.stage05.plist");
  const systemHelperRunning = helper?.transport === "system-helper"
    && Number(helper?.protocolVersion) === 1 && processExists(helper?.pid);
  return {
    nativeClaudeCode: {
      installed: installedEvents.length === ATTACHED_EVENTS.length,
      installedEvents,
      requiredEvents: ATTACHED_EVENTS,
      runtimeConformanceSeen: Boolean(native),
      lastSeenAt: native?.updatedAt ?? null,
    },
    desktopCode: {
      installed: installedEvents.length === ATTACHED_EVENTS.length,
      transport: "Claude Desktop Code uses native Claude Code settings",
      runtimeConformanceSeen: Boolean(native),
      lastSeenAt: native?.updatedAt ?? null,
    },
    desktopCowork: {
      pluginPackaged: existsSync(path.join(root, ".claude-plugin", "plugin.json"))
        && existsSync(path.join(root, "hooks", "hooks.json")),
      runtimeConformanceSeen: Boolean(cowork),
      controlledRunSeen: Boolean(cowork?.completedRuns?.some((run) => run.proofComplete === true)),
      verifiedDeliverySeen: Boolean(cowork?.completedRuns?.some((run) =>
        run.proofComplete === true || run.deliveryComplete === true)),
      systemHelperInstalled: existsSync(helperPlist),
      systemHelperRunning,
      systemHelperVersion: systemHelperRunning ? helper.packageVersion ?? null : null,
      systemHelperDescriptor: systemHelperRunning ? path.join(attachedRoot, "daemon.json") : null,
      lastSeenAt: cowork?.updatedAt ?? null,
      note: "Cowork hooks are thin clients to the explicit system helper; ordinary Chat has no hooks",
    },
  };
}

export function runProductDoctor({
  workerExecutable = null,
  stateRoot = defaultStateRoot(),
  attachedRoot = defaultAttachedRoot(),
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
    claudeProtocolAndAuth: workerPreflight(worker),
  };
  return {
    schema: "outsider/product-doctor/v1",
    ok: Object.values(checks).every((check) => check.ok === true),
    version: productVersion(),
    mode: "CLAUDE_TRANSPARENT_ATTACHED_STAGE05",
    worker,
    supervisorDefault: "fresh isolated claude -p",
    stateRoot,
    existingRuns: listProductRuns(stateRoot).length,
    attachedRoot,
    surfaces: attachedSurfaceStatus(attachedRoot),
    checks,
  };
}
