import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { appendComplianceLedgerRecord, complianceLedgerStatus,
  eraseComplianceLedger, scoreProjectedProbe, shadowRecord } from "../src/outsider-compliance.js";
import { handleHookInvocation } from "../src/outsider-hook.js";

const secretCommand = "terraform apply -var api_token=SUPER_SECRET_123 -var path=/Users/Alice/private";

test("compliance ledger is off by default and creates no local file", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-ledger-off-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = handleHookInvocation({ env: {}, input: { cwd, hook_event_name: "PreToolUse",
    tool_name: "Bash", tool_input: { command: secretCommand } } });
  assert.notEqual(result.decision.verdict, "allow");
  assert.equal(existsSync(path.join(cwd, ".outsider", "shadow.jsonl")), false);
  assert.equal(existsSync(path.join(cwd, ".outsider")), false);
});

test("explicit opt-in writes only a bounded hash projection with private modes", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-ledger-on-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  handleHookInvocation({ env: { OUTSIDER_COMPLIANCE_LEDGER: "1" },
    input: { cwd, hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_input: { command: secretCommand } } });
  const directory = path.join(cwd, ".outsider");
  const file = path.join(directory, "shadow.jsonl");
  const bytes = readFileSync(file, "utf8");
  assert.equal(lstatSync(directory).mode & 0o777, 0o700);
  assert.equal(lstatSync(file).mode & 0o777, 0o600);
  for (const forbidden of ["SUPER_SECRET_123", "/Users/Alice", "terraform apply",
    "api_token", "private"]) assert.equal(bytes.includes(forbidden), false, forbidden);
  const row = JSON.parse(bytes.trim());
  assert.equal(row.v, 2);
  assert.match(row.signatureHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(row.retentionDays, 7);
  assert.equal(row.expiresAt - row.ts, 7 * 24 * 60 * 60 * 1000);
});

test("retention pruning and explicit erase are deterministic", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-ledger-retention-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { OUTSIDER_COMPLIANCE_LEDGER: "1",
    OUTSIDER_COMPLIANCE_RETENTION_DAYS: "2" };
  const record = shadowRecord({ decision: { verdict: "warn", proposed: {
    toolName: "Bash", sig: "already-hashed", file: "/private/path", risk: "unknown",
  } }, probe: null, arm: "live", spoke: true, workspaceRoot: cwd });
  const day = 24 * 60 * 60 * 1000;
  appendComplianceLedgerRecord({ cwd, record, env, now: day });
  writeFileSync(path.join(cwd, ".outsider", "shadow.jsonl"),
    `${JSON.stringify({ v: 1, ts: 3 * day, sig: "API_KEY=LEGACY_SECRET" })}\n`, { mode: 0o600 });
  appendComplianceLedgerRecord({ cwd, record, env, now: 4 * day });
  const file = path.join(cwd, ".outsider", "shadow.jsonl");
  const retained = readFileSync(file, "utf8");
  assert.equal(retained.trim().split("\n").length, 1);
  assert.equal(retained.includes("LEGACY_SECRET"), false);
  assert.equal(complianceLedgerStatus(cwd, env).exists, true);
  assert.equal(eraseComplianceLedger(cwd).erased, true);
  assert.equal(existsSync(file), false);
});

test("ledger refuses a symlink target without changing it", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-ledger-link-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const target = path.join(cwd, "target.txt");
  writeFileSync(target, "UNCHANGED\n");
  mkdirSync(path.join(cwd, ".outsider"), { mode: 0o700 });
  symlinkSync(target, path.join(cwd, ".outsider", "shadow.jsonl"));
  handleHookInvocation({ env: { OUTSIDER_COMPLIANCE_LEDGER: "1" },
    input: { cwd, hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_input: { command: secretCommand } } });
  assert.equal(readFileSync(target, "utf8"), "UNCHANGED\n");
  assert.throws(() => complianceLedgerStatus(cwd), /COMPLIANCE_LEDGER_FILE_UNSAFE/);
  assert.throws(() => eraseComplianceLedger(cwd), /COMPLIANCE_LEDGER_FILE_UNSAFE/);
});

test("v2 projected probes score in memory without recovering paths or actions", () => {
  const fileRecord = shadowRecord({ decision: { verdict: "warn", proposed: {
    toolName: "Edit", sig: "opaque", file: "/private/project/src/app.js", risk: "build",
  } }, probe: { kind: "edit-the-named-file", expect: { file: "src/app.js" }, window: 3 },
  arm: "experiment", spoke: false, origin: "worker-7", workspaceRoot: "/repo/pkgA" });
  assert.equal(fileRecord.originClass, "subagent");
  assert.equal(JSON.stringify(fileRecord).includes("src/app.js"), false);
  assert.equal(scoreProjectedProbe(fileRecord, [
    { isEdit: true, file: "src/app.js", origin: "worker-8" },
  ], { workspaceRoot: "/repo/pkgA" }), "unknown");
  assert.equal(scoreProjectedProbe(fileRecord, [
    { isEdit: true, file: "src/app.js", origin: "worker-7" },
  ], { workspaceRoot: "/repo/pkgB" }), "unknown",
  "a matching relative path under a different workspace cannot be scored as noncompliance");
  assert.equal(scoreProjectedProbe(fileRecord, [
    { isEdit: true, file: "/repo/pkgB/src/index.js", origin: "worker-7" },
  ], { workspaceRoot: "/repo/pkgA" }), "did-not");
  assert.equal(scoreProjectedProbe(fileRecord, [
    { isEdit: true, file: "src/app.js", origin: "worker-7" },
  ], { workspaceRoot: "/repo/pkgA" }), "complied");
  const collisionRecord = shadowRecord({ decision: { verdict: "warn", proposed: {
    toolName: "Edit", sig: "opaque", file: "/repo/pkgA/src/index.js", risk: "build",
  } }, probe: { kind: "edit-the-named-file",
    expect: { file: "/repo/pkgA/src/index.js" }, window: 3 },
  arm: "experiment", spoke: false, origin: "worker-7", workspaceRoot: "/repo" });
  assert.equal(scoreProjectedProbe(collisionRecord, [
    { isEdit: true, file: "/repo/pkgB/src/index.js", origin: "worker-7" },
  ], { workspaceRoot: "/repo" }), "did-not");

  const repeatRecord = shadowRecord({ decision: { verdict: "warn", proposed: {
    toolName: "Bash", sig: "opaque", risk: "unknown",
  } }, probe: { kind: "stop-repeating", expect: { action: "npm test" }, window: 2 },
  arm: "live", spoke: true, origin: "main" });
  assert.equal(JSON.stringify(repeatRecord).includes("npm test"), false);
  assert.equal(scoreProjectedProbe(repeatRecord, [{ action: "npm   test" }]), "did-not");
  assert.equal(scoreProjectedProbe(repeatRecord, [{ action: "npm run lint" }]), "complied");
});
