import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(".");
const SCRIPTS = [
  "scripts/openai-universal-plugin-validate.mjs",
  "scripts/stage05-public-package.mjs",
  "scripts/local-artifact-canonical-index.mjs",
  "scripts/stage15-public-agent-corpus.mjs",
  "scripts/stage05-agent-team-probe.mjs",
  "scripts/stage05-endurance-witness.mjs",
  "scripts/stage05-recovery-family-tally.mjs",
  "scripts/stage05-r1-repeatability-tally.mjs",
  "scripts/stage2-factor-predictive-shadow.mjs",
  "scripts/stage2-actuarial-mechanism-shadow.mjs",
  "scripts/outsider-gate-corpus.mjs",
];

test("operator CLIs execute rather than silently skipping main through a symlinked path", (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-script-main-link-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  for (const [index, relative] of SCRIPTS.entries()) {
    const alias = path.join(temporary, `script-${index}.mjs`);
    symlinkSync(path.join(ROOT, relative), alias);
    const result = spawnSync(process.execPath, [alias, "--help"], {
      cwd: ROOT, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.error, undefined, `${relative}: ${result.error?.message ?? ""}`);
    assert.notEqual(`${result.stdout}${result.stderr}`, "",
      `${relative} silently skipped its CLI main through a symlinked entry path`);
  }
});
