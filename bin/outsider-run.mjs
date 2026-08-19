#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveClaudeExecutable, startKernelRun } from "../src/outsider-kernel-runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    const name = item.slice(2);
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) options[name] = true;
    else { options[name] = value; index += 1; }
  }
  return { positional, options };
}

export async function main(argv = process.argv.slice(2)) {
  const { positional, options } = parseArgs(argv);
  const ask = positional[0];
  const cwd = path.resolve(options.cwd || process.cwd());
  const acceptance = options.accept || null;
  const supervisorCommand = options.supervisor || process.env.OUTSIDER_SUPERVISOR
    || [resolveClaudeExecutable(options.worker || null), "-p"];
  const stateRoot = options["state-root"] ? path.resolve(options["state-root"]) : undefined;
  const hookEntry = path.join(here, "outsider-hook.mjs");
  const maxBudgetUsd = Number(options["max-budget-usd"]);
  let canonicalCase = null;
  if (options["canonical-case"]) {
    try {
      canonicalCase = JSON.parse(readFileSync(path.resolve(options["canonical-case"]), "utf8"));
    } catch (error) {
      console.error(`canonical case 无法读取：${error?.message ?? error}`);
      return 2;
    }
  }

  if (!ask || !acceptance || !existsSync(hookEntry)
    || !Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0) {
    console.error("用法: outsider run \"<操作方原话>\" --accept \"<验收命令>\" --max-budget-usd <金额> [--supervisor \"claude -p\"] [--cwd <repo>] [--semantic-patrol-every 96] [--semantic-patrol-min-evidence 6] [--max-controller-restarts 3]");
    console.error("Stage 0.5 controlled mode 不允许缺少合同、验收、独立 supervisor 或 worker 成本上限；只观察请继续使用普通 hook。\n");
    return 2;
  }

  let run;
  try {
    run = await startKernelRun({
    cwd,
    ask,
    acceptance,
    supervisorCommand,
    hookEntry,
    stateRoot,
    workerExecutable: options.worker || null,
    budgetMs: options["budget-ms"] ? Number(options["budget-ms"]) : undefined,
    maxBudgetUsd,
    canonicalCase,
    controllerOptions: {
      maxSupervisorCalls: options["max-supervisor-calls"]
        ? Number(options["max-supervisor-calls"]) : 24,
      semanticPatrolEvery: options["semantic-patrol-every"]
        ? Number(options["semantic-patrol-every"]) : 96,
      semanticPatrolMinEvidenceSteps: options["semantic-patrol-min-evidence"]
        ? Number(options["semantic-patrol-min-evidence"]) : 6,
      maxControllerRestarts: options["max-controller-restarts"]
        ? Number(options["max-controller-restarts"]) : 3,
    },
    });
  } catch (error) {
    console.error(`Outsider controlled run 没有启动：${error?.message ?? error}`);
    console.error("worker 尚未出现；这次运行不算 Stage 0.5，也没有消耗 worker 的任务预算。");
    return 1;
  }

  console.log(`\nOutsider Stage 0.5 controlled run`);
  console.log(`runId: ${run.runId}`);
  console.log(`contract: ${run.contract.seal}`);
  console.log(`state: ${run.store.directory}`);
  console.log(`events: ${run.store.eventsPath}\n`);

  run.child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  run.child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  run.child.once("error", async (error) => {
  await run.record("worker_launch_failed", { error: String(error?.message ?? error) })
    .catch(() => undefined);
  console.error(`worker 启动失败: ${error?.message ?? error}`);
  await run.rpc.close();
  process.exitCode = 1;
  });
  run.child.once("close", async (code, signal) => {
  await run.record("worker_exit", { code, signal }).catch(() => undefined);
  const result = await run.finish();
    const evidenceComplete = result.evidence?.ok === true;
    const status = result.proof.complete && evidenceComplete ? "COMPLETE" : "INCOMPLETE";
  console.log(`\n${"═".repeat(68)}`);
  console.log(`Outsider causal proof: ${status}`);
  console.log(`independent acceptance: ${result.acceptance.passed === true ? "PASS" : "FAIL"}`);
    if (!result.proof.complete) {
    for (const error of result.proof.errors) console.log(`  ✗ ${error}`);
    }
    if (!evidenceComplete) console.log(`  ✗ canonical evidence failed: ${result.evidence?.error ?? "missing"}`);
    if (evidenceComplete) {
      console.log(`evidence: ${path.join(run.store.directory, "stage05-evidence-manifest.json")}`);
      console.log(`projection: ${path.join(run.store.directory, "stage05-canonical-projection.json")}`);
    }
    console.log(`events: ${run.store.eventsPath}\n`);
    process.exitCode = result.proof.complete && evidenceComplete && code === 0 ? 0 : 1;
  });
  return 0;
}

let directEntry = false;
try { directEntry = realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (directEntry) {
  process.exitCode = await main();
}
