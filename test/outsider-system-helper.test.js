import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  installSystemHelper, stageSystemHelperRuntime, systemHelperPath, systemHelperPaths,
  systemHelperPlist,
} from "../src/outsider-system-helper.js";

const temporary = () => mkdtempSync(path.join(tmpdir(), "outsider-helper-test-"));

test("system helper runtime is self-contained and has no top-level hosted-plugin bin", () => {
  const root = temporary();
  const target = path.join(root, "runtime");
  const staged = stageSystemHelperRuntime({ sourceRoot: path.resolve("."), targetRoot: target });
  assert.match(staged.version, /^1\./);
  assert.equal(existsSync(path.join(target, "bin", "outsider-attached-daemon.mjs")), true);
  assert.equal(existsSync(path.join(target, "src", "outsider-attached-daemon.js")), true);
  assert.equal(JSON.parse(readFileSync(path.join(target, "package.json"))).type, "module");
  rmSync(root, { recursive: true, force: true });
});

test("LaunchAgent declaration exposes the native helper on an authenticated local boundary", () => {
  const plist = systemHelperPlist({
    nodeExecutable: "/opt/node", entry: "/Users/a b/helper.mjs",
    workingDirectory: "/Users/a b/release", attachedRoot: "/Users/a b/.outsider/attached",
    socketPath: "/tmp/outsider.sock", token: "secret&token",
    stdoutFile: "/tmp/out.log", stderrFile: "/tmp/err.log",
    environmentPath: "/custom/npm/bin:/usr/bin",
  });
  assert.match(plist, /ai\.outsider\.stage05/);
  assert.match(plist, /system-helper/);
  assert.match(plist, /secret&amp;token/);
  assert.match(plist, /\/Users\/a b\/helper\.mjs/);
  assert.match(plist, /<key>PATH<\/key>/);
  assert.match(plist, /\/custom\/npm\/bin/);
  assert.match(plist, /\/usr\/local\/bin/);
  assert.equal(systemHelperPath("/opt/node", "/custom/npm/bin:/usr/bin"),
    "/opt:/custom/npm/bin:/usr/bin:/usr/local/bin:/opt/homebrew/bin:/bin:/usr/sbin:/sbin");
});

test("installer stages a versioned helper and registers one user LaunchAgent", () => {
  const home = temporary();
  const calls = [];
  const result = installSystemHelper({ sourceRoot: path.resolve("."), home,
    nodeExecutable: "/opt/node", uid: 501,
    run: (command, args) => { calls.push([command, args]); return { status: 0 }; } });
  const expected = systemHelperPaths({ home, version: result.version, uid: 501 });
  assert.equal(result.entry, expected.entry);
  assert.equal(existsSync(expected.entry), true);
  assert.equal(existsSync(expected.tokenFile), true);
  assert.equal(existsSync(expected.plistFile), true);
  assert.match(readFileSync(expected.plistFile, "utf8"), /<key>PATH<\/key>/);
  assert.deepEqual(calls.map((entry) => entry[1][0]), ["bootout", "bootstrap", "kickstart"]);
  assert.equal(result.registered, true);
  rmSync(home, { recursive: true, force: true });
});

test("release certification can stage helper bytes without touching the machine-global launchd label", () => {
  const home = temporary();
  const calls = [];
  const result = installSystemHelper({ sourceRoot: path.resolve("."), home,
    nodeExecutable: "/opt/node", uid: 501, register: false,
    run: (...args) => { calls.push(args); return { status: 0 }; } });
  assert.equal(result.registered, false);
  assert.equal(existsSync(result.entry), true);
  assert.equal(existsSync(result.plistFile), true);
  assert.deepEqual(calls, [], "stage-only certification must never call launchctl");
  rmSync(home, { recursive: true, force: true });
});
