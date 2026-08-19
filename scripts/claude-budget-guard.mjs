#!/usr/bin/env node
/*
 * Evaluation-only Claude launch guard.
 *
 * Reliability canaries launch many independent Claude processes.  An omitted
 * worker --model previously inherited the interactive account default (Opus 5
 * high in the observed R2 run), while supervisors were configured separately.
 * This wrapper makes the cost policy part of the executable identity: every
 * model-bearing invocation is Sonnet/low or it is rejected before Claude
 * starts.  Authentication/help/version probes are forwarded unchanged and do
 * not invoke a model.
 */

import {
  appendFileSync, mkdirSync, readFileSync, realpathSync, rmdirSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { MAX_EVALUATION_MODEL_PROCESSES } from "./stage05-model-cost-policy.mjs";

const digest = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;

function optionValue(args, name) {
  const direct = args.indexOf(name);
  if (direct >= 0) return { value: args[direct + 1] ?? null, index: direct, inline: false };
  const inline = args.findIndex((arg) => arg.startsWith(`${name}=`));
  return inline >= 0
    ? { value: args[inline].slice(name.length + 1), index: inline, inline: true }
    : null;
}

function replaceOption(args, name, value) {
  const found = optionValue(args, name);
  if (!found) return [name, String(value), ...args];
  const next = [...args];
  if (found.inline) next[found.index] = `${name}=${value}`;
  else next[found.index + 1] = String(value);
  return next;
}

function isMetadataInvocation(args) {
  return args[0] === "auth" || args.includes("--help") || args.includes("-h")
    || args.includes("--version") || args.includes("-v") || args[0] === "version";
}

export function guardedClaudePlan(args, {
  model = "sonnet",
  effort = "low",
  maxBudgetUsd = 1,
} = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new Error("CLAUDE_BUDGET_GUARD_ARGS_INVALID");
  }
  if (isMetadataInvocation(args)) {
    return { args: [...args], metadataOnly: true, model: null, effort: null,
      maxBudgetUsd: null };
  }
  const requestedModel = optionValue(args, "--model")?.value;
  if (requestedModel && !String(requestedModel).toLowerCase().includes("sonnet")) {
    throw new Error(`CLAUDE_BUDGET_GUARD_MODEL_REJECTED:${requestedModel}`);
  }
  const requestedEffort = optionValue(args, "--effort")?.value;
  if (requestedEffort && requestedEffort !== effort) {
    throw new Error(`CLAUDE_BUDGET_GUARD_EFFORT_REJECTED:${requestedEffort}`);
  }
  let guarded = replaceOption(args, "--model", model);
  guarded = replaceOption(guarded, "--effort", effort);
  const headless = guarded.includes("-p") || guarded.includes("--print");
  if (headless) guarded = replaceOption(guarded, "--max-budget-usd", maxBudgetUsd);
  return { args: guarded, metadataOnly: false, model, effort,
    maxBudgetUsd: headless ? Number(maxBudgetUsd) : null };
}

function priorModelInvocationCount(file) {
  try {
    return readFileSync(file, "utf8").split("\n").filter(Boolean).reduce((count, line) => {
      let row;
      try { row = JSON.parse(line); }
      catch { throw new Error("CLAUDE_BUDGET_GUARD_AUDIT_CORRUPT"); }
      return count + (row?.metadataOnly === false ? 1 : 0);
    }, 0);
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

function auditRow(plan, originalArgs, invocationOrdinal = null) {
  return {
    schema: "outsider/claude-budget-guard-audit/v1",
    at: new Date().toISOString(),
    pid: process.pid,
    metadataOnly: plan.metadataOnly,
    model: plan.model,
    effort: plan.effort,
    maxBudgetUsd: plan.maxBudgetUsd,
    invocationOrdinal,
    invocationHash: digest(JSON.stringify(originalArgs)),
  };
}

function appendAudit(file, row) {
  if (!file) return;
  appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 });
}

function reserveModelInvocation(file, plan, originalArgs, maxInvocations) {
  if (!file) throw new Error("OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG_REQUIRED");
  const lock = `${file}.lock`;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("CLAUDE_BUDGET_GUARD_LOCK_TIMEOUT");
      Atomics.wait(sleeper, 0, 0, 20);
    }
  }
  try {
    const invocationOrdinal = priorModelInvocationCount(file) + 1;
    if (invocationOrdinal > maxInvocations) {
      throw new Error(`CLAUDE_BUDGET_GUARD_INVOCATION_LIMIT:${maxInvocations}`);
    }
    appendAudit(file, auditRow(plan, originalArgs, invocationOrdinal));
    return invocationOrdinal;
  } finally {
    rmdirSync(lock);
  }
}

function auditMetadata(plan, originalArgs) {
  const file = process.env.OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG;
  if (!file) return;
  const row = {
    ...auditRow(plan, originalArgs, null),
  };
  appendAudit(file, row);
}

export async function main(argv = process.argv.slice(2)) {
  const executable = process.env.OUTSIDER_REAL_CLAUDE;
  if (!executable) throw new Error("OUTSIDER_REAL_CLAUDE_REQUIRED");
  const maxBudgetUsd = Number(process.env.OUTSIDER_CLAUDE_MAX_BUDGET_USD ?? 1);
  if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0 || maxBudgetUsd > 2) {
    throw new Error("OUTSIDER_CLAUDE_MAX_BUDGET_USD_INVALID");
  }
  const plan = guardedClaudePlan(argv, { maxBudgetUsd });
  const maxInvocations = Number(process.env.OUTSIDER_CLAUDE_MAX_INVOCATIONS ?? 5);
  /* The executable and the preregistration builder share one finite maximum.
     A gate can choose less, but it cannot silently exceed this product-wide
     ceiling. */
  if (!Number.isInteger(maxInvocations) || maxInvocations <= 0
    || maxInvocations > MAX_EVALUATION_MODEL_PROCESSES) {
    throw new Error("OUTSIDER_CLAUDE_MAX_INVOCATIONS_INVALID");
  }
  const auditFile = process.env.OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG;
  let invocationOrdinal = null;
  if (!plan.metadataOnly) {
    invocationOrdinal = reserveModelInvocation(auditFile, plan, argv, maxInvocations);
  } else {
    auditMetadata(plan, argv);
  }
  if (process.env.OUTSIDER_CLAUDE_BUDGET_DRY_RUN === "1") {
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return 0;
  }
  const child = spawn(executable, plan.args, { stdio: "inherit", env: process.env });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => { if (!child.killed) child.kill(signal); });
  }
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else resolve(code ?? 1);
    });
  });
}

const invokedUrl = (() => {
  try { return pathToFileURL(realpathSync(process.argv[1] ?? "")).href; }
  catch { return pathToFileURL(process.argv[1] ?? "").href; }
})();
if (import.meta.url === invokedUrl) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 2;
  });
}
