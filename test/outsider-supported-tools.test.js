import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(".");

test("the local-tools manifest has working help and no phantom scripts paths", () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, "tools", "supported-tools.json"), "utf8"));
  assert.equal(manifest.schema, "outsider/supported-local-tools/v1");
  const paths = manifest.tools.map((entry) => entry.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(paths, [...paths].sort());
  for (const entry of manifest.tools) {
    const result = spawnSync(process.execPath, [entry.path, "--help"],
      { cwd: ROOT, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, `${entry.path}: ${result.stderr}`);
    assert.match(result.stdout, new RegExp(entry.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(result.stdout, /node scripts\/outsider-/);
  }
});

test("retired detector calibration fails visibly without producing a result", () => {
  const result = spawnSync(process.execPath, ["tools/outsider-detector-calibration.mjs"],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /RETIRED_UNREPLAYABLE_LEGACY_TOOL/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
});
