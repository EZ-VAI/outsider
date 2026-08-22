import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(".");

test("try replay emits hash-only feedback unless raw local view is explicit", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-try-private-Alice-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const transcript = path.join(directory, "private-session.jsonl");
  const command = "terraform apply -var api_token=SUPER_SECRET_123 "
    + "-var callback=https://example.test/cb?token=URL_SECRET";
  writeFileSync(transcript,
    `${JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use",
      id: "tool-1", name: "Bash", input: { command } }] } })}\n`
    + `${JSON.stringify({ type: "user", message: { content: [{ type: "tool_result",
      tool_use_id: "tool-1", content: "not run" }] } })}\n`);
  const safe = spawnSync(process.execPath, ["try.mjs", transcript],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(safe.status, 0, safe.stderr);
  assert.match(safe.stdout, /command:[0-9a-f]{20}/);
  for (const forbidden of ["SUPER_SECRET_123", "URL_SECRET", "api_token",
    "private-session.jsonl", "outsider-try-private-Alice", "terraform apply"]) {
    assert.equal(safe.stdout.includes(forbidden), false, forbidden);
  }
  assert.match(safe.stdout, /不要发送原始日志、路径或命令/);

  const raw = spawnSync(process.execPath, ["try.mjs", transcript, "--show-raw-local"],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(raw.status, 0, raw.stderr);
  assert.equal(raw.stdout.includes("SUPER_SECRET_123"), true);
  assert.match(raw.stdout, /仅在本机查看；不要复制、发送或贴出原文/);
});
