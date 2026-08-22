import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { hookConfigFor, securelyMergeHookConfigFile } from "../src/outsider-agents.js";

const temporary = () => mkdtempSync(path.join(tmpdir(), "outsider-settings-store-"));
const incoming = () => hookConfigFor("claude-code", "/opt/outsider hook").value;
const privateMode = (file) => lstatSync(file).mode & 0o077;

test("malformed settings fail closed without creating a replacement or backup", () => {
  const root = temporary();
  try {
    const directory = path.join(root, ".claude");
    const file = path.join(directory, "settings.json");
    mkdirSync(directory, { mode: 0o700 });
    const sentinel = '{"userSetting":"MALFORMED-SENTINEL"';
    writeFileSync(file, sentinel);
    const before = readdirSync(directory).sort();
    assert.throws(() => securelyMergeHookConfigFile({ file, value: incoming(), trustedRoot: root }),
      /SETTINGS_JSON_INVALID/);
    assert.equal(readFileSync(file, "utf8"), sentinel);
    assert.deepEqual(readdirSync(directory).sort(), before,
      "parse refusal must happen before temp or backup creation");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a settings symlink is rejected and its victim remains byte-exact", () => {
  const root = temporary();
  try {
    const directory = path.join(root, ".claude");
    const file = path.join(directory, "settings.json");
    const victim = path.join(root, "victim.json");
    mkdirSync(directory, { mode: 0o700 });
    const sentinel = '{"victim":"SYMLINK-SENTINEL"}\n';
    writeFileSync(victim, sentinel);
    symlinkSync(victim, file);
    assert.throws(() => securelyMergeHookConfigFile({ file, value: incoming(), trustedRoot: root }),
      /SETTINGS_SYMLINK_REFUSED/);
    assert.equal(readFileSync(victim, "utf8"), sentinel);
    assert.equal(lstatSync(file).isSymbolicLink(), true);
    assert.deepEqual(readdirSync(directory), ["settings.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a settings-directory symlink is rejected before creating a victim file", () => {
  const root = temporary();
  try {
    const victimDirectory = path.join(root, "victim-directory");
    const linkedDirectory = path.join(root, ".claude");
    mkdirSync(victimDirectory, { mode: 0o700 });
    symlinkSync(victimDirectory, linkedDirectory);
    const file = path.join(linkedDirectory, "settings.json");
    assert.throws(() => securelyMergeHookConfigFile({ file, value: incoming(), trustedRoot: root }),
      /SETTINGS_DIRECTORY_SYMLINK_REFUSED/);
    assert.equal(existsSync(path.join(victimDirectory, "settings.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an intermediate settings-directory symlink is rejected from the trusted root", () => {
  const root = temporary();
  try {
    const victimDirectory = path.join(root, "victim-directory");
    const redirect = path.join(root, "redirect");
    mkdirSync(victimDirectory, { mode: 0o700 });
    symlinkSync(victimDirectory, redirect);
    const file = path.join(redirect, "nested", "settings.json");
    assert.throws(() => securelyMergeHookConfigFile({
      file, value: incoming(), trustedRoot: root,
    }), /SETTINGS_DIRECTORY_SYMLINK_REFUSED/);
    assert.equal(existsSync(path.join(victimDirectory, "nested", "settings.json")), false);
    assert.equal(lstatSync(redirect).isSymbolicLink(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic settings replacement is private and retains exact recoverable bytes", () => {
  const root = temporary();
  try {
    const file = path.join(root, "private-config", "settings.json");
    mkdirSync(path.dirname(file), { mode: 0o700 });
    const original = '{\n  "userSetting": "keep-me"\n}\n';
    writeFileSync(file, original);
    chmodSync(file, 0o644);
    const stored = securelyMergeHookConfigFile({ file, value: incoming(), trustedRoot: root });
    assert.equal(stored.committed.userSetting, "keep-me");
    assert.ok(stored.committed.hooks.PreToolUse.length > 0);
    assert.ok(stored.backupPath && existsSync(stored.backupPath));
    assert.equal(readFileSync(stored.backupPath, "utf8"), original);
    assert.equal(privateMode(file), 0, "committed settings must be 0600 or stricter");
    assert.equal(privateMode(stored.backupPath), 0, "backup must be 0600 or stricter");
    assert.equal(readdirSync(path.dirname(file)).some((name) => name.endsWith(".tmp")), false);

    const newFile = path.join(root, "created-private-config", "settings.json");
    const created = securelyMergeHookConfigFile({
      file: newFile, value: incoming(), trustedRoot: root,
    });
    assert.equal(created.backupPath, null);
    assert.equal(privateMode(newFile), 0);
    assert.equal(privateMode(path.dirname(newFile)), 0,
      "a config directory created by the store must be 0700 or stricter");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a concurrent settings identity replacement aborts before rename", () => {
  const root = temporary();
  try {
    const directory = path.join(root, ".claude");
    const file = path.join(directory, "settings.json");
    const displaced = path.join(directory, "settings.displaced.json");
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(file, '{"owner":"original"}\n');
    const replacement = '{"owner":"concurrent-editor","sentinel":"KEEP"}\n';
    assert.throws(() => securelyMergeHookConfigFile({ file, value: incoming(), trustedRoot: root,
      beforeCommit: () => {
        renameSync(file, displaced);
        writeFileSync(file, replacement);
      },
    }), /SETTINGS_IDENTITY_CHANGED/);
    assert.equal(readFileSync(file, "utf8"), replacement);
    assert.equal(readFileSync(displaced, "utf8"), '{"owner":"original"}\n');
    assert.equal(readdirSync(directory).some((name) => name.endsWith(".tmp")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an in-place concurrent settings edit also aborts before rename", () => {
  const root = temporary();
  try {
    const file = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(file), { mode: 0o700 });
    writeFileSync(file, '{"owner":"original"}\n');
    const replacement = '{"owner":"same-inode-concurrent-editor","sentinel":"KEEP-IN-PLACE"}\n';
    assert.throws(() => securelyMergeHookConfigFile({ file, value: incoming(), trustedRoot: root,
      beforeCommit: () => writeFileSync(file, replacement),
    }), /SETTINGS_IDENTITY_CHANGED/);
    assert.equal(readFileSync(file, "utf8"), replacement);
    assert.equal(readdirSync(path.dirname(file)).some((name) => name.endsWith(".tmp")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same-length in-place edit with restored mtime still aborts on ctime identity", () => {
  const root = temporary();
  try {
    const file = path.join(root, ".claude", "settings.json");
    mkdirSync(path.dirname(file), { mode: 0o700 });
    const original = '{"owner":"aaaaaaaa"}\n';
    const replacement = '{"owner":"bbbbbbbb"}\n';
    const fixed = new Date("2026-08-22T00:00:00.000Z");
    writeFileSync(file, original);
    utimesSync(file, fixed, fixed);
    assert.throws(() => securelyMergeHookConfigFile({
      file,
      value: incoming(),
      trustedRoot: root,
      beforeCommit: () => {
        writeFileSync(file, replacement);
        utimesSync(file, fixed, fixed);
      },
    }), /SETTINGS_IDENTITY_CHANGED/);
    assert.equal(readFileSync(file, "utf8"), replacement);
    assert.equal(readdirSync(path.dirname(file)).some((name) => name.endsWith(".tmp")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
