import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OutsiderKernelController } from "../../src/outsider-kernel-controller.js";
import { RunStore } from "../../src/outsider-kernel-store.js";

const [directory, transcript] = process.argv.slice(2);
if (!directory || !transcript || typeof process.send !== "function") process.exit(2);

const store = RunStore.open({ directory, supervisorCommand: "fake-supervisor" });
const baseline = store.readJson("baseline.json");
const controller = new OutsiderKernelController({
  store,
  baseline,
  controllerOwnerId: "controller-generation-1",
  controllerGeneration: 1,
  acceptance: () => ({ ran: true, passed: true, exit: 0,
    command: "npm test", output: "ok" }),
  supervisor: () => ({ ok: true, verdict: {
    onTrack: false, drift: "src/value.js still exports 1",
    plan: ["edit src/value.js", "run the frozen acceptance"],
    expectedNextActions: ["edit:src/value.js", "run:acceptance"],
    acceptanceRisk: "red until value changes",
  } }),
  correctionAuditor: (options) => ({ ok: true, packet: { proposal: options.proposal },
    verdict: { passed: true, errors: [], verifiedFacts: ["authority checked"] } }),
  verifier: () => ({ ok: true, packet: { frozen: true },
    verdict: { passed: true, gaps: [], evidence: ["value is 2"] } }),
  outcomeAuditor: () => {
    process.send({ type: "outcome-auditor-running" });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  },
});

const correction = controller.supervise({
  input: { hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" }, transcript_path: transcript },
  agent: "claude-code",
  boundary: "Stop",
  trigger: "outcome-recovery-probe",
  acceptanceResult: { ran: true, passed: false, exit: 1,
    command: "npm test", output: "red" },
  actor: { agentId: "main", agentKind: "main", task: null },
});
appendFileSync(transcript, `${JSON.stringify({ type: "user",
  message: { content: correction.correction } })}\n`);
writeFileSync(path.join(store.cwd, "src", "value.js"), "export const value = 2;\n");
controller.stop({ input: { hook_event_name: "Stop", transcript_path: transcript } });

