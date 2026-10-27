import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync,
  rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INSTALL_HELP = "Usage: node install.mjs [--help] [--scope user|project] [--check] "
  + "[--strict] [--stage-only] [--supervisor <cmd>|--supervisor-argv <json>] "
  + "[--allow-external-supervisor]\n";
const BASE_INSTALL_SHA256 = "3451842fd33fabda90d622ba19f69267f0f524ebd4a4fa540fc1e56696358f0b";
const PATCHED_PREAMBLE = `const A = process.argv.slice(2);
const INSTALL_HELP = "Usage: node install.mjs [--help] [--scope user|project] [--check] "
  + "[--strict] [--stage-only] [--supervisor <cmd>|--supervisor-argv <json>] "
  + "[--allow-external-supervisor]\\n";

if (A.includes("--help")) {
  process.stdout.write(INSTALL_HELP);
} else {
const { stageClaudeHostedPlugin } = await import("./scripts/claude-plugin-package.mjs");
const { decideToolCall } = await import("./src/outsider-hook.js");
const { hookConfigFor, securelyMergeHookConfigFile } = await import("./src/outsider-agents.js");
const {
  externalSupervisorConfigurationEnvironment, hookCommandWithExternalSupervisor,
  installSystemHelper, shellQuoteHookValue,
} = await import("./src/outsider-system-helper.js");
`;
const LEGACY_IMPORTS = `import { stageClaudeHostedPlugin } from "./scripts/claude-plugin-package.mjs";
import { decideToolCall } from "./src/outsider-hook.js";
import { hookConfigFor, securelyMergeHookConfigFile } from "./src/outsider-agents.js";
import {
  externalSupervisorConfigurationEnvironment, hookCommandWithExternalSupervisor,
  installSystemHelper, shellQuoteHookValue,
} from "./src/outsider-system-helper.js";
`;

function snapshotDirectory(root) {
  const entries = [];
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const visit = (relative) => {
    const absolute = relative === "." ? root : path.join(root, relative);
    const stat = lstatSync(absolute, { bigint: true });
    const common = {
      path: relative,
      mode: Number(stat.mode & 0o7777n).toString(8),
      size: stat.size.toString(),
      mtimeNs: stat.mtimeNs.toString(),
      ctimeNs: stat.ctimeNs.toString(),
    };
    if (stat.isDirectory()) {
      entries.push({ ...common, type: "directory" });
      for (const name of readdirSync(absolute).sort()) {
        visit(relative === "." ? name : path.join(relative, name));
      }
    } else if (stat.isFile()) {
      entries.push({ ...common, type: "file", sha256: sha256(readFileSync(absolute)) });
    } else if (stat.isSymbolicLink()) {
      entries.push({ ...common, type: "symlink", target: readlinkSync(absolute) });
    } else {
      entries.push({ ...common, type: "other" });
    }
  };
  visit(".");
  return entries;
}

function isolatedState(directory) {
  const roots = {};
  for (const name of ["home", "codex-home", "xdg-config", "xdg-data", "xdg-cache", "xdg-state",
    "outsider-home", "claude-config", "tmp"]) {
    roots[name] = path.join(directory, name);
    mkdirSync(roots[name]);
  }
  return roots;
}

function isolatedEnvironment(roots) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: roots.home,
    CODEX_HOME: roots["codex-home"],
    XDG_CONFIG_HOME: roots["xdg-config"],
    XDG_DATA_HOME: roots["xdg-data"],
    XDG_CACHE_HOME: roots["xdg-cache"],
    XDG_STATE_HOME: roots["xdg-state"],
    OUTSIDER_HOME: roots["outsider-home"],
    CLAUDE_CONFIG_DIR: roots["claude-config"],
    TMPDIR: roots.tmp,
    TMP: roots.tmp,
    TEMP: roots.tmp,
    LANG: "C",
    LC_ALL: "C",
  };
}

function reconstructLegacyInstaller(patchedSource) {
  assert.ok(patchedSource.includes(PATCHED_PREAMBLE), "patched installer preamble drifted");
  assert.ok(patchedSource.endsWith("\n}\n"), "patched installer must close only the help branch");
  let legacySource = patchedSource.replace(PATCHED_PREAMBLE, LEGACY_IMPORTS);
  legacySource = legacySource.replace("from \"node:url\";\n\nimport { stageClaudeHostedPlugin }",
    "from \"node:url\";\nimport { stageClaudeHostedPlugin }");
  legacySource = legacySource.replace("const CHECK = A.includes(\"--check\")",
    "const A = process.argv.slice(2);\nconst CHECK = A.includes(\"--check\")");
  legacySource = legacySource.slice(0, -2);
  assert.equal(createHash("sha256").update(legacySource).digest("hex"), BASE_INSTALL_SHA256,
    "the reconstructed legacy installer must equal the pinned base bytes");
  return legacySource;
}

function linkRepositorySurface(workspace) {
  for (const name of readdirSync(ROOT)) {
    if ([".git", "install.mjs", "test"].includes(name)) continue;
    const source = path.join(ROOT, name);
    const stat = lstatSync(source);
    symlinkSync(source, path.join(workspace, name), stat.isDirectory() ? "dir" : "file");
  }
}

test("install --help is deterministic and cannot load the installer dependency graph", (t) => {
  const capsule = mkdtempSync(path.join(tmpdir(), "outsider-install-help-"));
  t.after(() => rmSync(capsule, { recursive: true, force: true }));
  const workspace = path.join(capsule, "workspace");
  const state = path.join(capsule, "state");
  mkdirSync(workspace);
  mkdirSync(state);
  copyFileSync(path.join(ROOT, "install.mjs"), path.join(workspace, "install.mjs"));
  const roots = isolatedState(state);
  const workspaceBefore = snapshotDirectory(workspace);
  const stateBefore = snapshotDirectory(state);

  const result = spawnSync(process.execPath, ["install.mjs", "--help"], {
    cwd: workspace,
    encoding: "utf8",
    env: isolatedEnvironment(roots),
    timeout: 5_000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, INSTALL_HELP);
  assert.deepEqual(snapshotDirectory(workspace), workspaceBefore);
  assert.deepEqual(snapshotDirectory(state), stateBefore);
});

test("install --check keeps its read-only diagnostic behavior", (t) => {
  const capsule = mkdtempSync(path.join(tmpdir(), "outsider-install-check-"));
  t.after(() => rmSync(capsule, { recursive: true, force: true }));
  const workspace = path.join(capsule, "workspace");
  const state = path.join(capsule, "state");
  mkdirSync(workspace);
  mkdirSync(state);
  linkRepositorySurface(workspace);
  const patchedSource = readFileSync(path.join(ROOT, "install.mjs"), "utf8");
  writeFileSync(path.join(workspace, "legacy-install.mjs"), reconstructLegacyInstaller(patchedSource));
  writeFileSync(path.join(workspace, "install.mjs"), patchedSource);
  const roots = isolatedState(state);
  mkdirSync(path.join(roots.home, ".codex"));
  mkdirSync(path.join(roots.home, ".claude"));
  const stateBefore = snapshotDirectory(state);

  const runCheck = (script) => spawnSync(process.execPath, [script, "--check"], {
    cwd: workspace,
    encoding: "utf8",
    env: isolatedEnvironment(roots),
    timeout: 30_000,
  });
  const legacy = runCheck("legacy-install.mjs");
  assert.deepEqual(snapshotDirectory(state), stateBefore,
    "the pinned legacy --check path must leave isolated state unchanged");
  const result = runCheck("install.mjs");

  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(legacy.error, undefined);
  assert.equal(legacy.signal, result.signal);
  assert.equal(legacy.status, result.status);
  assert.equal(result.stderr, legacy.stderr, "--check stderr must remain byte-exact");
  assert.equal(result.stdout, legacy.stdout,
    "--check stdout must remain byte-exact against the pinned base in this runtime");
  assert.deepEqual(snapshotDirectory(state), stateBefore);
});
