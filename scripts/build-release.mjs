#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stageClaudeHostedPlugin, validateClaudeHostedPluginLayout } from "./claude-plugin-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const output = path.join(root, "dist");
mkdirSync(output, { recursive: true });

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
  return result.stdout;
}

run(process.execPath, ["--check", "bin/outsider.mjs"]);
run(process.execPath, ["--check", "bin/outsider-run.mjs"]);
run(process.execPath, ["--check", "bin/outsider-attached-daemon.mjs"]);
run(process.execPath, ["--check", "integrations/deepseek-harness-outsider-plugin/index.js"]);
run(process.execPath, ["--check", "scripts/stage05-deepseek-harness-canary.mjs"]);
run("npm", ["test"]);
run("npm", ["run", "test:corpus"]);
const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", output]));
const filename = packed[0]?.filename;
if (!filename) throw new Error("RELEASE_PACK_FILENAME_MISSING");
const artifact = path.join(output, filename);
const pluginArtifact = path.join(output, `${pkg.name}-${pkg.version}-claude.plugin.zip`);
if (existsSync(pluginArtifact)) rmSync(pluginArtifact);
const verifyRoot = mkdtempSync(path.join(tmpdir(), "outsider-release-verify-"));
try {
  const pluginStage = path.join(verifyRoot, "claude-plugin");
  stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: pluginStage });
  run(process.execPath, ["--check", "runtime/bin/outsider-hook.mjs"], pluginStage);
  run(process.execPath, ["--check", "runtime/bin/outsider-attached-daemon.mjs"], pluginStage);
  run(process.execPath, ["--check", "runtime/bin/outsider-controller-host.mjs"], pluginStage);
  const hookSmoke = spawnSync(process.execPath,
    ["runtime/bin/outsider-hook.mjs", "codex"], {
      cwd: pluginStage, encoding: "utf8", input: JSON.stringify({ hook_event_name: "SessionStart" }),
    });
  if (hookSmoke.status !== 0 || JSON.parse(hookSmoke.stdout || "null") == null) {
    throw new Error(`CLAUDE_PLUGIN_HOOK_SMOKE_FAILED:${hookSmoke.stderr || hookSmoke.stdout}`);
  }
  run("zip", ["-qr", pluginArtifact, ".claude-plugin", "hooks", "runtime"], pluginStage);
  run("unzip", ["-tq", pluginArtifact]);
  const pluginExtracted = path.join(verifyRoot, "claude-plugin-extracted");
  mkdirSync(pluginExtracted, { recursive: true });
  run("unzip", ["-q", pluginArtifact, "-d", pluginExtracted]);
  const hostedReport = validateClaudeHostedPluginLayout(pluginExtracted);
  if (!hostedReport.ok) {
    throw new Error(`CLAUDE_PLUGIN_ARCHIVE_INVALID:${hostedReport.errors.join(",")}`);
  }
  run("tar", ["-xzf", artifact, "-C", verifyRoot]);
  const extracted = path.join(verifyRoot, "package");
  run(process.execPath, ["bin/outsider.mjs", "--version"], extracted);
  run(process.execPath, ["bin/outsider.mjs", "help"], extracted);
  run("npm", ["test"], extracted);
  run("npm", ["run", "test:corpus"], extracted);
} finally {
  rmSync(verifyRoot, { recursive: true, force: true });
}
process.stdout.write(`${JSON.stringify({ ok: true, package: pkg.name, version: pkg.version,
  artifact, claudeDesktopPlugin: pluginArtifact }, null, 2)}\n`);
