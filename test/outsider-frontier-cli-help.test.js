import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(".");
const CLIS = [
  "scripts/stage1-lifecycle-frontier.mjs",
  "scripts/stage2-quote-frontier.mjs",
  "scripts/stage3-guarantee-gate.mjs",
  "scripts/stage4-claims-lifecycle-frontier.mjs",
  "scripts/reality-stewardship-bind.mjs",
  "scripts/reality-stewardship-pilot.mjs",
];

test("frontier and stewardship CLIs provide side-effect-free successful help", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-cli-help-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const cli of CLIS) {
    const result = spawnSync(process.execPath, [path.join(ROOT, cli), "--help"],
      { cwd, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, `${cli}: ${result.stderr}`);
    assert.match(result.stdout, /(?:usage|Usage|Outsider)/);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(cwd), [], `${cli} created state during help`);
  }
});

test("the stewardship pilot rejects unknown arguments instead of running", () => {
  const result = spawnSync(process.execPath,
    [path.join(ROOT, "scripts/reality-stewardship-pilot.mjs"), "--unknown"],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REALITY_STEWARDSHIP_PILOT_ARGUMENT_INVALID/);
  assert.equal(result.stdout, "");
});
