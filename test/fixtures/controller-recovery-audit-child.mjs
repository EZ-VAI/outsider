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
  decide: () => ({ verdict: "warn", reason: "red delivery",
    proposed: { action: "git commit -am done", irreversible: false } }),
  acceptance: () => ({ ran: true, passed: false, exit: 1,
    command: "npm test", output: "expected 2, received 1" }),
  supervisor: () => ({ ok: true, verdict: {
    onTrack: false,
    drift: "src/value.js still exports 1",
    plan: ["edit src/value.js", "run the frozen acceptance"],
    expectedNextActions: ["edit:src/value.js", "run:acceptance"],
    acceptanceRisk: "frozen acceptance remains red",
  } }),
  correctionAuditor: () => {
    process.send({ type: "correction-auditor-running" });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  },
});

controller.supervise({
  input: {
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command: "git commit -am done" },
  transcript_path: transcript,
  },
  agent: "claude-code",
  boundary: "PreToolUse",
  trigger: "deterministic-recovery-probe",
  acceptanceResult: { ran: true, passed: false, exit: 1,
    command: "npm test", output: "expected 2, received 1" },
  actor: { agentId: "main", agentKind: "main", task: null },
});
