import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INSTALL_HELP = "Usage: node install.mjs [--help] [--scope user|project] [--check] "
  + "[--strict] [--stage-only] [--supervisor <cmd>|--supervisor-argv <json>] "
  + "[--allow-external-supervisor]\n";
const BASE_CHECK_NORMALIZED_STDOUT_BYTES = 7_278;
const BASE_CHECK_NORMALIZED_STDOUT_SHA256 =
  "c0da99ca023523fa06039d90fa22dfd4977950100ee5dd670d7f809e7a1d0031";

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
  const state = path.join(capsule, "state");
  mkdirSync(state);
  const roots = isolatedState(state);
  mkdirSync(path.join(roots.home, ".codex"));
  mkdirSync(path.join(roots.home, ".claude"));
  const stateBefore = snapshotDirectory(state);

  const result = spawnSync(process.execPath, [path.join(ROOT, "install.mjs"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
    env: isolatedEnvironment(roots),
    timeout: 30_000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const normalizedStdout = result.stdout.split(state).join("<ISOLATED_STATE>");
  assert.equal(Buffer.byteLength(normalizedStdout), BASE_CHECK_NORMALIZED_STDOUT_BYTES);
  assert.equal(createHash("sha256").update(normalizedStdout).digest("hex"),
    BASE_CHECK_NORMALIZED_STDOUT_SHA256,
    "--check stdout must remain byte-exact after its isolated state root is normalized");
  assert.deepEqual(snapshotDirectory(state), stateBefore);
});
