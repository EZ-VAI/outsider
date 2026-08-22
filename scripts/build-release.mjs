#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stageClaudeHostedPlugin, validateClaudeHostedPluginLayout } from "./claude-plugin-package.mjs";
import { validateOpenAIUniversalPlugin } from "./openai-universal-plugin-validate.mjs";
import { stagePublicNpmPackage } from "./stage05-public-package.mjs";

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
run(process.execPath, ["--check", "bin/outsider-codex-app-server.mjs"]);
run(process.execPath, ["--check", "integrations/deepseek-harness-outsider-plugin/index.js"]);
run(process.execPath, ["--check", "scripts/stage05-deepseek-harness-canary.mjs"]);
const universalPlugin = validateOpenAIUniversalPlugin({ root });
if (!universalPlugin.ok) {
  throw new Error(`OPENAI_UNIVERSAL_PLUGIN_INVALID:${universalPlugin.errors.join(",")}`);
}
run("npm", ["test"]);
run("npm", ["run", "test:corpus"]);
const pluginArtifact = path.join(output, `${pkg.name}-${pkg.version}-claude.plugin.zip`);
if (existsSync(pluginArtifact)) rmSync(pluginArtifact);
const verifyRoot = mkdtempSync(path.join(tmpdir(), "outsider-release-verify-"));
try {
  const npmStage = path.join(verifyRoot, "public-npm-stage");
  const staged = stagePublicNpmPackage({ sourceRoot: root, targetRoot: npmStage });
  if (staged.package.private !== false
    || staged.manifest.excluded.localStages1Through4 !== true
    || staged.manifest.excluded.realityStewardshipResearch !== true
    || staged.manifest.excluded.rawAndCanonicalArtifacts !== true) {
    throw new Error("RELEASE_PUBLIC_PACKAGE_BOUNDARY_INVALID");
  }
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", output],
    npmStage));
  const filename = packed[0]?.filename;
  if (!filename) throw new Error("RELEASE_PACK_FILENAME_MISSING");
  const artifact = path.join(output, filename);
  const pluginStage = path.join(verifyRoot, "claude-plugin");
  const stagedPlugin = stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: pluginStage });
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
  run("zip", ["-q", "-X", pluginArtifact, ...stagedPlugin.archiveMembers], pluginStage);
  run("unzip", ["-tq", pluginArtifact]);
  const zippedMembers = run("unzip", ["-Z1", pluginArtifact]).trim().split("\n")
    .filter(Boolean).sort();
  if (JSON.stringify(zippedMembers) !== JSON.stringify(stagedPlugin.archiveMembers)) {
    throw new Error("CLAUDE_PLUGIN_ZIP_MEMBER_SET_MISMATCH");
  }
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
  process.stdout.write(`${JSON.stringify({ ok: true, package: pkg.name, version: pkg.version,
    artifact, claudeDesktopPlugin: pluginArtifact,
    openAIUniversalPlugin: path.join(root, "plugins", "outsider-stage05"),
    openAIRepoMarketplace: path.join(root, ".agents", "plugins", "marketplace.json"),
    chatgptGlobalLifecycleInterceptionEstablished: false,
    codexControlledByInstallationAlone: false,
    publicPackageMembers: staged.manifest.memberCount,
    localResearchExcluded: true }, null, 2)}\n`);
} finally {
  rmSync(verifyRoot, { recursive: true, force: true });
}
