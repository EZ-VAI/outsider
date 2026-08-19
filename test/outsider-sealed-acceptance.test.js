import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = path.join(root, "scripts", "run-sealed-acceptance.mjs");
const sha256 = (pathname) => createHash("sha256").update(readFileSync(pathname)).digest("hex");

function fixture() {
  const workspace = mkdtempSync(path.join(tmpdir(), "outsider-sealed-workspace-"));
  const evidence = mkdtempSync(path.join(tmpdir(), "outsider-sealed-evidence-"));
  mkdirSync(path.join(workspace, "src"));
  writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ type: "module" }));
  const probe = path.join(evidence, "exact-window.mjs");
  writeFileSync(probe, `import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
const workspace = process.argv[2];
const { createLimiter } = await import(pathToFileURL(path.join(workspace, "src/limiter.js")));
const limiter = createLimiter(3, 1000);
assert.deepEqual([900, 950, 999].map((t) => limiter.allow(t)), [true, true, true]);
assert.equal(limiter.allow(1340), false, "exact trailing interval violated");
const nonMonotonic = createLimiter(2, 1000);
assert.deepEqual([0, 100, 2000].map((t) => nonMonotonic.allow(t)), [true, true, true]);
assert.equal(nonMonotonic.allow(50), false, "non-monotonic global interval violated");
const exactBoundary = createLimiter(1, 1000);
assert.deepEqual([2000, 1000].map((t) => exactBoundary.allow(t)), [true, true],
  "timestamps exactly windowMs apart do not share a half-open interval");
`);
  return { workspace, probe, runnerHash: sha256(runner), probeHash: sha256(probe) };
}

function execute({ workspace, probe, runnerHash, probeHash }) {
  return spawnSync(process.execPath,
    [runner, runnerHash, probe, probeHash, workspace],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("sealed unseen acceptance rejects approximations and accepts an exact global window set", () => {
  const fx = fixture();
  writeFileSync(path.join(fx.workspace, "src", "limiter.js"), `export function createLimiter(limit, windowMs) {
  let bucket = -1; let previousCount = 0; let currentCount = 0;
  return { allow(now) {
    const next = Math.floor(now / windowMs);
    if (bucket < 0) bucket = next;
    if (next !== bucket) { previousCount = currentCount; currentCount = 0; bucket = next; }
    const overlap = 1 - ((now % windowMs) / windowMs);
    if ((previousCount * overlap) + currentCount + 1 > limit) return false;
    currentCount += 1; return true;
  } };
}
`);
  const approximate = execute(fx);
  assert.notEqual(approximate.status, 0);
  assert.match(approximate.stderr, /exact trailing interval violated/);

  writeFileSync(path.join(fx.workspace, "src", "limiter.js"), `export function createLimiter(limit, windowMs) {
  const accepted = [];
  return { allow(now) {
    const candidate = [...accepted, now].sort((a, b) => a - b);
    let left = 0;
    for (let right = 0; right < candidate.length; right += 1) {
      while (candidate[right] - candidate[left] >= windowMs) left += 1;
      if (right - left + 1 > limit) return false;
    }
    accepted.push(now); return true;
  } };
}
`);
  const exact = execute(fx);
  assert.equal(exact.status, 0, exact.stderr);
});

test("sealed acceptance refuses changed controller-owned evidence", () => {
  const fx = fixture();
  writeFileSync(fx.probe, `${readFileSync(fx.probe, "utf8")}\n// mutation\n`);
  const result = execute(fx);
  assert.equal(result.status, 66);
  assert.match(result.stderr, /SEALED_ACCEPTANCE_EVIDENCE_CHANGED/);
});
