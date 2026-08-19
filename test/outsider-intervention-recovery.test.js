import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freezeContract } from "../src/outsider-work-contract.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";
import { InterventionRecoveryJournal } from "../src/outsider-intervention-recovery.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-intervention-recovery-"));
  const cwd = path.join(root, "workspace");
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "value.js"), "export const value = 1;\n");
  const baseline = snapshotWorkspace(cwd);
  const semantic = {
    objective: "preserve one intervention identity across a controller crash",
    successCriteria: ["the same audited correction resumes"],
    architecturalConstraints: ["do not substitute a new intervention"],
    forbiddenShortcuts: ["do not treat event persistence as worker delivery"],
    scope: { in: ["src/value.js"], out: [] },
    uncertainties: [],
  };
  const contract = freezeContract({ cwd, ask: semantic.objective, acceptance: "npm test",
    semantic, semanticAudit: { passed: true, evidenceHash: "sha256:contract-audit" },
    baselineEvidence: baseline });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "fake-supervisor",
    stateRoot: path.join(root, "state") });
  store.writeJson("baseline.json", baseline);
  return { root, store };
}

function waitForReady(child, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("RECOVERY_CHILD_READY_TIMEOUT"));
    }, timeoutMs);
    const onMessage = (message) => {
      if (message?.type !== "judge-running") return;
      cleanup();
      resolve(message);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`RECOVERY_CHILD_EXITED_EARLY:${code}:${signal}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

test("SIGKILL during a judge resumes the same intervention and authority", async (t) => {
  const { root, store } = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const interventionId = "recovery-intervention-0001";
  const authorityHash = "sha256:immutable-correction-authority";
  const child = fork(path.join(here, "fixtures", "intervention-recovery-child.mjs"),
    [store.directory, interventionId, authorityHash], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
  t.after(() => { if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL"); });
  const ready = await waitForReady(child);
  assert.equal(ready.record.phase, "judge-running");
  assert.equal(child.kill("SIGKILL"), true);
  const [, signal] = await once(child, "exit");
  assert.equal(signal, "SIGKILL");

  const recoveredStore = RunStore.open({ directory: store.directory,
    supervisorCommand: "fake-supervisor" });
  const journal = new InterventionRecoveryJournal({ store: recoveredStore });
  const before = journal.recoveryAction(interventionId);
  assert.equal(before.action, "resume-judge");
  assert.equal(before.interventionId, interventionId);
  assert.equal(before.authorityHash, authorityHash);
  assert.equal(before.judge.logicalOperationId, "logical-correction-audit");
  assert.equal(before.judge.inputHash, "sha256:fixed-audit-packet");

  assert.throws(() => journal.resumeJudge({ interventionId,
    ownerId: "controller-generation-2", generation: 2, replacingOwnerId: "not-the-old-owner" }),
  /REPLACEMENT_OWNER_MISMATCH/);
  const resumed = journal.resumeJudge({ interventionId,
    ownerId: "controller-generation-2", generation: 2,
    replacingOwnerId: "controller-generation-1" });
  assert.equal(resumed.interventionId, interventionId);
  assert.equal(resumed.authority.hash, authorityHash);
  assert.equal(resumed.judge.logicalOperationId, "logical-correction-audit");
  assert.equal(resumed.judge.executionAttempt, 2);
  assert.equal(resumed.judge.generation, 2);

  const completed = journal.completeJudge({ interventionId,
    logicalOperationId: resumed.judge.logicalOperationId,
    ownerId: "controller-generation-2", generation: 2,
    resultHash: "sha256:audited-pass-result",
    resultRef: `audit-result-${interventionId}.json`, passed: true });
  assert.equal(completed.phase, "judge-complete");
  assert.equal(journal.recoveryAction(interventionId).action, "continue-after-judge");
});

test("authority is immutable and a recorded delivery remains unknown until observed", () => {
  const { root, store } = fixture();
  try {
    const journal = new InterventionRecoveryJournal({ store });
    const interventionId = "recovery-intervention-0002";
    const authorityHash = "sha256:authority-two";
    journal.beginIntervention({ interventionId, agentId: "main", trigger: "red-at-stop",
      boundary: "Stop", attempt: 1 });
    const diagnosis = journal.beginJudge({ interventionId, kind: "diagnosis",
      inputHash: "sha256:diagnosis-input", inputRef: "diagnosis-input.json",
      ownerId: "controller-1", generation: 1, logicalOperationId: "diagnosis-op" });
    journal.completeJudge({ interventionId,
      logicalOperationId: diagnosis.judge.logicalOperationId,
      ownerId: "controller-1", generation: 1, resultHash: "sha256:diagnosis-result",
      resultRef: "diagnosis-result.json" });
    journal.bindAuthority({ interventionId, authorityHash,
      authorityRef: `authority-${interventionId}.json` });
    assert.throws(() => journal.bindAuthority({ interventionId,
      authorityHash: "sha256:different-authority",
      authorityRef: `authority-${interventionId}.json` }), /AUTHORITY_MISMATCH/);
    const running = journal.beginJudge({ interventionId, kind: "correction-factual-audit",
      inputHash: "sha256:audit-input", inputRef: "audit-input.json", authorityHash,
      ownerId: "controller-1", generation: 1, logicalOperationId: "audit-op" });
    journal.completeJudge({ interventionId, logicalOperationId: running.judge.logicalOperationId,
      ownerId: "controller-1", generation: 1, resultHash: "sha256:audit-result",
      resultRef: "audit-result.json", passed: true });
    journal.prepareDelivery({ interventionId, authorityHash,
      correctionHash: "sha256:correction", marker: `OUTSIDER_INTERVENTION:${interventionId}`,
      payloadRef: "correction-payload.json" });
    journal.recordDelivery({ interventionId, emittedSeq: 40 });

    const reopened = new InterventionRecoveryJournal({ store: RunStore.open({
      directory: store.directory, supervisorCommand: "fake-supervisor",
    }) });
    const uncertain = reopened.recoveryAction(interventionId);
    assert.equal(uncertain.action, "delivery-unknown");
    assert.equal(uncertain.authorityHash, authorityHash);
    assert.equal(uncertain.delivery.correctionHash, "sha256:correction");
    assert.equal(uncertain.delivery.payloadRef, "correction-payload.json");
    assert.throws(() => reopened.observeEffect({ interventionId, effectSeq: 42 }),
      /DELIVERY_NOT_OBSERVED/);
    reopened.observeDelivery({ interventionId, observedSeq: 41 });
    reopened.observeEffect({ interventionId, effectSeq: 42 });
    const outcome = reopened.beginJudge({ interventionId, kind: "outcome-approval-audit",
      inputHash: "sha256:outcome-input", inputRef: "outcome-input.json", authorityHash,
      ownerId: "controller-1", generation: 1, logicalOperationId: "outcome-op" });
    reopened.completeJudge({ interventionId,
      logicalOperationId: outcome.judge.logicalOperationId,
      ownerId: "controller-1", generation: 1, resultHash: "sha256:outcome-pass",
      resultRef: "outcome-pass.json", passed: true });
    const resolved = reopened.resolve({ interventionId });
    assert.equal(resolved.phase, "resolved");
    assert.equal(reopened.recoveryAction(interventionId).action, "none");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a rejected audited authority can be superseded exactly once with immutable history", () => {
  const { root, store } = fixture();
  try {
    const journal = new InterventionRecoveryJournal({ store });
    const interventionId = "recovery-intervention-0004";
    const firstHash = "sha256:authority-draft-one";
    const secondHash = "sha256:authority-draft-two";
    journal.beginIntervention({ interventionId, agentId: "main", trigger: "red-at-stop",
      boundary: "Stop", attempt: 1 });
    journal.bindAuthority({ interventionId, authorityHash: firstHash,
      authorityRef: "authority-draft-one.json" });
    const firstAudit = journal.beginJudge({ interventionId, kind: "correction-factual-audit",
      inputHash: "sha256:audit-one-input", inputRef: "audit-one-input.json",
      authorityHash: firstHash, ownerId: "controller-1", generation: 1,
      logicalOperationId: "audit-draft-one" });
    journal.completeJudge({ interventionId,
      logicalOperationId: firstAudit.judge.logicalOperationId,
      ownerId: "controller-1", generation: 1,
      resultHash: "sha256:audit-one-rejected", resultRef: "audit-one-rejected.json",
      passed: false });

    assert.throws(() => journal.supersedeRejectedAuthority({ interventionId,
      previousAuthorityHash: "sha256:not-the-old-authority",
      rejectionResultHash: "sha256:audit-one-rejected",
      rejectionResultRef: "audit-one-rejected.json",
      nextAuthorityHash: secondHash, nextAuthorityRef: "authority-draft-two.json" }),
    /PREVIOUS_AUTHORITY_MISMATCH/);
    assert.throws(() => journal.supersedeRejectedAuthority({ interventionId,
      previousAuthorityHash: firstHash, rejectionResultHash: "sha256:not-the-audit-result",
      rejectionResultRef: "audit-one-rejected.json",
      nextAuthorityHash: secondHash, nextAuthorityRef: "authority-draft-two.json" }),
    /REJECTION_EVIDENCE_MISMATCH/);

    const superseded = journal.supersedeRejectedAuthority({ interventionId,
      previousAuthorityHash: firstHash,
      rejectionResultHash: "sha256:audit-one-rejected",
      rejectionResultRef: "audit-one-rejected.json",
      nextAuthorityHash: secondHash,
      nextAuthorityRef: "authority-draft-two.json" });
    assert.equal(superseded.authority.hash, secondHash);
    assert.equal(superseded.authority.draft, 2);
    assert.equal(superseded.authorityHistory.length, 1);
    assert.equal(superseded.authorityHistory[0].hash, firstHash);
    assert.equal(superseded.authorityHistory[0].rejectedBy.resultHash,
      "sha256:audit-one-rejected");

    const secondAudit = journal.beginJudge({ interventionId,
      kind: "correction-factual-audit", inputHash: "sha256:audit-two-input",
      inputRef: "audit-two-input.json", authorityHash: secondHash,
      ownerId: "controller-1", generation: 1, logicalOperationId: "audit-draft-two" });
    journal.completeJudge({ interventionId,
      logicalOperationId: secondAudit.judge.logicalOperationId,
      ownerId: "controller-1", generation: 1, resultHash: "sha256:audit-two-passed",
      resultRef: "audit-two-passed.json", passed: true });
    assert.throws(() => journal.supersedeRejectedAuthority({ interventionId,
      previousAuthorityHash: secondHash, rejectionResultHash: "sha256:audit-two-passed",
      rejectionResultRef: "audit-two-passed.json",
      nextAuthorityHash: "sha256:authority-draft-three",
      nextAuthorityRef: "authority-draft-three.json" }), /REJECTION_EVIDENCE_MISMATCH/);
    journal.prepareDelivery({ interventionId, authorityHash: secondHash,
      correctionHash: "sha256:correction-two",
      marker: `OUTSIDER_INTERVENTION:${interventionId}`,
      payloadRef: "correction-two.json" });
    assert.throws(() => journal.supersedeRejectedAuthority({ interventionId,
      previousAuthorityHash: secondHash, rejectionResultHash: "sha256:audit-two-passed",
      rejectionResultRef: "audit-two-passed.json",
      nextAuthorityHash: "sha256:authority-draft-three",
      nextAuthorityRef: "authority-draft-three.json" }), /SUPERSEDE_FORBIDDEN/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a corrupted journal cannot substitute a different authority during recovery", () => {
  const { root, store } = fixture();
  try {
    const journal = new InterventionRecoveryJournal({ store });
    const interventionId = "recovery-intervention-0003";
    journal.beginIntervention({ interventionId, agentId: "main", trigger: "red-at-stop",
      boundary: "Stop", attempt: 1 });
    journal.bindAuthority({ interventionId, authorityHash: "sha256:original-authority",
      authorityRef: "authority.json" });
    journal.beginJudge({ interventionId, kind: "correction-factual-audit",
      inputHash: "sha256:audit-input", inputRef: "audit-input.json",
      authorityHash: "sha256:original-authority", ownerId: "controller-1", generation: 1,
      logicalOperationId: "audit-op" });
    const tampered = store.readJson("intervention-recovery.json");
    tampered.interventions[interventionId].authority.hash = "sha256:substituted-authority";
    store.writeJson("intervention-recovery.json", tampered);
    assert.throws(() => journal.recoveryAction(interventionId), /JUDGE_INVALID/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
