import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { claudeHostedPluginManifestFile, claudeHostedRuntimeEntries, stageClaudeHostedPlugin,
  validateClaudeHostedPluginLayout } from "../scripts/claude-plugin-package.mjs";
import { dependencyPathSetSha256 } from "../scripts/stage05-public-package.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("hosted Claude plugin has no top-level bin and declares its runtime hook", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-hosted-plugin-"));
  try {
    const report = stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: temporary });
    assert.equal(report.ok, true);
    assert.equal(existsSync(path.join(temporary, "bin")), false);
    assert.deepEqual(report.topLevel,
      [".claude-plugin", "LICENSE", "hooks", "public-plugin-manifest.json", "runtime"]);
    assert.deepEqual(readFileSync(path.join(temporary, "LICENSE")),
      readFileSync(path.join(root, "LICENSE")));
    const hooks = readFileSync(path.join(temporary, "hooks", "hooks.json"), "utf8");
    assert.match(hooks, /\$\{CLAUDE_PLUGIN_ROOT\}\/runtime\/bin\/outsider-hook\.mjs/);
    assert.doesNotMatch(hooks, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\//);
    assert.deepEqual(claudeHostedRuntimeEntries,
      ["outsider-hook.mjs", "outsider-attached-daemon.mjs", "outsider-controller-host.mjs"]);
    const runtimePackage = JSON.parse(readFileSync(path.join(temporary,
      "runtime", "package.json"), "utf8"));
    assert.equal(runtimePackage.bin, undefined);
    const runtimeManifest = JSON.parse(readFileSync(path.join(temporary,
      "runtime", "public-runtime-manifest.json"), "utf8"));
    assert.deepEqual(runtimeManifest.excluded, {
      nonStage05Assets: true,
      privateDataAndRuns: true,
      internalPlanning: true,
      tests: true,
    });
    assert.deepEqual(runtimeManifest.included, { stage05Runtime: true });
    assert.equal(runtimeManifest.schemaVersion, "1.1.0");
    assert(runtimeManifest.files.length > 0);
    assert.equal(runtimeManifest.dependencyPathSetSha256,
      dependencyPathSetSha256(runtimeManifest.files.map((file) => file.path)
        .filter((file) => file !== "package.json")));
    assert.equal(runtimeManifest.files.some((file) =>
      /(?:^|\/)[^/]*(?:private|internal|confidential|secret|research|roadmap|dataset)[^/]*$/i
        .test(file.path)), false);
    const pluginManifest = JSON.parse(readFileSync(path.join(temporary,
      claudeHostedPluginManifestFile), "utf8"));
    const sourcePackage = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(pluginManifest.schema,
      "outsider/claude-hosted-public-plugin-manifest/v1");
    assert.equal(pluginManifest.schemaVersion, "1.1.0");
    assert.equal(pluginManifest.manifestFile, claudeHostedPluginManifestFile);
    assert.equal(pluginManifest.package.name, sourcePackage.name);
    assert.equal(pluginManifest.package.version, sourcePackage.version);
    assert.equal(pluginManifest.dependencyPathSetSha256,
      runtimeManifest.dependencyPathSetSha256);
    assert.deepEqual(pluginManifest.excluded, runtimeManifest.excluded);
    assert.deepEqual(pluginManifest.included, runtimeManifest.included);
    assert.equal(pluginManifest.memberCount, pluginManifest.members.length + 1);
    assert.deepEqual(report.archiveMembers,
      [...pluginManifest.members.map((member) => member.path), claudeHostedPluginManifestFile]
        .sort());
    for (const required of [".claude-plugin/plugin.json", "LICENSE", "hooks/hooks.json",
      "runtime/public-runtime-manifest.json"]) {
      assert(pluginManifest.members.some((member) => member.path === required), required);
    }
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

test("the Claude ZIP contains exactly its manifest-declared files and revalidates extracted",
  (t) => {
    const temporary = mkdtempSync(path.join(tmpdir(), "outsider-hosted-plugin-zip-"));
    const pluginRoot = path.join(temporary, "plugin");
    const extracted = path.join(temporary, "extracted");
    const archive = path.join(temporary, "outsider.plugin.zip");
    t.after(() => rmSync(temporary, { recursive: true, force: true }));
    mkdirSync(extracted);
    const report = stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: pluginRoot });
    const zipped = spawnSync("zip", ["-q", "-X", archive, ...report.archiveMembers], {
      cwd: pluginRoot, encoding: "utf8",
    });
    assert.equal(zipped.status, 0, zipped.stderr || zipped.stdout);
    const listed = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr || listed.stdout);
    assert.deepEqual(listed.stdout.trim().split("\n").filter(Boolean).sort(),
      report.archiveMembers);
    const unzipped = spawnSync("unzip", ["-q", archive, "-d", extracted], {
      encoding: "utf8",
    });
    assert.equal(unzipped.status, 0, unzipped.stderr || unzipped.stdout);
    const extractedReport = validateClaudeHostedPluginLayout(extracted);
    assert.equal(extractedReport.ok, true, extractedReport.errors.join(","));
    assert.deepEqual(extractedReport.archiveMembers, report.archiveMembers);
  });

test("hosted plugin validator rejects an unmanifested private-category runtime file", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-hosted-plugin-extra-"));
  try {
    stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: temporary });
    writeFileSync(path.join(temporary, "runtime", "src", "private-data.mjs"),
      "export const syntheticPrivateMember = true;\n");
    const report = validateClaudeHostedPluginLayout(temporary);
    assert.equal(report.ok, false);
    assert.ok(report.errors.includes("RUNTIME_ACTUAL_MEMBER_SET_MISMATCH"));
    assert.ok(report.errors.some((error) =>
      error.includes("PUBLIC_PACKAGE_FORBIDDEN_MEMBER:src/private-data.mjs")));
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

test("hosted plugin validator rejects plugin.json schema drift and version divergence", () => {
  const schemaTemporary = mkdtempSync(path.join(tmpdir(), "outsider-plugin-schema-bad-"));
  const versionTemporary = mkdtempSync(path.join(tmpdir(), "outsider-plugin-version-bad-"));
  try {
    stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: schemaTemporary });
    const schemaFile = path.join(schemaTemporary, ".claude-plugin", "plugin.json");
    const schemaPlugin = JSON.parse(readFileSync(schemaFile, "utf8"));
    writeFileSync(schemaFile, `${JSON.stringify({ ...schemaPlugin, unexpected: true })}\n`);
    const schemaReport = validateClaudeHostedPluginLayout(schemaTemporary);
    assert.equal(schemaReport.ok, false);
    assert.ok(schemaReport.errors.includes("PLUGIN_MANIFEST_SCHEMA_INVALID"));
    assert.ok(schemaReport.errors.includes(
      "PLUGIN_ARCHIVE_MEMBER_INVALID:.claude-plugin/plugin.json"));

    stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: versionTemporary });
    const versionFile = path.join(versionTemporary, ".claude-plugin", "plugin.json");
    const versionPlugin = JSON.parse(readFileSync(versionFile, "utf8"));
    writeFileSync(versionFile, `${JSON.stringify({ ...versionPlugin, version: "9.9.9" })}\n`);
    const versionReport = validateClaudeHostedPluginLayout(versionTemporary);
    assert.equal(versionReport.ok, false);
    assert.ok(versionReport.errors.includes("PLUGIN_MANIFEST_IDENTITY_MISMATCH"));
    assert.ok(versionReport.errors.includes(
      "PLUGIN_ARCHIVE_MEMBER_INVALID:.claude-plugin/plugin.json"));
  } finally {
    rmSync(schemaTemporary, { recursive: true, force: true });
    rmSync(versionTemporary, { recursive: true, force: true });
  }
});

test("hosted plugin validator rejects extra members and content mutation", () => {
  const extraTemporary = mkdtempSync(path.join(tmpdir(), "outsider-plugin-extra-bad-"));
  const mutationTemporary = mkdtempSync(path.join(tmpdir(), "outsider-plugin-mutation-bad-"));
  try {
    stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: extraTemporary });
    writeFileSync(path.join(extraTemporary, "hooks", "extra.json"), "{}\n");
    const extraReport = validateClaudeHostedPluginLayout(extraTemporary);
    assert.equal(extraReport.ok, false);
    assert.ok(extraReport.errors.includes("PLUGIN_HOOKS_MEMBER_SET_INVALID"));
    assert.ok(extraReport.errors.includes("PLUGIN_ARCHIVE_ACTUAL_MEMBER_SET_MISMATCH"));

    stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: mutationTemporary });
    const hooksFile = path.join(mutationTemporary, "hooks", "hooks.json");
    writeFileSync(hooksFile, `${readFileSync(hooksFile, "utf8")} `);
    const mutationReport = validateClaudeHostedPluginLayout(mutationTemporary);
    assert.equal(mutationReport.ok, false);
    assert.ok(mutationReport.errors.includes(
      "PLUGIN_ARCHIVE_MEMBER_INVALID:hooks/hooks.json"));
  } finally {
    rmSync(extraTemporary, { recursive: true, force: true });
    rmSync(mutationTemporary, { recursive: true, force: true });
  }
});

test("hosted plugin validator rejects a generic private content marker", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-plugin-private-content-"));
  try {
    stageClaudeHostedPlugin({ sourceRoot: root, targetRoot: temporary });
    const runtimeEntry = path.join(temporary, "runtime", "bin", "outsider-hook.mjs");
    writeFileSync(runtimeEntry, `${readFileSync(runtimeEntry, "utf8")}\n// INTERNAL_ONLY fixture\n`);
    const report = validateClaudeHostedPluginLayout(temporary);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((error) =>
      error.includes("PUBLIC_PACKAGE_FORBIDDEN_CONTENT:bin/outsider-hook.mjs")));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
