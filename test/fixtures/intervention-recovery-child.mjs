import { RunStore } from "../../src/outsider-kernel-store.js";
import { InterventionRecoveryJournal } from "../../src/outsider-intervention-recovery.js";

const [directory, interventionId, authorityHash] = process.argv.slice(2);
if (!directory || !interventionId || !authorityHash || typeof process.send !== "function") {
  process.exit(2);
}

const store = RunStore.open({ directory, supervisorCommand: "fake-supervisor" });
const journal = new InterventionRecoveryJournal({ store });
journal.beginIntervention({
  interventionId,
  agentId: "main",
  trigger: "periodic-semantic-patrol:8",
  boundary: "PreToolUse",
  attempt: 1,
});
journal.bindAuthority({
  interventionId,
  authorityHash,
  authorityRef: `authority-${interventionId}.json`,
});
const record = journal.beginJudge({
  interventionId,
  kind: "correction-factual-audit",
  inputHash: "sha256:fixed-audit-packet",
  inputRef: `audit-packet-${interventionId}.json`,
  authorityHash,
  ownerId: "controller-generation-1",
  generation: 1,
  logicalOperationId: "logical-correction-audit",
});

/* The parent sends SIGKILL only after this IPC message. Every durable write is
   therefore known to have completed, while the judge phase is still in-flight. */
process.send({ type: "judge-running", record });
setInterval(() => undefined, 60_000);

