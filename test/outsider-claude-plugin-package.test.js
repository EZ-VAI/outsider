import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { claudeHostedRuntimeEntries, stageClaudeHostedPlugin,
  validateClaudeHostedPluginLayout } from "../scripts/claude-plugin-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("hosted Claude plugin has no top-level bin and declares its runtime hook", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-hosted-plugin-"));
  try {
    const report = stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: temporary });
    assert.equal(report.ok, true);
    assert.equal(existsSync(path.join(temporary, "bin")), false);
    assert.deepEqual(report.topLevel, [".claude-plugin", "hooks", "runtime"]);
    const hooks = readFileSync(path.join(temporary, "hooks", "hooks.json"), "utf8");
    assert.match(hooks, /\$\{CLAUDE_PLUGIN_ROOT\}\/runtime\/bin\/outsider-hook\.mjs/);
    assert.doesNotMatch(hooks, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\//);
    assert.deepEqual(claudeHostedRuntimeEntries,
      ["outsider-hook.mjs", "outsider-attached-daemon.mjs", "outsider-controller-host.mjs"]);
    const runtimePackage = JSON.parse(readFileSync(path.join(temporary,
      "runtime", "package.json"), "utf8"));
    assert.equal(runtimePackage.bin, undefined);
    const smoke = spawnSync(process.execPath,
      [path.join(temporary, "runtime", "bin", "outsider-hook.mjs"), "codex"], {
        cwd: temporary,
        input: JSON.stringify({ hook_event_name: "SessionStart" }),
        encoding: "utf8",
      });
    assert.equal(smoke.status, 0, smoke.stderr);
    assert.deepEqual(JSON.parse(smoke.stdout), {});
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("hosted Claude plugin validator rejects the exact hidden PATH shape", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-hosted-plugin-bad-"));
  try {
    mkdirSync(path.join(temporary, "bin"));
    mkdirSync(path.join(temporary, ".claude-plugin"));
    mkdirSync(path.join(temporary, "hooks"));
    writeFileSync(path.join(temporary, ".claude-plugin", "plugin.json"), "{}\n");
    writeFileSync(path.join(temporary, "hooks", "hooks.json"), JSON.stringify({ hooks: {
      PreToolUse: [{ hooks: [{ type: "command",
        command: "node \"${CLAUDE_PLUGIN_ROOT}/bin/outsider-hook.mjs\"" }] }],
    } }));
    const report = validateClaudeHostedPluginLayout(temporary);
    assert.equal(report.ok, false);
    assert.ok(report.errors.includes("TOP_LEVEL_BIN_FORBIDDEN"));
    assert.ok(report.errors.some((error) => error.startsWith("TOP_LEVEL_BIN_REFERENCE:")));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
