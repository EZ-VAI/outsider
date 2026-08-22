#!/usr/bin/env node
/* Zero-model Codex capability probe.
 *
 * It asks the installed binary to generate its protocol schema and calls the
 * local app-server `hooks/list` endpoint.  It does not start a thread, send a
 * prompt, bypass hook trust, or invoke a model.  The emitted probe is replayed
 * against the exact binary, generated schema, and hooks/list response.  A live
 * source event chain is still required separately before control is claimable.
 */

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  codexHookMetadataFromList, codexHookSchemaCapabilities,
  createCodexHookCapabilityProbe, createCodexWorkerObservation,
  readCodexRolloutSnapshot,
  verifyCodexHookCapabilityProbe,
} from "../src/outsider-codex-worker-adapter.js";
import { assessCodexStage05Control } from "../src/outsider-codex-control-evidence.js";
import { workerDigest } from "../src/outsider-worker-adapter.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const codex = valueAfter("--codex") ?? "codex";
const cwd = path.resolve(valueAfter("--cwd") ?? root);
const output = path.resolve(valueAfter("--out")
  ?? path.join(root, "artifacts", "codex-worker-capability-probe.json"));
const observationOutput = valueAfter("--observation-out")
  ? path.resolve(valueAfter("--observation-out")) : null;
const sessionPath = valueAfter("--session") ? path.resolve(valueAfter("--session")) : null;

function command(args, options = {}) {
  const result = spawnSync(codex, args, { encoding: "utf8", timeout: 30_000, ...options });
  if (result.status !== 0) throw new Error(`CODEX_COMMAND_FAILED:${args.join(" ")}:${
    String(result.stderr ?? "").slice(-300)}`);
  return result.stdout;
}

function locateNativeBinary() {
  const found = spawnSync("/usr/bin/which", [codex], { encoding: "utf8" });
  if (found.status !== 0) throw new Error("CODEX_EXECUTABLE_NOT_FOUND");
  const launcher = realpathSync(found.stdout.trim());
  if (!launcher.endsWith(".js")) return launcher;
  const require = createRequire(launcher);
  const platformPackage = process.platform === "darwin"
    ? (process.arch === "arm64" ? "@openai/codex-darwin-arm64" : "@openai/codex-darwin-x64")
    : process.platform === "linux"
      ? (process.arch === "arm64" ? "@openai/codex-linux-arm64" : "@openai/codex-linux-x64")
      : (process.arch === "arm64" ? "@openai/codex-win32-arm64" : "@openai/codex-win32-x64");
  const packageFile = require.resolve(`${platformPackage}/package.json`);
  const triple = process.platform === "darwin"
    ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`
    : process.platform === "linux"
      ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-musl`
      : `${process.arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`;
  const native = path.join(path.dirname(packageFile), "vendor", triple, "bin",
    process.platform === "win32" ? "codex.exe" : "codex");
  if (!existsSync(native)) throw new Error("CODEX_NATIVE_BINARY_NOT_FOUND");
  return native;
}

function hooksList() {
  return new Promise((resolve, reject) => {
    const child = spawn(codex, ["app-server", "--stdio"], {
      cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env,
    });
    let stdout = "", stderr = "", settled = false;
    const timer = setTimeout(() => finish(new Error("CODEX_HOOKS_LIST_TIMEOUT")), 20_000);
    const finish = (error, value = null) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      child.kill("SIGTERM");
      if (error) reject(error); else resolve(value);
    };
    const consume = () => {
      let newline;
      while ((newline = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && message.result) {
          child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
          child.stdin.write(`${JSON.stringify({ id: 2, method: "hooks/list",
            params: { cwds: [cwd] } })}\n`);
        }
        if (message.id === 2) {
          if (message.error) finish(new Error(`CODEX_HOOKS_LIST_ERROR:${JSON.stringify(message.error)}`));
          else finish(null, message.result);
        }
      }
    };
    child.stdout.on("data", (chunk) => { stdout += chunk; consume(); });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", finish);
    child.on("exit", (code) => {
      if (!settled) finish(new Error(`CODEX_APP_SERVER_EXIT:${code}:${stderr.slice(-300)}`));
    });
    child.stdin.write(`${JSON.stringify({ id: 1, method: "initialize", params: {
      clientInfo: { name: "outsider-zero-model-probe", version: "1" },
      capabilities: { experimentalApi: true },
    } })}\n`);
  });
}

const versionText = command(["--version"]).trim();
const binaryVersion = versionText.replace(/^codex-cli\s+/, "");
const nativeBinary = locateNativeBinary();
const binarySha256 = workerDigest(readFileSync(nativeBinary));
const schemaDir = mkdtempSync(path.join(tmpdir(), "outsider-codex-hook-schema-"));
command(["app-server", "generate-json-schema", "--experimental", "--out", schemaDir]);
const schemaPath = path.join(schemaDir, "codex_app_server_protocol.v2.schemas.json");
const schemaBytes = readFileSync(schemaPath);
const appServerSchemaPath = path.join(schemaDir, "codex_app_server_protocol.schemas.json");
const appServerSchemaBytes = readFileSync(appServerSchemaPath);
const { eventNames, outputEntryKinds } = codexHookSchemaCapabilities(schemaBytes);
const listed = await hooksList();
const configuredHooks = codexHookMetadataFromList(listed);
const probe = createCodexHookCapabilityProbe({
  binaryVersion,
  binarySha256,
  schemaBundleHash: workerDigest(schemaBytes),
  eventNames,
  outputEntryKinds,
  configuredHooks,
});
const replayed = verifyCodexHookCapabilityProbe(probe, {
  binaryBytes: readFileSync(nativeBinary), schemaBytes, hooksList: listed,
});
if (!replayed.ok || replayed.verificationMode !== "FULL_LOCAL_METADATA_REPLAY") {
  throw new Error(`CODEX_HOOK_PROBE_REPLAY_FAILED:${replayed.error ?? "MODE"}`);
}
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(probe, null, 2)}\n`, { mode: 0o600 });
writeFileSync(`${output}.schema.json`, schemaBytes, { mode: 0o600 });
writeFileSync(`${output}.app-server-schema.json`, appServerSchemaBytes, { mode: 0o600 });
writeFileSync(`${output}.hooks-list.json`, `${JSON.stringify(listed, null, 2)}\n`, { mode: 0o600 });
const controlAssessment = assessCodexStage05Control({ hookProbe: probe,
  binaryBytes: readFileSync(nativeBinary), schemaBytes, appServerSchemaBytes,
  hooksList: listed });
writeFileSync(`${output}.control-readiness.json`,
  `${JSON.stringify(controlAssessment, null, 2)}\n`, { mode: 0o600 });

let observation = null;
if (sessionPath && observationOutput) {
  const bytes = readCodexRolloutSnapshot(sessionPath);
  observation = createCodexWorkerObservation(bytes, { hookProbe: probe,
    hookProbeSources: { binaryBytes: readFileSync(nativeBinary), schemaBytes, hooksList: listed },
  });
  mkdirSync(path.dirname(observationOutput), { recursive: true });
  writeFileSync(observationOutput, `${JSON.stringify(observation, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(`${JSON.stringify({ ok: true, invokedModel: false,
  bypassedHookTrust: false, output, recordHash: probe.recordHash,
  metadataVerificationMode: replayed.verificationMode,
  replaySources: { nativeBinary, schema: `${output}.schema.json`,
    appServerSchema: `${output}.app-server-schema.json`,
    hooksList: `${output}.hooks-list.json` },
  candidateControlLevel: probe.assessment.candidateControlLevel,
  claimableControlLevel: probe.assessment.claimableControlLevel,
  stage05ControlLevel: controlAssessment.controlLevel,
  stage05MissingRequirements: controlAssessment.missingRequirements,
  controlReadiness: `${output}.control-readiness.json`,
  installedHooks: probe.configuredHooks.map((hook) => ({ eventName: hook.eventName,
    enabled: hook.enabled, trustStatus: hook.trustStatus })),
  observation: observation && { output: observationOutput,
    recordHash: observation.recordHash, complete: observation.integrity.complete,
    controlLevel: observation.capabilityHandshake.controlLevel,
    nativeEvents: observation.source.nativeEventCount,
    normalizedEvents: observation.events.length },
}, null, 2)}\n`);
