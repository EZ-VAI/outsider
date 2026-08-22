#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..");
const EXPECTED_PLUGIN_FILES = Object.freeze([
  ".codex-plugin/plugin.json",
  "LICENSE",
  "README.md",
  "hooks/hooks.json",
  "scripts/surface-boundary.mjs",
  "skills/outsider-stage05/SKILL.md",
]);

function files(root, relative = "") {
  return readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const child = path.join(relative, entry.name);
      const full = path.join(root, child);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) return [`SYMLINK:${child}`];
      return stat.isDirectory() ? files(root, child) : [child.split(path.sep).join("/")];
    });
}

function exactKeys(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

export function validateOpenAIUniversalPlugin({ root = DEFAULT_ROOT } = {}) {
  const errors = [];
  const pluginRoot = path.join(root, "plugins", "outsider-stage05");
  let manifest;
  let marketplace;
  let hooks;
  let pkg;
  try { manifest = JSON.parse(readFileSync(path.join(pluginRoot,
    ".codex-plugin", "plugin.json"), "utf8")); }
  catch { errors.push("PLUGIN_MANIFEST_INVALID"); }
  try { marketplace = JSON.parse(readFileSync(path.join(root,
    ".agents", "plugins", "marketplace.json"), "utf8")); }
  catch { errors.push("MARKETPLACE_INVALID"); }
  try { hooks = JSON.parse(readFileSync(path.join(pluginRoot, "hooks", "hooks.json"), "utf8")); }
  catch { errors.push("PLUGIN_HOOKS_INVALID"); }
  try { pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")); }
  catch { errors.push("PACKAGE_INVALID"); }

  if (manifest && (!exactKeys(manifest, ["name", "version", "description", "author",
    "homepage", "repository", "license", "keywords", "skills", "interface"])
    || manifest.name !== "outsider-stage05" || manifest.version !== pkg?.version
    || manifest.skills !== "./skills/"
    || manifest.interface?.displayName !== "Outsider Stage 0.5"
    || !Array.isArray(manifest.interface?.defaultPrompt)
    || manifest.interface.defaultPrompt.length < 1
    || manifest.interface.defaultPrompt.length > 3
    || manifest.interface.defaultPrompt.some((prompt) => typeof prompt !== "string"
      || prompt.length < 1 || prompt.length > 128)
    || !String(manifest.interface?.longDescription ?? "").toLowerCase()
      .includes("full control still requires")
    || !String(manifest.interface?.privacyPolicyURL ?? "").startsWith("https://"))) {
    errors.push("PLUGIN_MANIFEST_CONTRACT_INVALID");
  }
  const entry = marketplace?.plugins?.[0];
  if (!exactKeys(marketplace, ["name", "interface", "plugins"])
    || marketplace.name !== "outsider" || marketplace.plugins?.length !== 1
    || entry?.name !== "outsider-stage05"
    || entry?.source?.source !== "local"
    || entry?.source?.path !== "./plugins/outsider-stage05"
    || entry?.policy?.installation !== "AVAILABLE"
    || entry?.policy?.authentication !== "ON_INSTALL") errors.push("MARKETPLACE_CONTRACT_INVALID");

  const handler = hooks?.hooks?.SessionStart?.[0]?.hooks?.[0];
  if (!exactKeys(hooks, ["description", "hooks"])
    || JSON.stringify(Object.keys(hooks?.hooks ?? {})) !== JSON.stringify(["SessionStart"])
    || hooks.hooks.SessionStart[0]?.matcher !== "startup|resume|clear|compact"
    || handler?.type !== "command"
    || handler?.command !== "node \"${PLUGIN_ROOT}/scripts/surface-boundary.mjs\""
    || handler?.timeout !== 5) errors.push("PLUGIN_HOOK_BOUNDARY_INVALID");

  try {
    const actual = files(pluginRoot).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...EXPECTED_PLUGIN_FILES].sort())) {
      errors.push("PLUGIN_ACTUAL_MEMBER_SET_INVALID");
    }
  } catch { errors.push("PLUGIN_MEMBER_SCAN_FAILED"); }
  try {
    if (!readFileSync(path.join(pluginRoot, "LICENSE")).equals(
      readFileSync(path.join(root, "LICENSE")))) errors.push("PLUGIN_LICENSE_MISMATCH");
  } catch { errors.push("PLUGIN_LICENSE_INVALID"); }
  try {
    const skill = readFileSync(path.join(pluginRoot, "skills", "outsider-stage05",
      "SKILL.md"), "utf8");
    if (!skill.startsWith("---\nname: outsider-stage05\n")
      || !skill.includes("ordinary ChatGPT conversations are not")
      || !skill.includes("do not bypass hook trust")) errors.push("PLUGIN_SKILL_BOUNDARY_INVALID");
  } catch { errors.push("PLUGIN_SKILL_INVALID"); }
  return { ok: errors.length === 0, errors, plugin: manifest?.name ?? null,
    version: manifest?.version ?? null, memberCount: EXPECTED_PLUGIN_FILES.length,
    chatgptGlobalLifecycleInterceptionEstablished: false,
    codexControlledByInstallationAlone: false };
}

if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const result = validateOpenAIUniversalPlugin();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
