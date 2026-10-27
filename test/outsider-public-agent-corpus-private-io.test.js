import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { fetchToFile, main } from
  "../scripts/stage15-public-agent-corpus.mjs";

const mode = (file) => lstatSync(file).mode & 0o777;

test("public-agent acquisition creates private no-clobber files and directories", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-public-agent-private-"));
  chmodSync(root, 0o755);
  const target = path.join(root, "source", "record.json");
  const expected = Buffer.from('{"ok":true}\n', "utf8");

  const result = await fetchToFile(
    `data:application/json,${encodeURIComponent(expected.toString("utf8"))}`,
    target,
    { outputRoot: root, trustedAncestor: path.dirname(root) },
  );

  assert.equal(result.sizeBytes, expected.length);
  assert.deepEqual(readFileSync(target), expected);
  assert.equal(mode(path.dirname(target)), 0o700);
  assert.equal(mode(target), 0o600);

  chmodSync(target, 0o644);
  await fetchToFile(
    `data:application/json,${encodeURIComponent(expected.toString("utf8"))}`,
    target,
    { outputRoot: root, trustedAncestor: path.dirname(root) },
  );
  assert.equal(mode(target), 0o600);
});

test("public-agent acquisition rejects target symlinks and ignores attacker partial names", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-public-agent-symlink-"));
  const victim = path.join(root, "victim.txt");
  writeFileSync(victim, "DO_NOT_TOUCH", { mode: 0o600 });

  const linkedTarget = path.join(root, "linked.json");
  symlinkSync(victim, linkedTarget);
  await assert.rejects(
    fetchToFile("data:text/plain,attacker", linkedTarget,
      { outputRoot: root, trustedAncestor: path.dirname(root) }),
    /PUBLIC_AGENT_FILE_UNSAFE/u,
  );
  assert.equal(readFileSync(victim, "utf8"), "DO_NOT_TOUCH");

  const target = path.join(root, "fresh.json");
  symlinkSync(victim, `${target}.partial`);
  await fetchToFile("data:text/plain,safe", target,
    { outputRoot: root, trustedAncestor: path.dirname(root) });
  assert.equal(readFileSync(target, "utf8"), "safe");
  assert.equal(readFileSync(victim, "utf8"), "DO_NOT_TOUCH");
});

test("public-agent acquisition rejects a symlink in an output-root descendant", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-public-agent-ancestor-"));
  const external = mkdtempSync(path.join(os.tmpdir(), "outsider-public-agent-external-"));
  const externalNested = path.join(external, "nested");
  mkdirSync(externalNested, { mode: 0o755 });
  chmodSync(external, 0o755);
  chmodSync(externalNested, 0o755);
  symlinkSync(external, path.join(root, "redirect"));
  const target = path.join(root, "redirect", "nested", "record.json");

  await assert.rejects(
    fetchToFile("data:text/plain,forbidden", target,
      { outputRoot: root, trustedAncestor: path.dirname(root) }),
    /PUBLIC_AGENT_DIRECTORY_UNSAFE/u,
  );
  assert.equal(lstatSync(external).mode & 0o777, 0o755);
  assert.equal(lstatSync(externalNested).mode & 0o777, 0o755,
    "external directories must not be chmodded through the symlink");
});

test("public-agent acquisition rejects a symlink inside the declared output root itself", async () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "outsider-public-agent-root-anchor-"));
  const external = mkdtempSync(path.join(os.tmpdir(), "outsider-public-agent-root-external-"));
  const externalNested = path.join(external, "nested");
  mkdirSync(externalNested, { mode: 0o755 });
  chmodSync(external, 0o755);
  chmodSync(externalNested, 0o755);
  symlinkSync(external, path.join(base, "redirect"));
  const outputRoot = path.join(base, "redirect", "nested");

  await assert.rejects(
    fetchToFile("data:text/plain,forbidden", path.join(outputRoot, "record.json"),
      { outputRoot, trustedAncestor: base }),
    /PUBLIC_AGENT_DIRECTORY_UNSAFE/u,
  );
  assert.equal(lstatSync(external).mode & 0o777, 0o755);
  assert.equal(lstatSync(externalNested).mode & 0o777, 0o755);
});

test("public-agent acquisition help is side-effect free", async () => {
  assert.equal(await main(["--help"]), 0);
});
