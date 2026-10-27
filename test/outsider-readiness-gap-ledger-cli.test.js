import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = path.resolve("scripts/outsider-readiness-gap-ledger.mjs");

test("readiness CLI emits a deterministic no-authority ledger", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-readiness-cli-"));
  try {
    const out = path.join(root, "ledger.json");
    const first = spawnSync(process.execPath, [SCRIPT, "--out", out], { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const receipt = JSON.parse(first.stdout);
    const ledger = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(receipt.ok, true);
    assert.equal(receipt.gaps, ledger.gaps.length);
    assert.equal(receipt.stages.find((stage) => stage.stage === "MEASURE")
      .blockedExternalPlatformCapability, 2);
    assert.equal(receipt.ledgerHash, ledger.ledgerHash);
    assert.equal(ledger.authority.permitsPrice, false);
    assert.equal(ledger.authority.permitsGuarantee, false);
    assert.equal(ledger.authority.permitsSettlement, false);
    const second = spawnSync(process.execPath, [SCRIPT, "--out", out], { encoding: "utf8" });
    assert.notEqual(second.status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a caller submission is retained without external closure credit", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-readiness-submission-"));
  try {
    const submission = path.join(root, "submission.json");
    const out = path.join(root, "ledger.json");
    writeFileSync(submission, JSON.stringify({
      schema: "outsider/readiness-external-submission/v1",
      gapId: "S1_REAL_CONTRIBUTED_RUNS",
      artifactHash: `sha256:${"a".repeat(64)}`,
      sourceKind: "CALLER_PROVIDED_HASH_ONLY",
      submittedAt: "2026-08-21T00:00:00.000Z",
    }));
    const result = spawnSync(process.execPath,
      [SCRIPT, "--submission", submission, "--out", out], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const ledger = JSON.parse(readFileSync(out, "utf8"));
    const gap = ledger.gaps.find((item) => item.gapId === "S1_REAL_CONTRIBUTED_RUNS");
    assert.equal(gap.status, "BLOCKED_EXTERNAL");
    assert.equal(gap.submissions[0].disposition, "SUBMITTED_UNVERIFIED");
    assert.equal(gap.submissions[0].closureCredit, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
