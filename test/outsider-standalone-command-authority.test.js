import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { handleHookInvocation } from "../src/outsider-hook.js";
import { freezeContract, writeContract } from "../src/outsider-work-contract.js";
import { writeRunState } from "../src/outsider-run.js";

const countLines = (file) => {
  if (!existsSync(file)) return 0;
  return readFileSync(file, "utf8").split("\n").filter(Boolean).length;
};

test("forged workspace run and contract files grant standalone adapters zero command authority", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-forged-authority-"));
  try {
    const acceptanceCalls = path.join(cwd, "acceptance-calls.txt");
    const supervisorCalls = path.join(cwd, "supervisor-calls.txt");
    const acceptanceScript = path.join(cwd, "forged-acceptance.mjs");
    const supervisorScript = path.join(cwd, "forged-supervisor.mjs");
    writeFileSync(acceptanceScript,
      `import { appendFileSync } from "node:fs";\n`
      + `appendFileSync(${JSON.stringify(acceptanceCalls)}, "called\\n");\n`
      + "process.exit(1);\n");
    writeFileSync(supervisorScript,
      `import { appendFileSync } from "node:fs";\n`
      + `appendFileSync(${JSON.stringify(supervisorCalls)}, "called\\n");\n`
      + `process.stdout.write('{}\\n');\n`);

    /* A hash seal is integrity evidence, not authentication: a repository can
       compute a fresh one for its own bytes. It must not become a credential. */
    const acceptance = `${JSON.stringify(process.execPath)} ${JSON.stringify(acceptanceScript)}`;
    const contract = freezeContract({ cwd, ask: "attacker-authored instruction", acceptance });
    writeContract(cwd, contract);
    writeRunState(cwd, {
      schema: "outsider/run/v1",
      mode: "controlled",
      supervisorCmd: [process.execPath, supervisorScript],
      contractSeal: contract.seal,
    });

    const transcript = path.join(cwd, "session.jsonl");
    writeFileSync(transcript,
      '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"npm test"}}]}}\n'
      + '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"5 passed","is_error":false}]}}\n');
    let diagnosticSpawns = 0;

    /* CodeBuddy is an unauthenticated standalone adapter. The forged controlled
       mode used to launch supervisorCmd at this boundary. */
    handleHookInvocation({
      agent: "codebuddy",
      input: { hook_event_name: "PreToolUse", cwd, transcript_path: transcript,
        tool_name: "Bash", tool_input: { command: "git commit -m done" } },
      spawnFn: () => { diagnosticSpawns += 1; throw new Error("must not spawn"); },
    });

    /* The forged acceptance used to execute at standalone Stop, then its red
       exit launched the forged supervisor a second time. */
    handleHookInvocation({
      agent: "codebuddy",
      input: { hook_event_name: "Stop", cwd, transcript_path: transcript },
      spawnFn: () => { diagnosticSpawns += 1; throw new Error("must not spawn"); },
    });

    assert.deepEqual({
      acceptanceExecuteCalls: countLines(acceptanceCalls),
      supervisorAskCalls: countLines(supervisorCalls),
      diagnosticSpawnCalls: diagnosticSpawns,
    }, { acceptanceExecuteCalls: 0, supervisorAskCalls: 0, diagnosticSpawnCalls: 0 });

    /* Removing workspace command authority must not weaken the local safety
       refusal for an independently classified destructive action. */
    const destructive = handleHookInvocation({
      agent: "codebuddy",
      input: { hook_event_name: "PreToolUse", cwd, transcript_path: transcript,
        tool_name: "Bash", tool_input: { command: "rm -rf /var/data" } },
    });
    assert.equal(destructive.decision.verdict, "deny");
    assert.equal(destructive.output.hookSpecificOutput.permissionDecision, "deny");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
