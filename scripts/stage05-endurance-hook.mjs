#!/usr/bin/env node
/*
 * Evaluation-only endurance checkpoint bridge.
 *
 * The shipped hook remains the control authority. This wrapper delegates the
 * exact host payload first. The controller-external evaluator, not this hook
 * or the worker, owns the monotonic witness credential. After a successful
 * bounded health shift, the evaluator binds its timestamp to the already
 * recorded host PostToolUse event. This wrapper therefore never exposes the
 * witness socket or token to the controlled worker.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const inputBytes = Buffer.concat(chunks);
let input = null;
try { input = JSON.parse(inputBytes.toString("utf8") || "{}"); } catch { /* delegated hook reports it */ }

const event = input?.hook_event_name ?? input?.hookEventName;

const realHook = process.env.OUTSIDER_ENDURANCE_REAL_HOOK;
if (!realHook) {
  process.stderr.write("ENDURANCE_REAL_HOOK_REQUIRED\n");
  process.exit(1);
}

const delegated = spawnSync(process.execPath, [realHook, "claude-code"], {
  input: inputBytes,
  env: process.env,
  encoding: null,
  maxBuffer: 8 * 1024 * 1024,
});
const tool = input?.tool_name ?? input?.toolName;
const requiredAgentModel = String(process.env.OUTSIDER_ENDURANCE_REQUIRED_AGENT_MODEL ?? "").trim();
const requestedAgentModel = String(input?.tool_input?.model ?? input?.toolInput?.model ?? "").trim();
const modelGuardViolation = event === "PreToolUse" && tool === "Agent"
  && requiredAgentModel && requestedAgentModel !== requiredAgentModel;
const evaluatorModelGuardBlocked = modelGuardViolation && !delegated.error
  && Number(delegated.status) === 0;
if (!evaluatorModelGuardBlocked && delegated.stdout) process.stdout.write(delegated.stdout);
if (delegated.stderr) process.stderr.write(delegated.stderr);
if (delegated.error) {
  process.stderr.write(`${delegated.error.message}\n`);
  process.exit(1);
}

if (evaluatorModelGuardBlocked) {
  const violationFile = process.env.OUTSIDER_ENDURANCE_MODEL_POLICY_VIOLATION_FILE;
  try {
    if (violationFile) {
      mkdirSync(path.dirname(violationFile), { recursive: true });
      writeFileSync(violationFile, `${JSON.stringify({
        schema: "outsider/endurance-agent-model-policy-violation/v1",
        requiredModel: requiredAgentModel,
        requestedModel: requestedAgentModel || null,
      })}\n`, { mode: 0o600, flag: "wx" });
    }
  } catch { /* the exit-2 denial remains authoritative */ }
  process.stderr.write(`OUTSIDER_EVALUATOR_MODEL_POLICY_REJECTED: Agent must explicitly set model=${requiredAgentModel}\n`);
  process.exit(2);
}

process.exit(delegated.status ?? 1);
