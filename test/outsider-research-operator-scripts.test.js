import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const registry = JSON.parse(readFileSync("scripts/research-operator-scripts.json", "utf8"));

test("previously orphaned local research scripts are classified and have safe help", () => {
  assert.equal(registry.schema, "outsider/local-research-operator-script-registry/v1");
  assert.equal(registry.entries.length, 9);
  assert.equal(new Set(registry.entries.map((entry) => entry.path)).size,
    registry.entries.length);
  for (const entry of registry.entries) {
    assert.match(entry.path, /^scripts\/[a-z0-9-]+\.mjs$/u);
    assert.ok(existsSync(entry.path), entry.path);
    assert.match(entry.status, /^(?:FROZEN_|SUPPORTED_|HISTORICAL_|SUPERSEDED_)/u);
    assert.ok(entry.currentUse.length > 40, entry.path);
    const help = spawnSync(process.execPath, [entry.path, "--help"], {
      encoding: "utf8", timeout: 15_000,
    });
    assert.equal(help.status, 0, `${entry.path}: ${help.stderr}`);
    assert.match(help.stdout, /usage/i, entry.path);
  }
});
