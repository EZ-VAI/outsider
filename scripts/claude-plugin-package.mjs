import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const HOSTED_ENTRIES = [
  "outsider-hook.mjs",
  "outsider-attached-daemon.mjs",
  "outsider-controller-host.mjs",
];

function walk(root, relative = "") {
  const directory = path.join(root, relative);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? [child, ...walk(root, child)] : [child];
  });
}

export function validateClaudeHostedPluginLayout(pluginRoot) {
  const errors = [];
  if (existsSync(path.join(pluginRoot, "bin"))) {
    errors.push("TOP_LEVEL_BIN_FORBIDDEN");
  }
  for (const required of [".claude-plugin/plugin.json", "hooks/hooks.json"]) {
    if (!existsSync(path.join(pluginRoot, required))) errors.push(`MISSING:${required}`);
  }
  for (const relative of walk(pluginRoot)) {
    if (lstatSync(path.join(pluginRoot, relative)).isSymbolicLink()) {
      errors.push(`SYMLINK_FORBIDDEN:${relative}`);
    }
  }
  let hooks = null;
  try { hooks = JSON.parse(readFileSync(path.join(pluginRoot, "hooks/hooks.json"), "utf8")); }
  catch (error) { errors.push(`HOOKS_INVALID_JSON:${error?.message ?? error}`); }
  const commands = Object.values(hooks?.hooks ?? {}).flatMap((matchers) => matchers ?? [])
    .flatMap((matcher) => matcher?.hooks ?? []).map((hook) => String(hook?.command ?? ""));
  if (!commands.length) errors.push("NO_DECLARED_HOOK_COMMANDS");
  for (const command of commands) {
    if (command.includes("${CLAUDE_PLUGIN_ROOT}/bin/")) {
      errors.push(`TOP_LEVEL_BIN_REFERENCE:${command}`);
    }
    const match = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"']+)/);
    if (!match) errors.push(`HOOK_ENTRY_NOT_PLUGIN_ROOTED:${command}`);
    else if (!existsSync(path.join(pluginRoot, match[1]))) {
      errors.push(`HOOK_ENTRY_MISSING:${match[1]}`);
    }
  }
  for (const entry of HOSTED_ENTRIES) {
    if (!existsSync(path.join(pluginRoot, "runtime", "bin", entry))) {
      errors.push(`RUNTIME_ENTRY_MISSING:${entry}`);
    }
  }
  return { ok: errors.length === 0, errors, commands,
    topLevel: readdirSync(pluginRoot).sort() };
}

export function stageClaudeHostedPlugin({ sourceRoot, targetRoot }) {
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(path.join(targetRoot, "hooks"), { recursive: true });
  mkdirSync(path.join(targetRoot, "runtime", "bin"), { recursive: true });
  cpSync(path.join(sourceRoot, ".claude-plugin"), path.join(targetRoot, ".claude-plugin"),
    { recursive: true });
  cpSync(path.join(sourceRoot, "src"), path.join(targetRoot, "runtime", "src"),
    { recursive: true });
  for (const entry of HOSTED_ENTRIES) {
    cpSync(path.join(sourceRoot, "bin", entry), path.join(targetRoot, "runtime", "bin", entry));
  }
  const sourcePackage = JSON.parse(readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  const runtimePackage = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: true,
    type: "module",
    engines: sourcePackage.engines,
  };
  writeFileSync(path.join(targetRoot, "runtime", "package.json"),
    `${JSON.stringify(runtimePackage, null, 2)}\n`);
  const hooks = JSON.parse(readFileSync(path.join(sourceRoot, "hooks", "hooks.json"), "utf8"));
  for (const matchers of Object.values(hooks.hooks ?? {})) {
    for (const matcher of matchers ?? []) {
      for (const hook of matcher?.hooks ?? []) {
        if (typeof hook.command === "string") {
          hook.command = hook.command.replaceAll("${CLAUDE_PLUGIN_ROOT}/bin/",
            "${CLAUDE_PLUGIN_ROOT}/runtime/bin/");
        }
      }
    }
  }
  writeFileSync(path.join(targetRoot, "hooks", "hooks.json"),
    `${JSON.stringify(hooks, null, 2)}\n`);
  const report = validateClaudeHostedPluginLayout(targetRoot);
  if (!report.ok) throw new Error(`CLAUDE_HOSTED_PLUGIN_INVALID:${report.errors.join(",")}`);
  return report;
}

export const claudeHostedRuntimeEntries = Object.freeze([...HOSTED_ENTRIES]);
