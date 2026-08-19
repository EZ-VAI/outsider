import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { guardedClaudePlan } from "../scripts/claude-budget-guard.mjs";
import { materializeEvaluationClaudeGuard } from
  "../scripts/stage05-claude-budget-runtime.mjs";

test("budget guard pins an unconfigured worker to Sonnet low", () => {
  const plan = guardedClaudePlan(["-p", "do work", "--max-budget-usd", "10"], {
    maxBudgetUsd: 1,
  });
  assert.equal(plan.model, "sonnet");
  assert.equal(plan.effort, "low");
  assert.equal(plan.maxBudgetUsd, 1);
  assert.deepEqual(plan.args.slice(0, 4), ["--effort", "low", "--model", "sonnet"]);
  assert.equal(plan.args[plan.args.indexOf("--max-budget-usd") + 1], "1");
});

test("budget guard rejects Opus and elevated effort before launch", () => {
  assert.throws(() => guardedClaudePlan(["-p", "x", "--model", "opus"]),
    /MODEL_REJECTED:opus/);
  assert.throws(() => guardedClaudePlan(["-p", "x", "--model", "sonnet",
    "--effort", "high"]), /EFFORT_REJECTED:high/);
  assert.throws(() => guardedClaudePlan(["-p", "x", "--effort", "medium"]),
    /EFFORT_REJECTED:medium/);
});

test("auth, help and version probes remain zero-model metadata calls", () => {
  for (const args of [["auth", "status"], ["--help"], ["--version"]]) {
    const plan = guardedClaudePlan(args);
    assert.equal(plan.metadataOnly, true);
    assert.deepEqual(plan.args, args);
    assert.equal(plan.model, null);
  }
});

test("main enforces the aggregate model-invocation ceiling before launch", async () => {
  const { main } = await import("../scripts/claude-budget-guard.mjs");
  const dir = mkdtempSync(join(tmpdir(), "outsider-budget-guard-"));
  const log = join(dir, "audit.jsonl");
  const saved = { ...process.env };
  Object.assign(process.env, {
    OUTSIDER_REAL_CLAUDE: "/bin/false",
    OUTSIDER_CLAUDE_BUDGET_DRY_RUN: "1",
    OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG: log,
    OUTSIDER_CLAUDE_MAX_INVOCATIONS: "1",
  });
  try {
    assert.equal(await main(["-p", "first"]), 0);
    await assert.rejects(main(["-p", "second"]), /INVOCATION_LIMIT:1/);
    const rows = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].invocationOrdinal, 1);
    assert.equal(rows[0].model, "sonnet");
    assert.equal(rows[0].effort, "low");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("a disclosed R1 retry envelope may be capped at thirteen processes", async () => {
  const { main } = await import("../scripts/claude-budget-guard.mjs");
  const dir = mkdtempSync(join(tmpdir(), "outsider-budget-thirteen-"));
  const log = join(dir, "audit.jsonl");
  const saved = { ...process.env };
  Object.assign(process.env, {
    OUTSIDER_REAL_CLAUDE: "/bin/false",
    OUTSIDER_CLAUDE_BUDGET_DRY_RUN: "1",
    OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG: log,
    OUTSIDER_CLAUDE_MAX_INVOCATIONS: "13",
  });
  try {
    for (let ordinal = 1; ordinal <= 13; ordinal += 1) {
      assert.equal(await main(["-p", `call-${ordinal}`]), 0);
    }
    await assert.rejects(main(["-p", "call-14"]), /INVOCATION_LIMIT:13/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("the executable guard accepts the disclosed R5 ceiling and rejects one process more", async () => {
  const { main } = await import("../scripts/claude-budget-guard.mjs");
  const dir = mkdtempSync(join(tmpdir(), "outsider-budget-team-"));
  const log = join(dir, "audit.jsonl");
  const saved = { ...process.env };
  Object.assign(process.env, {
    OUTSIDER_REAL_CLAUDE: "/bin/false",
    OUTSIDER_CLAUDE_BUDGET_DRY_RUN: "1",
    OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG: log,
    OUTSIDER_CLAUDE_MAX_INVOCATIONS: "28",
  });
  try {
    for (let ordinal = 1; ordinal <= 28; ordinal += 1) {
      assert.equal(await main(["-p", `team-${ordinal}`]), 0);
    }
    await assert.rejects(main(["-p", "team-29"]), /INVOCATION_LIMIT:28/);
    process.env.OUTSIDER_CLAUDE_MAX_INVOCATIONS = "65";
    await assert.rejects(main(["-p", "over-product-ceiling"]),
      /OUTSIDER_CLAUDE_MAX_INVOCATIONS_INVALID/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("the guard remains executable through a claude-named symlink", () => {
  const dir = mkdtempSync(join(tmpdir(), "outsider-budget-link-"));
  const link = join(dir, "claude");
  const log = join(dir, "audit.jsonl");
  symlinkSync(new URL("../scripts/claude-budget-guard.mjs", import.meta.url), link);
  const result = spawnSync(link, ["--version"], {
    encoding: "utf8",
    env: { ...process.env, OUTSIDER_REAL_CLAUDE: "/bin/echo",
      OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG: log },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--version/);
  const row = JSON.parse(readFileSync(log, "utf8").trim());
  assert.equal(row.metadataOnly, true);
  assert.equal(row.invocationOrdinal, null);
});

test("an evaluation runtime shares one bounded Sonnet-low ledger", () => {
  const dir = mkdtempSync(join(tmpdir(), "outsider-budget-runtime-"));
  const runtime = materializeEvaluationClaudeGuard({ directory: dir,
    realClaude: "/bin/echo", maxBudgetUsd: 0.5, maxInvocations: 28 });
  assert.equal(runtime.policy.model, "sonnet");
  assert.equal(runtime.policy.effort, "low");
  assert.equal(runtime.policy.maximumModelProcesses, 28);
  assert.equal(runtime.policy.interactiveDollarHardCapEnforced, false);
  assert.equal(runtime.environment.OUTSIDER_CLAUDE_MAX_INVOCATIONS, "28");
  assert.equal(runtime.environment.OUTSIDER_CLAUDE_MAX_BUDGET_USD, "0.5");
  assert.equal(runtime.executable, join(dir, "claude"));
  const formal = materializeEvaluationClaudeGuard({ directory: join(dir, "formal"),
    realClaude: "/bin/echo", maxBudgetUsd: 0.5, maxInvocations: 61 });
  assert.equal(formal.policy.maximumModelProcesses, 61);
  assert.throws(() => materializeEvaluationClaudeGuard({ directory: dir,
    realClaude: "/bin/echo", maxBudgetUsd: 0.5, maxInvocations: 65 }),
  /EVALUATION_GUARD_MAX_INVOCATIONS_INVALID/);
});
