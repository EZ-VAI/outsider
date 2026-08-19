import {
  existsSync, mkdirSync, realpathSync, symlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_EVALUATION_MODEL_PROCESSES } from "./stage05-model-cost-policy.mjs";

const guardSource = fileURLToPath(new URL("./claude-budget-guard.mjs", import.meta.url));

export function materializeEvaluationClaudeGuard({
  directory,
  realClaude,
  maxBudgetUsd = 1,
  maxInvocations = 20,
} = {}) {
  const targetDirectory = path.resolve(String(directory ?? ""));
  const resolvedClaude = realpathSync(String(realClaude ?? ""));
  if (!Number.isFinite(Number(maxBudgetUsd)) || Number(maxBudgetUsd) <= 0
    || Number(maxBudgetUsd) > 2) {
    throw new Error("EVALUATION_GUARD_MAX_BUDGET_INVALID");
  }
  if (!Number.isInteger(Number(maxInvocations)) || Number(maxInvocations) <= 0
    || Number(maxInvocations) > MAX_EVALUATION_MODEL_PROCESSES) {
    throw new Error("EVALUATION_GUARD_MAX_INVOCATIONS_INVALID");
  }
  mkdirSync(targetDirectory, { recursive: true });
  const executable = path.join(targetDirectory, "claude");
  if (!existsSync(executable)) symlinkSync(guardSource, executable);
  if (realpathSync(executable) !== realpathSync(guardSource)) {
    throw new Error("EVALUATION_GUARD_EXECUTABLE_DRIFT");
  }
  const auditFile = path.join(targetDirectory, "claude-budget-audit.jsonl");
  return {
    executable,
    auditFile,
    environment: {
      OUTSIDER_REAL_CLAUDE: resolvedClaude,
      OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG: auditFile,
      OUTSIDER_CLAUDE_MAX_BUDGET_USD: String(Number(maxBudgetUsd)),
      OUTSIDER_CLAUDE_MAX_INVOCATIONS: String(Number(maxInvocations)),
    },
    policy: {
      schema: "outsider/evaluation-claude-budget/v1",
      model: "sonnet",
      effort: "low",
      maximumModelProcesses: Number(maxInvocations),
      headlessMaxBudgetUsdPerProcess: Number(maxBudgetUsd),
      interactiveDollarHardCapEnforced: false,
      interactiveLimits: ["model", "effort", "process-count", "wall-clock"],
    },
  };
}
