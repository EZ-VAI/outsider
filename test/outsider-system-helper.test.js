import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  renameSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { hookConfigFor } from "../src/outsider-agents.js";
import {
  hookCommandWithExternalSupervisor, installSystemHelper, shellQuoteHookValue,
  stageSystemHelperRuntime, systemHelperPath, systemHelperPaths, systemHelperPlist,
} from "../src/outsider-system-helper.js";

const temporary = () => mkdtempSync(path.join(tmpdir(), "outsider-helper-test-"));

function createRuntimeFixtureSource(root) {
  const source = path.join(root, "source");
  mkdirSync(path.join(source, "src"), { recursive: true });
  mkdirSync(path.join(source, "bin"));
  writeFileSync(path.join(source, "package.json"), JSON.stringify({
    name: "same-version-fixture", version: "1.0.0", engines: { node: ">=20" },
  }));
  writeFileSync(path.join(source, "src", "a-runtime.js"), "export const value = 1;\n");
  writeFileSync(path.join(source, "src", "z-runtime.js"), "export const tail = 1;\n");
  for (const name of ["outsider-attached-daemon.mjs", "outsider-controller-host.mjs",
    "outsider-hook.mjs"]) {
    writeFileSync(path.join(source, "bin", name), `// ${name}\n`);
  }
  return source;
}

function writePublicationClaim(root, releaseName, ownerPid,
  createdAt = new Date().toISOString()) {
  const claim = path.join(root, `.${releaseName}.publish-claim`);
  writeFileSync(claim, `${JSON.stringify({
    schema: "outsider/system-helper-publication-claim/v1",
    ownerPid,
    createdAt,
    token: "550e8400-e29b-41d4-a716-446655440000",
  }, null, 2)}\n`, { mode: 0o600 });
  return claim;
}

function runtimeTreeSnapshot(root, member = "") {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })
    .toSorted((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(root, entry.name);
    const child = member ? `${member}/${entry.name}` : entry.name;
    const stats = lstatSync(file, { bigint: true });
    result.push({ path: child, type: entry.isDirectory() ? "directory" : "file",
      ino: stats.ino, mode: Number(stats.mode) & 0o777, size: stats.size,
      mtimeNs: stats.mtimeNs,
      bytes: entry.isFile() ? readFileSync(file).toString("hex") : null });
    if (entry.isDirectory()) result.push(...runtimeTreeSnapshot(file, child));
  }
  return result;
}

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

test("same-version runtime staging is manifest-bound and byte-identical reinstall is inode-stable", () => {
  const root = temporary();
  try {
    const target = path.join(root, "runtime");
    const first = stageSystemHelperRuntime({ sourceRoot: path.resolve("."), targetRoot: target });
    const manifestFile = path.join(target, ".outsider-runtime-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    assert.equal(manifest.schema, "outsider/system-helper-runtime-manifest/v1");
    assert.equal(manifest.package.version, first.version);
    assert.ok(manifest.files.length > 3);
    const before = runtimeTreeSnapshot(target);

    const second = stageSystemHelperRuntime({ sourceRoot: path.resolve("."), targetRoot: target });

    assert.deepEqual(second, first);
    assert.deepEqual(runtimeTreeSnapshot(target), before,
      "successful same-version reinstall must perform no release writes or replacements");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("same-version runtime mutation, missing member, and extra member fail closed", async (t) => {
  const cases = [
    ["mutated", (target) => writeFileSync(path.join(target, "bin", "outsider-hook.mjs"),
      "MUTATED-SAME-VERSION-RUNTIME\n")],
    ["missing", (target) => unlinkSync(path.join(target, "bin", "outsider-hook.mjs"))],
    ["extra", (target) => writeFileSync(path.join(target, "src", "unexpected-runtime.js"),
      "EXTRA-SAME-VERSION-RUNTIME\n", { mode: 0o600 })],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const root = temporary();
      try {
        const target = path.join(root, "runtime");
        stageSystemHelperRuntime({ sourceRoot: path.resolve("."), targetRoot: target });
        mutate(target);
        const before = runtimeTreeSnapshot(target);

        assert.throws(() => stageSystemHelperRuntime({ sourceRoot: path.resolve("."),
          targetRoot: target }), /SYSTEM_HELPER_RELEASE_IMMUTABLE_MISMATCH/);
        assert.deepEqual(runtimeTreeSnapshot(target), before,
          `${name} same-version release must remain byte- and inode-exact after refusal`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("changed source bytes cannot overwrite an existing release with the same package version", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target });
    const before = runtimeTreeSnapshot(target);
    writeFileSync(path.join(source, "src", "a-runtime.js"), "export const value = 2;\n");

    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target }),
      /SYSTEM_HELPER_RELEASE_IMMUTABLE_MISMATCH/);
    assert.deepEqual(runtimeTreeSnapshot(target), before,
      "source drift under a reused version must not replace any installed member");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("second-pass source snapshot rejects in-place package, bin, and src mutations", async (t) => {
  const cases = [
    ["package", "source-member-read", "src/z-runtime.js", "package.json", "{}\n"],
    ["bin", "source-member-read", "bin/outsider-hook.mjs",
      "bin/outsider-attached-daemon.mjs", "// mutated attached daemon\n"],
    ["src", "source-member-read", "src/z-runtime.js", "src/a-runtime.js",
      "export const value = 9;\n"],
  ];
  for (const [name, phase, trigger, mutatedMember, mutatedBytes] of cases) {
    await t.test(name, () => {
      const root = temporary();
      try {
        const source = createRuntimeFixtureSource(root);
        const target = path.join(root, "runtime");
        let mutated = false;
        assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
          testOnlySnapshotObserver: (event) => {
            if (!mutated && event.phase === phase && event.member === trigger) {
              writeFileSync(path.join(source, ...mutatedMember.split("/")), mutatedBytes);
              mutated = true;
            }
          } }), /SYSTEM_HELPER_SOURCE_IDENTITY_CHANGED/);
        assert.equal(mutated, true);
        assert.equal(existsSync(target), false,
          "an unstable source image must be rejected before a release directory is created");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("second-pass installed snapshot rejects mid-traversal package, bin, and src mutations",
  async (t) => {
    const cases = [
      ["package", "src/z-runtime.js", "package.json", "MUTATED-INSTALLED-PACKAGE\n"],
      ["bin", "bin/outsider-hook.mjs", "bin/outsider-attached-daemon.mjs",
        "// mutated installed daemon\n"],
      ["src", "src/z-runtime.js", "src/a-runtime.js", "export const value = 9;\n"],
    ];
    for (const [name, trigger, mutatedMember, mutatedBytes] of cases) {
      await t.test(name, () => {
        const root = temporary();
        try {
          const source = createRuntimeFixtureSource(root);
          const target = path.join(root, "runtime");
          stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target });
          const manifest = path.join(target, ".outsider-runtime-manifest.json");
          const manifestBefore = readFileSync(manifest);
          const manifestInode = lstatSync(manifest).ino;
          let mutated = false;
          assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
            testOnlySnapshotObserver: (event) => {
              if (!mutated && event.phase === "installed-member-read"
                && event.member === trigger) {
                writeFileSync(path.join(target, ...mutatedMember.split("/")), mutatedBytes);
                mutated = true;
              }
            } }), /SYSTEM_HELPER_RELEASE_IDENTITY_CHANGED/);
          assert.equal(mutated, true);
          assert.equal(readFileSync(path.join(target, ...mutatedMember.split("/")), "utf8"),
            mutatedBytes, "refusal must not repair or replace the observed mutated member");
          assert.deepEqual(readFileSync(manifest), manifestBefore);
          assert.equal(lstatSync(manifest).ino, manifestInode,
            "refusal must leave every non-mutated release member untouched");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    }
  });

test("first-install staging failure cleans only its owned private sibling and remains retryable", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    let injected = false;
    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      testOnlySnapshotObserver: (event) => {
        if (!injected && event.phase === "staging-member-written") {
          injected = true;
          throw new Error("INJECTED_STAGING_WRITE_FAILURE");
        }
      } }), /INJECTED_STAGING_WRITE_FAILURE/);
    assert.equal(existsSync(target), false,
      "a failed first install must never expose a partial final release");
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".staging")), [],
      "ordinary failure must remove the random staging directory owned by this call");

    const retried = stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target });
    assert.equal(retried.version, "1.0.0");
    assert.equal(lstatSync(target).mode & 0o777, 0o700);
    for (const member of runtimeTreeSnapshot(target).filter((entry) => entry.type === "file")) {
      assert.equal(member.mode, 0o600, `${member.path} must remain private after retry`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an orphaned crash staging sibling neither blocks publication nor gets deleted", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const orphan = path.join(root, ".runtime.crashed-process.staging");
    mkdirSync(orphan, { mode: 0o700 });
    writeFileSync(path.join(orphan, "partial"), "CRASH-ORPHAN-MUST-REMAIN\n", { mode: 0o600 });

    stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target });

    assert.equal(existsSync(target), true);
    assert.equal(readFileSync(path.join(orphan, "partial"), "utf8"),
      "CRASH-ORPHAN-MUST-REMAIN\n",
      "an installer may clean only the random staging directory it created itself");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a byte-identical competing winner is verified and retained without replacement", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const winner = path.join(root, "prepared-winner");
    stageSystemHelperRuntime({ sourceRoot: source, targetRoot: winner });
    const winnerInode = lstatSync(winner).ino;
    let competed = false;

    const result = stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      testOnlySnapshotObserver: (event) => {
        if (!competed && event.phase === "before-release-publish") {
          renameSync(winner, target);
          competed = true;
        }
      } });

    assert.equal(result.version, "1.0.0");
    assert.equal(competed, true);
    assert.equal(lstatSync(target).ino, winnerInode,
      "the verified competing winner must not be replaced by this call's staging tree");
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".staging")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a malformed competing winner fails closed and is never replaced or repaired", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    let competed = false;
    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      testOnlySnapshotObserver: (event) => {
        if (!competed && event.phase === "before-release-publish") {
          mkdirSync(target, { mode: 0o700 });
          writeFileSync(path.join(target, "attacker-member"), "WINNER-MUST-STAY\n",
            { mode: 0o600 });
          competed = true;
        }
      } }), /SYSTEM_HELPER_RELEASE_IMMUTABLE_MISMATCH/);
    assert.equal(readFileSync(path.join(target, "attacker-member"), "utf8"),
      "WINNER-MUST-STAY\n");
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".staging")), [],
      "refusal cleans this call's staging only, never the competing target");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid empty publication claim fails closed without being guessed or deleted", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const claim = path.join(root, ".runtime.publish-claim");
    mkdirSync(claim, { mode: 0o700 });

    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target }),
      /SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_INVALID/);
    assert.equal(existsSync(target), false);
    assert.equal(lstatSync(claim).isDirectory(), true,
      "a losing installer must never remove a claim it did not create");
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".staging")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a structurally valid live-owner publication claim remains busy and untouched", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const claim = writePublicationClaim(root, "runtime", process.pid);
    const before = readFileSync(claim);
    const inode = lstatSync(claim).ino;

    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target }),
      /SYSTEM_HELPER_RELEASE_PUBLICATION_BUSY/);
    assert.equal(existsSync(target), false);
    assert.deepEqual(readFileSync(claim), before);
    assert.equal(lstatSync(claim).ino, inode);
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".staging")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an expired stable claim is recovered despite PID reuse reporting a live owner", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const clock = Date.parse("2026-08-22T12:00:00.000Z");
    const claim = writePublicationClaim(root, "runtime", process.pid,
      "2026-08-22T10:59:59.999Z");

    const result = stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      testOnlyNow: () => clock });

    assert.equal(result.version, "1.0.0");
    assert.equal(existsSync(target), true);
    assert.equal(existsSync(claim), false,
      "the one-hour publication lease bounds PID-reuse availability failures");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a structurally valid dead-owner claim is stably recovered and first install completes", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const deadPid = Number(execFileSync(process.execPath,
      ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" }));
    const claim = writePublicationClaim(root, "runtime", deadPid);

    const result = stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target });

    assert.equal(result.version, "1.0.0");
    assert.equal(existsSync(target), true);
    assert.equal(existsSync(claim), false,
      "dead claim is removed, then this call's new claim is removed after publication");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publication claim symlink is refused without inspecting or touching its victim", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const victim = path.join(root, "claim-victim");
    const claim = path.join(root, ".runtime.publish-claim");
    mkdirSync(victim, { mode: 0o700 });
    writeFileSync(path.join(victim, "private"), "CLAIM-VICTIM-MUST-STAY\n", { mode: 0o600 });
    symlinkSync(victim, claim);

    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target }),
      /SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_SYMLINK_REFUSED/);
    assert.equal(lstatSync(claim).isSymbolicLink(), true);
    assert.equal(readFileSync(path.join(victim, "private"), "utf8"),
      "CLAIM-VICTIM-MUST-STAY\n");
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("claim-file publication crash points expose either no fixed claim or one complete receipt",
  async (t) => {
    const cases = [
      ["before-link", "publication-claim-temp-durable", false],
      ["after-link", "publication-claim-linked", true],
    ];
    for (const [name, phase, fixedClaimExpected] of cases) {
      await t.test(name, () => {
        const root = temporary();
        try {
          const source = createRuntimeFixtureSource(root);
          const target = path.join(root, "runtime");
          const claim = path.join(root, ".runtime.publish-claim");
          assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source,
            targetRoot: target, testOnlySnapshotObserver: (event) => {
              if (event.phase === phase) {
                if (phase === "publication-claim-linked") {
                  const temporaryStats = lstatSync(event.claimTemporary);
                  const fixedStats = lstatSync(event.publicationClaim);
                  assert.equal(fixedStats.dev, temporaryStats.dev);
                  assert.equal(fixedStats.ino, temporaryStats.ino,
                    "the fixed claim must be the exact hard-linked durable temp inode");
                  assert.deepEqual(readFileSync(event.publicationClaim),
                    readFileSync(event.claimTemporary));
                }
                throw new Error(`INJECTED_${name}`);
              }
            } }), new RegExp(`INJECTED_${name}`));
          assert.equal(existsSync(target), false);
          assert.equal(existsSync(claim), fixedClaimExpected);
          if (fixedClaimExpected) {
            const receipt = JSON.parse(readFileSync(claim, "utf8"));
            assert.equal(receipt.schema, "outsider/system-helper-publication-claim/v1");
            assert.equal(receipt.ownerPid, process.pid);
            assert.match(receipt.token,
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
            assert.equal(lstatSync(claim).mode & 0o777, 0o600);
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      });
    }
  });

test("orphan claim temporaries are ignored and never removed by a different installer", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const orphan = path.join(root, "..runtime.publish-claim.crashed.tmp");
    writeFileSync(orphan, "ORPHAN-CLAIM-TEMP-MUST-STAY\n", { mode: 0o600 });

    stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target });

    assert.equal(existsSync(target), true);
    assert.equal(readFileSync(orphan, "utf8"), "ORPHAN-CLAIM-TEMP-MUST-STAY\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("claim ownership is revalidated after pause and before winner check or rename", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    let replacementBytes;
    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      testOnlySnapshotObserver: (event) => {
        if (event.phase === "before-release-rename") {
          unlinkSync(event.publicationClaim);
          replacementBytes = Buffer.from(`${JSON.stringify({
            schema: "outsider/system-helper-publication-claim/v1",
            ownerPid: process.pid,
            createdAt: new Date().toISOString(),
            token: "550e8400-e29b-41d4-a716-446655440001",
          }, null, 2)}\n`);
          writeFileSync(event.publicationClaim, replacementBytes, { mode: 0o600 });
        }
      } }), /SYSTEM_HELPER_RELEASE_PUBLICATION_CLAIM_IDENTITY_CHANGED/);
    assert.equal(existsSync(target), false,
      "a caller that no longer owns the claim must never check/publish the final release");
    assert.deepEqual(readFileSync(path.join(root, ".runtime.publish-claim")), replacementBytes,
      "cleanup must not delete the replacement owner's stable claim");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publication recheck refuses an empty target inserted before rename", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    let targetInode;
    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      testOnlySnapshotObserver: (event) => {
        if (event.phase === "before-release-rename") {
          mkdirSync(target, { mode: 0o700 });
          targetInode = lstatSync(target).ino;
        }
      } }), /SYSTEM_HELPER_RELEASE_IMMUTABLE_MISMATCH/);
    assert.equal(lstatSync(target).ino, targetInode,
      "portable publication must not clobber an empty target visible at the final recheck");
    assert.deepEqual(readdirSync(target), []);
    assert.equal(existsSync(path.join(root, ".runtime.publish-claim")), false);
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".staging")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publication recheck refuses a target symlink without touching its victim", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const target = path.join(root, "runtime");
    const victim = path.join(root, "publication-victim");
    mkdirSync(victim, { mode: 0o700 });
    writeFileSync(path.join(victim, "keep"), "PUBLICATION-VICTIM-MUST-STAY\n",
      { mode: 0o600 });
    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      testOnlySnapshotObserver: (event) => {
        if (event.phase === "before-release-rename") symlinkSync(victim, target);
      } }), /SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED/);
    assert.equal(lstatSync(target).isSymbolicLink(), true);
    assert.equal(readFileSync(path.join(victim, "keep"), "utf8"),
      "PUBLICATION-VICTIM-MUST-STAY\n");
    assert.equal(existsSync(path.join(root, ".runtime.publish-claim")), false);
    assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".staging")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publication detects parent substitution and never publishes an attacker staging inode", () => {
  const root = temporary();
  try {
    const source = createRuntimeFixtureSource(root);
    const releases = path.join(root, "releases");
    const displaced = path.join(root, "releases-displaced");
    const target = path.join(releases, "1.0.0");
    mkdirSync(releases, { mode: 0o700 });
    let attackerStaging;
    assert.throws(() => stageSystemHelperRuntime({ sourceRoot: source, targetRoot: target,
      trustedRoot: root,
      testOnlySnapshotObserver: (event) => {
        if (event.phase === "before-release-publish") {
          renameSync(releases, displaced);
          mkdirSync(releases, { mode: 0o700 });
          attackerStaging = path.join(releases, path.basename(event.stagingRoot));
          mkdirSync(attackerStaging, { mode: 0o700 });
        }
      } }), /SYSTEM_HELPER_RELEASE_STAGING_IDENTITY_CHANGED/);
    assert.equal(existsSync(target), false,
      "the substituted parent must never receive a final release");
    assert.equal(existsSync(attackerStaging), true,
      "cleanup must refuse an attacker inode occupying the old staging pathname");
    assert.equal(readdirSync(displaced).some((name) => name.endsWith(".staging")), true,
      "without a dirfd, the displaced owned staging is preserved rather than guessed/deleted");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
  assert.doesNotMatch(plist, /OUTSIDER_SUPERVISOR/);
  assert.doesNotMatch(plist, /OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR/);
  assert.equal(systemHelperPath("/opt/node", "/custom/npm/bin:/usr/bin"),
    "/opt:/custom/npm/bin:/usr/bin:/usr/local/bin:/opt/homebrew/bin:/bin:/usr/sbin:/sbin");
});

test("LaunchAgent writes external supervisor command and consent as separate explicit fields", () => {
  const base = {
    nodeExecutable: "/opt/node", entry: "/opt/helper.mjs", workingDirectory: "/opt/runtime",
    attachedRoot: "/tmp/attached", socketPath: "/tmp/socket", token: "local-token",
    stdoutFile: "/tmp/out", stderrFile: "/tmp/err", environmentPath: "/usr/bin",
  };
  const argv = ["/Applications/Claude App/claude", "-p"];
  const plist = systemHelperPlist({ ...base, supervisorCommand: argv,
    allowExternalSupervisor: true });
  assert.match(plist, /<key>OUTSIDER_SUPERVISOR_ARGV<\/key>/);
  assert.match(plist, /\[&quot;\/Applications\/Claude App\/claude&quot;,&quot;-p&quot;\]/);
  assert.match(plist, /<key>OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR<\/key>\s*<string>1<\/string>/);
  assert.doesNotMatch(plist, /<key>OUTSIDER_SUPERVISOR<\/key>/);
  assert.throws(() => systemHelperPlist({ ...base, supervisorCommand: argv }),
    /CONSENT_REQUIRED/);
  assert.throws(() => systemHelperPlist({ ...base, allowExternalSupervisor: true }),
    /COMMAND_REQUIRED/);
  assert.throws(() => systemHelperPlist({ ...base,
    supervisorCommand: ["judge", "--api-key", "credential-plaintext"],
    allowExternalSupervisor: true }), /CONTAINS_INLINE_SECRET/);
  assert.throws(() => systemHelperPlist({ ...base,
    supervisorCommand: ["judge", "--token", "opaque-value"],
    allowExternalSupervisor: true }), /CONTAINS_INLINE_SECRET/);
});

test("host hook persists typed supervisor identity with literal shell quoting and no credential", () => {
  const root = temporary();
  try {
    const directory = path.join(root, "directory with spaces");
    mkdirSync(directory);
    const probe = path.join(directory, "hook probe.mjs");
    const injected = path.join(root, "must-not-exist");
    writeFileSync(probe, "process.stdout.write(JSON.stringify({"
      + "argv:process.argv.slice(2),"
      + "supervisorArgv:process.env.OUTSIDER_SUPERVISOR_ARGV,"
      + "consent:process.env.OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR"
      + "}));\n");
    const literal = `spaces ' \" $(touch ${shellQuoteHookValue(injected)}) ; end`;
    const supervisorCommand = ["/Applications/Judge Tool/bin/judge", "-p", literal];
    const base = `${shellQuoteHookValue(process.execPath)} ${shellQuoteHookValue(probe)}`;
    const command = hookCommandWithExternalSupervisor({ hookCommand: base,
      supervisorCommand, allowExternalSupervisor: true });
    const settings = JSON.stringify(hookConfigFor("claude-code", command).value);
    assert.match(settings, /OUTSIDER_SUPERVISOR_ARGV/);
    assert.match(settings, /OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR/);
    assert.doesNotMatch(settings, /API_KEY|credential-plaintext/,
      "settings persist command identity and consent, never a credential");
    const output = execFileSync("/bin/sh", ["-c", `${command} hook claude-code`], {
      encoding: "utf8", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    const observed = JSON.parse(output);
    assert.deepEqual(JSON.parse(observed.supervisorArgv), supervisorCommand);
    assert.equal(observed.consent, "1");
    assert.deepEqual(observed.argv, ["hook", "claude-code"]);
    assert.equal(existsSync(injected), false, "quoted argv JSON must not become shell syntax");
    assert.throws(() => hookCommandWithExternalSupervisor({ hookCommand: base,
      supervisorCommand: "judge --token credential-plaintext",
      allowExternalSupervisor: true }), /CONTAINS_INLINE_SECRET/);
    assert.throws(() => hookCommandWithExternalSupervisor({ hookCommand: base,
      supervisorCommand: "judge https://example.test/run?token=credential-plaintext",
      allowExternalSupervisor: true }), /CONTAINS_INLINE_SECRET/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
  assert.match(readFileSync(expected.tokenFile, "utf8"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n$/u);
  for (const directory of [path.dirname(expected.root), expected.root,
    path.dirname(expected.releaseRoot), expected.releaseRoot,
    path.join(expected.releaseRoot, "bin"), path.join(expected.releaseRoot, "src")]) {
    assert.equal(lstatSync(directory).mode & 0o777, 0o700,
      `${directory} must remain private`);
  }
  assert.equal(lstatSync(expected.tokenFile).mode & 0o777, 0o600);
  assert.equal(lstatSync(expected.plistFile).mode & 0o777, 0o600);
  assert.match(readFileSync(expected.plistFile, "utf8"), /<key>PATH<\/key>/);
  assert.doesNotMatch(readFileSync(expected.plistFile, "utf8"), /OUTSIDER_SUPERVISOR/);
  assert.deepEqual(calls.map((entry) => entry[1][0]), ["bootout", "bootstrap", "kickstart"]);
  assert.equal(result.registered, true);
  assert.equal(result.externalSupervisorConfigured, false);
  rmSync(home, { recursive: true, force: true });
});

test("installer persists a consented typed supervisor without shell coercion", () => {
  const home = temporary();
  const supervisorCommand = ["/Applications/Claude App/claude", "-p"];
  const result = installSystemHelper({ sourceRoot: path.resolve("."), home,
    nodeExecutable: "/opt/node", uid: 501, register: false,
    supervisorCommand, allowExternalSupervisor: true });
  const plist = readFileSync(result.plistFile, "utf8");
  assert.equal(result.externalSupervisorConfigured, true);
  assert.match(plist, /OUTSIDER_SUPERVISOR_ARGV/);
  assert.match(plist, /OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR/);
  assert.doesNotMatch(plist, /<key>OUTSIDER_SUPERVISOR<\/key>/);
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

test("installer refuses a token symlink without reading or rewriting its victim", () => {
  const root = temporary();
  try {
    const home = path.join(root, "home");
    const victim = path.join(root, "token-victim");
    mkdirSync(home);
    writeFileSync(victim, "VICTIM-MUST-STAY-BYTE-EXACT\n", { mode: 0o600 });
    const version = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version;
    const target = systemHelperPaths({ home, version, uid: 501 });
    mkdirSync(path.dirname(target.tokenFile), { recursive: true, mode: 0o700 });
    symlinkSync(victim, target.tokenFile);

    assert.throws(() => installSystemHelper({ sourceRoot: path.resolve("."), home,
      uid: 501, register: false }), /SYSTEM_HELPER_TOKEN_SYMLINK_REFUSED/);
    assert.equal(readFileSync(victim, "utf8"), "VICTIM-MUST-STAY-BYTE-EXACT\n");
    assert.equal(lstatSync(target.tokenFile).isSymbolicLink(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer keeps an existing private token byte- and inode-stable", () => {
  const root = temporary();
  try {
    const home = path.join(root, "home");
    mkdirSync(home);
    const version = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version;
    const target = systemHelperPaths({ home, version, uid: 501 });
    mkdirSync(path.dirname(target.tokenFile), { recursive: true, mode: 0o700 });
    const token = "550e8400-e29b-41d4-a716-446655440000";
    writeFileSync(target.tokenFile, `${token}\n`, { mode: 0o600 });
    const before = lstatSync(target.tokenFile);

    installSystemHelper({ sourceRoot: path.resolve("."), home, uid: 501, register: false });

    const after = lstatSync(target.tokenFile);
    assert.equal(readFileSync(target.tokenFile, "utf8"), `${token}\n`);
    assert.equal(after.ino, before.ino, "an existing token must be read, not rewritten");
    assert.equal(after.mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer rejects weak, multiline, and non-canonical existing tokens without echoing them", async (t) => {
  const valid = "550e8400-e29b-41d4-a716-446655440000";
  const cases = [
    ["short", "guessme\n"],
    ["multiline", `${valid}\nEXTRA-PRIVATE-MARKER\n`],
    ["non-v4", "550e8400-e29b-11d4-a716-446655440000\n"],
  ];
  for (const [name, serialized] of cases) {
    await t.test(name, () => {
      const root = temporary();
      try {
        const home = path.join(root, "home");
        mkdirSync(home);
        const version = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version;
        const target = systemHelperPaths({ home, version, uid: 501 });
        mkdirSync(path.dirname(target.tokenFile), { recursive: true, mode: 0o700 });
        writeFileSync(target.tokenFile, serialized, { mode: 0o600 });
        let observed;
        assert.throws(() => installSystemHelper({ sourceRoot: path.resolve("."), home,
          uid: 501, register: false }), (error) => {
          observed = String(error?.message ?? error);
          return /SYSTEM_HELPER_TOKEN_FORMAT_INVALID/.test(observed);
        });
        assert.equal(readFileSync(target.tokenFile, "utf8"), serialized);
        assert.equal(observed.includes(serialized.trim()), false,
          "refusal must never echo token-file contents");
        assert.equal(observed.includes("EXTRA-PRIVATE-MARKER"), false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("random exclusive plist temp never touches the old predictable temp symlink", () => {
  const root = temporary();
  try {
    const home = path.join(root, "home");
    const victim = path.join(root, "plist-temp-victim");
    mkdirSync(home);
    writeFileSync(victim, "PREDICTABLE-TEMP-VICTIM\n", { mode: 0o600 });
    const version = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version;
    const target = systemHelperPaths({ home, version, uid: 501 });
    mkdirSync(path.dirname(target.plistFile), { recursive: true });
    const predictableTemporary = `${target.plistFile}.${process.pid}.tmp`;
    symlinkSync(victim, predictableTemporary);

    const installed = installSystemHelper({ sourceRoot: path.resolve("."), home,
      uid: 501, register: false });

    assert.equal(installed.plistFile, target.plistFile);
    assert.equal(readFileSync(victim, "utf8"), "PREDICTABLE-TEMP-VICTIM\n");
    assert.equal(lstatSync(predictableTemporary).isSymbolicLink(), true);
    assert.equal(lstatSync(target.plistFile).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(path.dirname(target.plistFile))
      .filter((name) => name.endsWith(".tmp")), [path.basename(predictableTemporary)]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer refuses a final plist symlink without touching its victim", () => {
  const root = temporary();
  try {
    const home = path.join(root, "home");
    const victim = path.join(root, "plist-victim");
    mkdirSync(home);
    writeFileSync(victim, "PLIST-VICTIM\n", { mode: 0o600 });
    const version = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")).version;
    const target = systemHelperPaths({ home, version, uid: 501 });
    mkdirSync(path.dirname(target.plistFile), { recursive: true });
    symlinkSync(victim, target.plistFile);

    assert.throws(() => installSystemHelper({ sourceRoot: path.resolve("."), home,
      uid: 501, register: false }), /SYSTEM_HELPER_PLIST_SYMLINK_REFUSED/);
    assert.equal(readFileSync(victim, "utf8"), "PLIST-VICTIM\n");
    assert.equal(lstatSync(target.plistFile).isSymbolicLink(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer refuses an intermediate Library symlink without touching its victim", () => {
  const root = temporary();
  try {
    const home = path.join(root, "home");
    const redirected = path.join(root, "redirected-library");
    mkdirSync(home);
    mkdirSync(redirected);
    writeFileSync(path.join(redirected, "victim"), "LIBRARY-VICTIM\n");
    symlinkSync(redirected, path.join(home, "Library"));

    assert.throws(() => installSystemHelper({ sourceRoot: path.resolve("."), home,
      uid: 501, register: false }), /SYSTEM_HELPER_PLIST_DIRECTORY_SYMLINK_REFUSED/);
    assert.equal(readFileSync(path.join(redirected, "victim"), "utf8"), "LIBRARY-VICTIM\n");
    assert.deepEqual(readdirSync(redirected), ["victim"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installer refuses an intermediate releases symlink without touching its victim", () => {
  const root = temporary();
  try {
    const home = path.join(root, "home");
    const redirected = path.join(root, "redirected-releases");
    mkdirSync(home);
    mkdirSync(redirected);
    writeFileSync(path.join(redirected, "victim"), "RELEASE-VICTIM\n");
    const helperRoot = path.join(home, ".outsider", "system-helper");
    mkdirSync(helperRoot, { recursive: true, mode: 0o700 });
    symlinkSync(redirected, path.join(helperRoot, "releases"));

    assert.throws(() => installSystemHelper({ sourceRoot: path.resolve("."), home,
      uid: 501, register: false }), /SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED/);
    assert.equal(readFileSync(path.join(redirected, "victim"), "utf8"), "RELEASE-VICTIM\n");
    assert.deepEqual(readdirSync(redirected), ["victim"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime staging refuses release root, bin, and src symlink redirects", async (t) => {
  for (const component of ["release-root", "bin", "src"]) {
    await t.test(component, () => {
      const root = temporary();
      try {
        const releases = path.join(root, "releases");
        const target = path.join(releases, "1.0.0");
        const redirected = path.join(root, `redirected-${component}`);
        mkdirSync(releases);
        mkdirSync(redirected);
        writeFileSync(path.join(redirected, "victim"), `${component}-VICTIM\n`);
        if (component === "release-root") {
          symlinkSync(redirected, target);
        } else {
          mkdirSync(target);
          symlinkSync(redirected, path.join(target, component));
        }

        assert.throws(() => stageSystemHelperRuntime({ sourceRoot: path.resolve("."),
          targetRoot: target, trustedRoot: root }), /SYSTEM_HELPER_RELEASE_SYMLINK_REFUSED/);
        assert.equal(readFileSync(path.join(redirected, "victim"), "utf8"),
          `${component}-VICTIM\n`);
        assert.deepEqual(readdirSync(redirected), ["victim"]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
