import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { validateOpenAIUniversalPlugin } from "../scripts/openai-universal-plugin-validate.mjs";

const ROOT = path.resolve(".");
const PLUGIN = path.join(ROOT, "plugins", "outsider-stage05");

test("OpenAI universal plugin is marketplace-wired and surface-honest", () => {
  assert.deepEqual(validateOpenAIUniversalPlugin({ root: ROOT }), {
    ok: true, errors: [], plugin: "outsider-stage05", version: "1.3.98", memberCount: 6,
    chatgptGlobalLifecycleInterceptionEstablished: false,
    codexControlledByInstallationAlone: false,
  });
  const manifest = JSON.parse(readFileSync(path.join(PLUGIN,
    ".codex-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(readFileSync(path.join(ROOT,
    ".agents", "plugins", "marketplace.json"), "utf8"));
  assert.equal(manifest.name, "outsider-stage05");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.version, "1.3.98");
  assert.match(manifest.interface.longDescription, /companion runtime/i);
  assert.match(manifest.interface.longDescription, /full control/i);
  assert.deepEqual(manifest.interface.defaultPrompt, [
    "Use Outsider Stage 0.5 to check this surface's installation and control status without upgrading any unsupported capability.",
  ]);
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].source.path, "./plugins/outsider-stage05");
  assert.equal(marketplace.plugins[0].policy.installation, "AVAILABLE");
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
});

test("universal plugin validator executes through a symlinked script path", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-universal-validator-link-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const alias = path.join(temporary, "validator.mjs");
  symlinkSync(path.join(ROOT, "scripts", "openai-universal-plugin-validate.mjs"), alias);
  const result = spawnSync(process.execPath, [alias], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("universal plugin validator enforces the official defaultPrompt array contract", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-universal-plugin-prompt-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  for (const relative of ["package.json", "LICENSE", ".agents/plugins/marketplace.json",
    ...[".codex-plugin/plugin.json", "LICENSE", "README.md", "hooks/hooks.json",
      "scripts/surface-boundary.mjs", "skills/outsider-stage05/SKILL.md"]
      .map((item) => `plugins/outsider-stage05/${item}`)]) {
    const target = path.join(temporary, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(ROOT, relative), target);
  }
  const manifestPath = path.join(temporary, "plugins", "outsider-stage05",
    ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.interface.defaultPrompt = "not-an-array";
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = validateOpenAIUniversalPlugin({ root: temporary });
  assert.equal(result.ok, false);
  assert(result.errors.includes("PLUGIN_MANIFEST_CONTRACT_INVALID"));
});

test("universal plugin validator rejects unmanifested plugin files", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-universal-plugin-extra-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  for (const relative of ["package.json", "LICENSE", ".agents/plugins/marketplace.json",
    ...[".codex-plugin/plugin.json", "LICENSE", "README.md", "hooks/hooks.json",
      "scripts/surface-boundary.mjs", "skills/outsider-stage05/SKILL.md"]
      .map((item) => `plugins/outsider-stage05/${item}`)]) {
    const target = path.join(temporary, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(ROOT, relative), target);
  }
  const extra = path.join(temporary, "plugins", "outsider-stage05", "unreviewed.txt");
  copyFileSync(path.join(ROOT, "LICENSE"), extra);
  const result = validateOpenAIUniversalPlugin({ root: temporary });
  assert.equal(result.ok, false);
  assert(result.errors.includes("PLUGIN_ACTUAL_MEMBER_SET_INVALID"));
  writeFileSync(path.join(temporary, "plugins", "outsider-stage05", "LICENSE"),
    "license drift\n");
  const licenseDrift = validateOpenAIUniversalPlugin({ root: temporary });
  assert(licenseDrift.errors.includes("PLUGIN_LICENSE_MISMATCH"));
});

test("plugin skill refuses ChatGPT and Codex control overclaims", () => {
  const skill = readFileSync(path.join(PLUGIN, "skills", "outsider-stage05",
    "SKILL.md"), "utf8");
  assert.match(skill, /ordinary ChatGPT conversations are not\s+globally intercepted/i);
  assert.match(skill, /hosted tools and specialized paths may not traverse/i);
  assert.match(skill, /exact current hook hash/i);
  assert.match(skill, /do not bypass hook trust/i);
  assert.match(skill, /Never request API keys/i);
});

test("Codex plugin hook reports a boundary notice without claiming control", () => {
  const hooks = JSON.parse(readFileSync(path.join(PLUGIN, "hooks", "hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(hooks.hooks), ["SessionStart"]);
  const command = hooks.hooks.SessionStart[0].hooks[0].command;
  assert.match(command, /^node "\$\{PLUGIN_ROOT\}\/scripts\/surface-boundary\.mjs"$/);
  const result = spawnSync(process.execPath,
    [path.join(PLUGIN, "scripts", "surface-boundary.mjs")], {
      cwd: ROOT,
      input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
      encoding: "utf8",
    });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext,
    /Plugin discovery alone is not Stage 0\.5 control/);
  assert.match(output.hookSpecificOutput.additionalContext, /hosted tools/);
  assert.match(output.hookSpecificOutput.additionalContext, /doctor --share-json/);
  assert.match(output.hookSpecificOutput.additionalContext, /raw doctor --json local/);
  assert.doesNotMatch(result.stdout, /permissionDecision|decision.*allow/i);
});
