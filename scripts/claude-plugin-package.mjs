import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertPublicPackageContents, assertPublicPackagePaths, dependencyPathSetSha256,
  publicDependencyFiles, publicReleaseForbiddenContentPatterns,
  publicReleaseForbiddenPathPatterns, readPublicPackageProfile,
} from "./stage05-public-package.mjs";

const HOSTED_ENTRIES = [
  "outsider-hook.mjs",
  "outsider-attached-daemon.mjs",
  "outsider-controller-host.mjs",
];

const PLUGIN_MANIFEST_FILE = "public-plugin-manifest.json";
const PLUGIN_MANIFEST_SCHEMA = "outsider/claude-hosted-public-plugin-manifest/v1";
const RUNTIME_MANIFEST_FILE = "public-runtime-manifest.json";
const RUNTIME_MANIFEST_SCHEMA = "outsider/claude-hosted-public-runtime-manifest/v1";
const MANIFEST_SCHEMA_VERSION = "1.1.0";
const PUBLIC_BOUNDARY = "PUBLIC_STAGE05_RUNTIME_ONLY_LOCAL_RESEARCH_EXCLUDED";
const EXPECTED_TOP_LEVEL = [
  ".claude-plugin", "LICENSE", "hooks", PLUGIN_MANIFEST_FILE, "runtime",
];
const EXPECTED_EXCLUSIONS = Object.freeze({
  nonStage05Assets: true,
  privateDataAndRuns: true,
  internalPlanning: true,
  tests: true,
});
const EXPECTED_INCLUSIONS = Object.freeze({ stage05Runtime: true });
const PUBLIC_AUDIT_PROFILE = Object.freeze({
  forbiddenPathPatterns: publicReleaseForbiddenPathPatterns,
  forbiddenContentPatterns: publicReleaseForbiddenContentPatterns,
});

function memberFiles(root, relative = "") {
  if (!existsSync(root)) return [];
  const directory = path.join(root, relative);
  return readdirSync(directory).sort().flatMap((name) => {
    const child = path.join(relative, name);
    const stat = lstatSync(path.join(root, child));
    if (stat.isSymbolicLink()) return [child];
    return stat.isDirectory() ? memberFiles(root, child) : [child];
  }).map((item) => item.split(path.sep).join("/"));
}

function walk(root, relative = "") {
  if (!existsSync(root)) return [];
  const directory = path.join(root, relative);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? [child, ...walk(root, child)] : [child];
  }).map((item) => item.split(path.sep).join("/"));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isSafeMemberPath(value) {
  return typeof value === "string" && value.length > 0 && value !== "."
    && !value.includes("\\") && !value.includes("\0") && !path.posix.isAbsolute(value)
    && !value.startsWith("../") && path.posix.normalize(value) === value;
}

function fileHash(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

function validSemver(value) {
  return typeof value === "string"
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function readJson(file, prefix, errors) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) {
    errors.push(`${prefix}_INVALID_JSON:${error?.message ?? error}`);
    return null;
  }
}

function validateHashedMembers({ root, records, errors, invalidPrefix, missingPrefix,
  setError }) {
  if (!Array.isArray(records)) return [];
  const declaredPaths = records.map((item) => item?.path);
  const recordsValid = records.every((item) => hasExactKeys(item,
    ["path", "bytes", "sha256"])
    && isSafeMemberPath(item.path)
    && Number.isSafeInteger(item.bytes) && item.bytes >= 0
    && typeof item.sha256 === "string" && /^sha256:[0-9a-f]{64}$/.test(item.sha256));
  if (!recordsValid || new Set(declaredPaths).size !== declaredPaths.length
    || JSON.stringify(declaredPaths) !== JSON.stringify([...declaredPaths].sort())) {
    errors.push(setError);
  }
  for (const member of records) {
    if (!isSafeMemberPath(member?.path)) continue;
    const file = path.join(root, member.path);
    try {
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== member.bytes
        || fileHash(file) !== member.sha256) errors.push(`${invalidPrefix}:${member.path}`);
    } catch { errors.push(`${missingPrefix}:${member.path}`); }
  }
  return declaredPaths.filter((item) => typeof item === "string");
}

function hashedMembers(root, paths) {
  return [...paths].sort().map((relative) => ({
    path: relative,
    bytes: lstatSync(path.join(root, relative)).size,
    sha256: fileHash(path.join(root, relative)),
  }));
}

export function validateClaudeHostedPluginLayout(pluginRoot) {
  const errors = [];
  const topLevel = existsSync(pluginRoot) ? readdirSync(pluginRoot).sort() : [];
  if (JSON.stringify(topLevel) !== JSON.stringify(EXPECTED_TOP_LEVEL)) {
    errors.push("PLUGIN_TOP_LEVEL_MEMBER_SET_INVALID");
  }
  if (existsSync(path.join(pluginRoot, "bin"))) errors.push("TOP_LEVEL_BIN_FORBIDDEN");
  for (const required of [".claude-plugin/plugin.json", "hooks/hooks.json",
    `runtime/${RUNTIME_MANIFEST_FILE}`, PLUGIN_MANIFEST_FILE]) {
    if (!existsSync(path.join(pluginRoot, required))) errors.push(`MISSING:${required}`);
  }
  for (const relative of walk(pluginRoot)) {
    if (lstatSync(path.join(pluginRoot, relative)).isSymbolicLink()) {
      errors.push(`SYMLINK_FORBIDDEN:${relative}`);
    }
  }

  const pluginFiles = memberFiles(path.join(pluginRoot, ".claude-plugin"));
  if (JSON.stringify(pluginFiles) !== JSON.stringify(["plugin.json"])) {
    errors.push("PLUGIN_METADATA_MEMBER_SET_INVALID");
  }
  const hookFiles = memberFiles(path.join(pluginRoot, "hooks"));
  if (JSON.stringify(hookFiles) !== JSON.stringify(["hooks.json"])) {
    errors.push("PLUGIN_HOOKS_MEMBER_SET_INVALID");
  }

  const plugin = readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"),
    "PLUGIN_MANIFEST", errors);
  if (!hasExactKeys(plugin, ["name", "description", "version", "author"])
    || typeof plugin?.name !== "string" || plugin.name.trim().length === 0
    || typeof plugin?.description !== "string" || plugin.description.trim().length === 0
    || !validSemver(plugin?.version)
    || !hasExactKeys(plugin?.author, ["name"])
    || typeof plugin?.author?.name !== "string" || plugin.author.name.trim().length === 0) {
    errors.push("PLUGIN_MANIFEST_SCHEMA_INVALID");
  }

  const hooks = readJson(path.join(pluginRoot, "hooks", "hooks.json"), "HOOKS", errors);
  const commands = Object.values(hooks?.hooks ?? {}).flatMap((matchers) => matchers ?? [])
    .flatMap((matcher) => matcher?.hooks ?? []).map((hook) => String(hook?.command ?? ""));
  if (!commands.length) errors.push("NO_DECLARED_HOOK_COMMANDS");
  for (const command of commands) {
    if (command.includes("${CLAUDE_PLUGIN_ROOT}/bin/")) {
      errors.push(`TOP_LEVEL_BIN_REFERENCE:${command}`);
    }
    const match = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"']+)/);
    if (!match) errors.push(`HOOK_ENTRY_NOT_PLUGIN_ROOTED:${command}`);
    else if (!isSafeMemberPath(match[1]) || !existsSync(path.join(pluginRoot, match[1]))) {
      errors.push(`HOOK_ENTRY_MISSING:${match[1]}`);
    }
  }
  for (const entry of HOSTED_ENTRIES) {
    if (!existsSync(path.join(pluginRoot, "runtime", "bin", entry))) {
      errors.push(`RUNTIME_ENTRY_MISSING:${entry}`);
    }
  }

  const runtimeRoot = path.join(pluginRoot, "runtime");
  const runtimePackage = readJson(path.join(runtimeRoot, "package.json"),
    "RUNTIME_PACKAGE", errors);
  if (!hasExactKeys(runtimePackage, ["name", "version", "private", "type", "engines"])
    || typeof runtimePackage?.name !== "string" || runtimePackage.name.trim().length === 0
    || !validSemver(runtimePackage?.version) || runtimePackage?.private !== true
    || runtimePackage?.type !== "module" || !hasExactKeys(runtimePackage?.engines, ["node"])
    || typeof runtimePackage?.engines?.node !== "string"
    || runtimePackage.engines.node.trim().length === 0) {
    errors.push("RUNTIME_PACKAGE_SCHEMA_INVALID");
  }
  if (plugin && runtimePackage
    && (plugin.name !== runtimePackage.name || plugin.version !== runtimePackage.version)) {
    errors.push("PLUGIN_MANIFEST_IDENTITY_MISMATCH");
  }

  const runtimeManifest = readJson(path.join(runtimeRoot, RUNTIME_MANIFEST_FILE),
    "RUNTIME_MANIFEST", errors);
  const declaredRuntime = runtimeManifest?.files;
  if (!hasExactKeys(runtimeManifest, ["schema", "schemaVersion", "boundary",
    "dependencyPathSetSha256", "files", "excluded", "included"])
    || runtimeManifest?.schema !== RUNTIME_MANIFEST_SCHEMA
    || runtimeManifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION
    || runtimeManifest?.boundary !== PUBLIC_BOUNDARY
    || !/^sha256:[0-9a-f]{64}$/.test(runtimeManifest?.dependencyPathSetSha256 ?? "")
    || !hasExactKeys(runtimeManifest?.excluded, Object.keys(EXPECTED_EXCLUSIONS))
    || Object.entries(EXPECTED_EXCLUSIONS).some(([key, value]) =>
      runtimeManifest?.excluded?.[key] !== value)
    || !hasExactKeys(runtimeManifest?.included, Object.keys(EXPECTED_INCLUSIONS))
    || Object.entries(EXPECTED_INCLUSIONS).some(([key, value]) =>
      runtimeManifest?.included?.[key] !== value)
    || !Array.isArray(declaredRuntime)) errors.push("RUNTIME_MANIFEST_SCHEMA_INVALID");
  if (Array.isArray(declaredRuntime)) {
    const declaredPaths = validateHashedMembers({ root: runtimeRoot, records: declaredRuntime,
      errors, invalidPrefix: "RUNTIME_MEMBER_INVALID", missingPrefix: "RUNTIME_MEMBER_MISSING",
      setError: "RUNTIME_MANIFEST_MEMBER_SET_INVALID" });
    try {
      const declaredDependencies = declaredPaths.filter((item) => item !== "package.json");
      if (dependencyPathSetSha256(declaredDependencies)
        !== runtimeManifest?.dependencyPathSetSha256) {
        errors.push("RUNTIME_DEPENDENCY_PATH_SET_MISMATCH");
      }
    } catch { errors.push("RUNTIME_DEPENDENCY_PATH_SET_INVALID"); }
    const actualPaths = memberFiles(runtimeRoot)
      .filter((item) => item !== RUNTIME_MANIFEST_FILE).sort();
    if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
      errors.push("RUNTIME_ACTUAL_MEMBER_SET_MISMATCH");
    }
    try {
      assertPublicPackagePaths(actualPaths, PUBLIC_AUDIT_PROFILE);
    } catch (error) { errors.push(String(error?.message ?? error)); }
    try {
      assertPublicPackageContents(runtimeRoot, actualPaths, PUBLIC_AUDIT_PROFILE);
    } catch (error) { errors.push(String(error?.message ?? error)); }
  }

  const archiveManifest = readJson(path.join(pluginRoot, PLUGIN_MANIFEST_FILE),
    "PLUGIN_ARCHIVE_MANIFEST", errors);
  const declaredArchive = archiveManifest?.members;
  if (!hasExactKeys(archiveManifest, ["schema", "schemaVersion", "manifestFile",
    "memberCount", "package", "boundary", "dependencyPathSetSha256", "members",
    "excluded", "included"])
    || archiveManifest?.schema !== PLUGIN_MANIFEST_SCHEMA
    || archiveManifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION
    || archiveManifest?.manifestFile !== PLUGIN_MANIFEST_FILE
    || !Number.isSafeInteger(archiveManifest?.memberCount)
    || archiveManifest?.memberCount !== (Array.isArray(declaredArchive)
      ? declaredArchive.length + 1 : -1)
    || !hasExactKeys(archiveManifest?.package, ["name", "version"])
    || archiveManifest?.package?.name !== runtimePackage?.name
    || archiveManifest?.package?.version !== runtimePackage?.version
    || archiveManifest?.boundary !== PUBLIC_BOUNDARY
    || archiveManifest?.dependencyPathSetSha256
      !== runtimeManifest?.dependencyPathSetSha256
    || !hasExactKeys(archiveManifest?.excluded, Object.keys(EXPECTED_EXCLUSIONS))
    || Object.entries(EXPECTED_EXCLUSIONS).some(([key, value]) =>
      archiveManifest?.excluded?.[key] !== value)
    || !hasExactKeys(archiveManifest?.included, Object.keys(EXPECTED_INCLUSIONS))
    || Object.entries(EXPECTED_INCLUSIONS).some(([key, value]) =>
      archiveManifest?.included?.[key] !== value)
    || !Array.isArray(declaredArchive)) errors.push("PLUGIN_ARCHIVE_MANIFEST_SCHEMA_INVALID");
  if (Array.isArray(declaredArchive)) {
    const declaredPaths = validateHashedMembers({ root: pluginRoot, records: declaredArchive,
      errors, invalidPrefix: "PLUGIN_ARCHIVE_MEMBER_INVALID",
      missingPrefix: "PLUGIN_ARCHIVE_MEMBER_MISSING",
      setError: "PLUGIN_ARCHIVE_MANIFEST_MEMBER_SET_INVALID" });
    const actualPaths = memberFiles(pluginRoot)
      .filter((item) => item !== PLUGIN_MANIFEST_FILE).sort();
    if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
      errors.push("PLUGIN_ARCHIVE_ACTUAL_MEMBER_SET_MISMATCH");
    }
    try {
      assertPublicPackagePaths(actualPaths, PUBLIC_AUDIT_PROFILE);
    } catch (error) { errors.push(String(error?.message ?? error)); }
    try {
      assertPublicPackageContents(pluginRoot, actualPaths, PUBLIC_AUDIT_PROFILE);
    } catch (error) { errors.push(String(error?.message ?? error)); }
  }

  return { ok: errors.length === 0, errors, commands, topLevel,
    archiveMembers: memberFiles(pluginRoot).sort() };
}

export function stageClaudeHostedPlugin({ sourceRoot, targetRoot }) {
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(path.join(targetRoot, "hooks"), { recursive: true });
  mkdirSync(path.join(targetRoot, "runtime", "bin"), { recursive: true });
  cpSync(path.join(sourceRoot, ".claude-plugin"), path.join(targetRoot, ".claude-plugin"),
    { recursive: true });
  cpSync(path.join(sourceRoot, "LICENSE"), path.join(targetRoot, "LICENSE"));
  const profile = readPublicPackageProfile(sourceRoot);
  const runtimeEntrypoints = HOSTED_ENTRIES.map((entry) => `bin/${entry}`);
  const dependencyFiles = publicDependencyFiles({ sourceRoot, entrypoints: runtimeEntrypoints });
  assertPublicPackagePaths(dependencyFiles, profile);
  assertPublicPackageContents(sourceRoot, dependencyFiles, profile);
  for (const relative of dependencyFiles) {
    const destination = path.join(targetRoot, "runtime", relative);
    mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    cpSync(path.join(sourceRoot, relative), destination);
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
  const manifestPaths = [...dependencyFiles, "package.json"].sort();
  const runtimeDependencyPathSetSha256 = dependencyPathSetSha256(dependencyFiles);
  const runtimeManifest = {
    schema: RUNTIME_MANIFEST_SCHEMA,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    boundary: profile.boundary,
    dependencyPathSetSha256: runtimeDependencyPathSetSha256,
    files: hashedMembers(path.join(targetRoot, "runtime"), manifestPaths),
    excluded: { ...EXPECTED_EXCLUSIONS },
    included: { ...EXPECTED_INCLUSIONS },
  };
  writeFileSync(path.join(targetRoot, "runtime", RUNTIME_MANIFEST_FILE),
    `${JSON.stringify(runtimeManifest, null, 2)}\n`);
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
  const pluginPaths = memberFiles(targetRoot).filter((item) => item !== PLUGIN_MANIFEST_FILE);
  const pluginManifest = {
    schema: PLUGIN_MANIFEST_SCHEMA,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    manifestFile: PLUGIN_MANIFEST_FILE,
    memberCount: pluginPaths.length + 1,
    package: { name: runtimePackage.name, version: runtimePackage.version },
    boundary: profile.boundary,
    dependencyPathSetSha256: runtimeDependencyPathSetSha256,
    members: hashedMembers(targetRoot, pluginPaths),
    excluded: { ...EXPECTED_EXCLUSIONS },
    included: { ...EXPECTED_INCLUSIONS },
  };
  writeFileSync(path.join(targetRoot, PLUGIN_MANIFEST_FILE),
    `${JSON.stringify(pluginManifest, null, 2)}\n`);
  const report = validateClaudeHostedPluginLayout(targetRoot);
  if (!report.ok) throw new Error(`CLAUDE_HOSTED_PLUGIN_INVALID:${report.errors.join(",")}`);
  return report;
}

export const claudeHostedRuntimeEntries = Object.freeze([...HOSTED_ENTRIES]);
export const claudeHostedPluginManifestFile = PLUGIN_MANIFEST_FILE;
