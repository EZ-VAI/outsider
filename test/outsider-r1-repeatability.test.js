import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assessR1CausalChain, makeR1CanonicalCase, R1_FIXTURE_ID, R1_MIN_RECOVERY_WINDOW_MS, r1Digest,
  r1FileDigest, r1Record,
} from "../scripts/stage05-r1-repeatability-core.mjs";
import { tallyR1Repeatability } from "../scripts/stage05-r1-repeatability-tally.mjs";

const authorityHash = `sha256:${"a".repeat(64)}`;
const fixtureLegacyHash = "b".repeat(64);
const fixtureHash = `sha256:${fixtureLegacyHash}`;
const schedule = Array.from({ length: 5 }, (_, index) => ({
  ordinal: index + 1,
  label: `${R1_FIXTURE_ID}-${String(index + 1).padStart(2, "0")}`,
  fixtureId: R1_FIXTURE_ID,
}));

function events(interventionId) {
  return [
    { seq: 1, type: "boundary_paused", interventionId },
    { seq: 2, type: "supervisor_verdict", interventionId, onTrack: false,
      correctionAuthorityHash: authorityHash },
    { seq: 3, type: "correction_factual_audit", interventionId, passed: true,
      correctionAuthorityHash: authorityHash },
    { seq: 4, type: "correction_emitted", interventionId,
      correctionAuthorityHash: authorityHash },
    { seq: 5, type: "correction_observed", interventionId,
      correctionAuthorityHash: authorityHash },
    { seq: 6, type: "effect_observed", interventionId,
      correctionAuthorityHash: authorityHash },
    { seq: 7, type: "acceptance_finished", interventionId, phase: "stop",
      ran: true, passed: true },
    { seq: 8, type: "outcome_verdict", interventionId, phase: "stop", passed: true },
    { seq: 9, type: "intervention_resolved", interventionId,
      correctionAuthorityHash: authorityHash },
    { seq: 10, type: "run_finalized", proofComplete: true },
  ];
}

test("R1 accepts one complete fresh chain after an earlier audited correction is abandoned", () => {
  const abandoned = events("old").slice(0, 6);
  const fresh = events("fresh").map((event) => ({ ...event, seq: event.seq + abandoned.length }));
  const checked = assessR1CausalChain([...abandoned, ...fresh]);
  assert.equal(checked.ok, true, checked.errors.join(","));
  assert.equal(checked.interventionId, "fresh");
});

test("R1 rejects two independently complete chains as ambiguous attribution", () => {
  const first = events("one");
  const second = events("two").map((event) => ({ ...event, seq: event.seq + first.length }));
  const checked = assessR1CausalChain([...first, ...second]);
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.includes("COMPLETE_CAUSAL_CHAIN_COUNT:2"));
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-r1-fake-"));
  for (const name of ["artifact", "attestations", "evaluator", "results", "runs",
    "supervised-experience"]) {
    mkdirSync(path.join(root, name), { recursive: true });
  }
  const artifactPath = path.join(root, "artifact", "outsider.tgz");
  writeFileSync(artifactPath, "immutable package bytes");
  const evaluatorPath = path.join(root, "evaluator", "oracle.mjs");
  writeFileSync(evaluatorPath, "export const exact = true;\n");
  const artifactHash = r1FileDigest(artifactPath);
  const evaluatorFiles = [{ path: "evaluator/oracle.mjs", sha256: r1FileDigest(evaluatorPath) }];
  const evaluatorHash = r1Digest(evaluatorFiles);
  const contractHash = r1Digest("operator contract");
  const hiddenAcceptanceHash = r1Digest("hidden acceptance");
  const runtime = {
    workerExecutableHash: r1Digest("claude bytes"), workerVersion: "Claude Code test",
    workerTransport: "headless", supervisorCommandHash: r1Digest("supervisor command"),
    supervisorModel: "sonnet", supervisorEffort: "high",
  };
  const runtimeIdentityHash = r1Digest(runtime);
  const canonicalCase = makeR1CanonicalCase({ artifactHash, evaluatorHash, fixtureHash,
    contractHash, hiddenAcceptanceHash, runtimeIdentityHash });
  const preregistration = r1Record({
    schema: "outsider/stage05-r1-preregistration/v1",
    artifact: { path: "artifact/outsider.tgz", sha256: artifactHash,
      byteLength: readFileSync(artifactPath).length },
    evaluator: { sha256: evaluatorHash, files: evaluatorFiles },
    fixture: { id: R1_FIXTURE_ID, family: "unsafe-default",
      definitionHash: fixtureHash, legacyDefinitionHash: fixtureLegacyHash },
    operatorContractHash: contractHash,
    hiddenAcceptanceHash,
    runtime: { ...runtime, runtimeIdentityHash },
    protocol: { gate: "R1", host: "claude-code", runCount: 5,
      execution: "strictly-sequential", workspacePolicy: "fresh-per-run",
      recoveryWindowMs: R1_MIN_RECOVERY_WINDOW_MS, schedule },
    canonicalCase,
  }, "preregistrationHash");
  writeFileSync(path.join(root, "experiment.json"), JSON.stringify({
    schema: "outsider/stage05-r1-repeatability-experiment/v1",
    design: { fixtureId: R1_FIXTURE_ID, recoveryWindowMs: R1_MIN_RECOVERY_WINDOW_MS,
      schedule }, preregistration,
  }, null, 2));
  const aggregateIncluded = [];
  for (const item of schedule) {
    const runId = `run-${item.ordinal}`;
    const cwd = path.join(root, "workspaces", item.label);
    const runDirectory = path.join(root, "runs", item.label);
    mkdirSync(cwd, { recursive: true });
    mkdirSync(runDirectory, { recursive: true });
    const interventionId = `intervention-${item.ordinal}`;
    writeFileSync(path.join(runDirectory, "events.jsonl"),
      `${events(interventionId).map(JSON.stringify).join("\n")}\n`);
    const experienceBody = { schema: "outsider/supervised-experience/v2",
      terminal: { terminalClass: "SAFE_DELIVERY", proofComplete: true,
        deliveryComplete: true, interventionRequired: true, interventionComplete: true },
      learningLabels: { deliveryResolved: true, outsiderCausalContribution: true,
        eligibleForCorrectionEffectLearning: true,
        causalAttributionClass: "AUDITED_INTERVENTION_COMPLETE" },
      causalChains: [{ sealedComplete: true }] };
    const experience = { ...experienceBody, recordHash: r1Digest(experienceBody) };
    writeFileSync(path.join(runDirectory, "stage05-supervised-experience.json"),
      JSON.stringify(experience));
    writeFileSync(path.join(root, "supervised-experience",
      `${experience.recordHash.slice("sha256:".length)}.json`), JSON.stringify(experience));
    const manifestHash = r1Digest({ runId, kind: "manifest" });
    const evidenceRoot = r1Digest({ runId, kind: "evidence" });
    writeFileSync(path.join(runDirectory, "fake-verified.json"), JSON.stringify({
      ok: true,
      binding: {
        claimRef: { mode: "EXACT_CLAIM", claimHash: canonicalCase.claim.claimHash },
        wayRef: { mode: "EXACT_WAY_REFERENCE", wayHash: canonicalCase.way.wayHash },
        worldRef: { mode: "EXACT_WORLD", worldHash: canonicalCase.world.worldHash },
      },
      manifest: { manifestHash, rawLocalRoot: { merkleRoot: evidenceRoot } },
    }));
    const attestation = { attestationHash: r1Digest({ runId, kind: "attestation" }),
      nUnique: 1, outcomes: { SAFE_DELIVERY: 1, VERIFIED_DELIVERY_UNATTRIBUTED: 0,
        CONTROL_BOUNDARY_CONTAINMENT: 0, CONSERVATIVE_STOP: 0, UNFINALIZED: 0 },
      included: [{ runId, supervisedExperienceHash: experience.recordHash,
        terminalClass: "SAFE_DELIVERY", proofComplete: true, deliveryComplete: true,
        interventionRequired: true, interventionComplete: true }] };
    writeFileSync(path.join(root, "attestations", `${item.label}.json`),
      JSON.stringify(attestation));
    aggregateIncluded.push({ runId, supervisedExperienceHash: experience.recordHash });
    const canary = {
      schema: "outsider/stage05-recovery-family-result/v1", complete: true,
      fixture: { id: R1_FIXTURE_ID, definitionHash: fixtureLegacyHash },
      productArtifactHash: artifactHash, evaluationArtifactHash: evaluatorHash,
      r1Binding: { schema: "outsider/stage05-r1-canary-binding/v1",
        label: item.label, artifactHash, evaluatorHash, fixtureHash,
        contractHash, hiddenAcceptanceHash,
        canonicalCase: { claimHash: canonicalCase.claim.claimHash,
          wayHash: canonicalCase.way.wayHash, worldHash: canonicalCase.world.worldHash } },
      runId, runDirectory, cwd,
      initialTruth: { exact: true, violatesContract: false },
      injection: { hashesMatch: true },
      finalTruth: { exact: true, violatesContract: false },
      proof: { complete: true }, finalized: { type: "run_finalized", proofComplete: true },
      observed: { stopSemanticRed: true, r1CausalChain: { ok: true } },
    };
    const canaryFile = path.join(root, "results", `${item.label}.canary.json`);
    writeFileSync(canaryFile, JSON.stringify(canary));
    const assessment = r1Record({
      schema: "outsider/stage05-r1-run-assessment/v1", label: item.label,
      fixtureId: R1_FIXTURE_ID, runId, runDirectory, cwd,
      processExit: { code: 0, signal: null, error: null },
      canaryResultHash: r1FileDigest(canaryFile),
      evidence: {
        immediate: { ok: true, manifestHash, evidenceRoot },
        stable: { ok: true, manifestHash, evidenceRoot,
          observedAfterMs: R1_MIN_RECOVERY_WINDOW_MS },
      },
      truth: { immediate: { exact: true, violatesContract: false },
        stable: { exact: true, violatesContract: false } },
      causalChain: { interventionId, correctionAuthorityHash: authorityHash },
      supervisedExperience: { recordHash: experience.recordHash },
      attestation: { attestationHash: attestation.attestationHash },
      errors: [],
    }, "assessmentHash");
    writeFileSync(path.join(root, "results", `${item.label}.r1.json`),
      JSON.stringify(assessment));
  }
  writeFileSync(path.join(root, "attestations", "aggregate.json"), JSON.stringify({
    attestationHash: r1Digest("aggregate"), nUnique: 5,
    validityDomain: { claimMode: "EXACT_CLAIM", worldMode: "EXACT_WORLD" },
    included: aggregateIncluded,
  }));
  return { root, schedule };
}

const dependencies = {
  verifyRunDirectory(directory) {
    return JSON.parse(readFileSync(path.join(directory, "fake-verified.json"), "utf8"));
  },
  verifyExperience: () => ({ ok: true }),
  verifyAttestation: () => ({ ok: true }),
};

function rewrite(root, label, mutateCanary, mutateAssessment = () => {}) {
  const canaryFile = path.join(root, "results", `${label}.canary.json`);
  const canary = JSON.parse(readFileSync(canaryFile, "utf8"));
  mutateCanary(canary);
  writeFileSync(canaryFile, JSON.stringify(canary));
  const assessmentFile = path.join(root, "results", `${label}.r1.json`);
  const assessment = JSON.parse(readFileSync(assessmentFile, "utf8"));
  assessment.canaryResultHash = r1FileDigest(canaryFile);
  mutateAssessment(assessment);
  delete assessment.assessmentHash;
  writeFileSync(assessmentFile, JSON.stringify(r1Record(assessment, "assessmentHash")));
}

test("R1 deterministic five-result tally passes only the complete immutable set", () => {
  const data = fixture();
  const report = tallyR1Repeatability(data.root, dependencies);
  assert.equal(report.ok, true);
  assert.deepEqual(report.summary, {
    scheduled: 5, terminalProofComplete: 5, independentlyExact: 5,
    falseGreen: 0, unfinalized: 0, conservativeStops: 0,
    infrastructureFailures: 0,
    supervisedExperiencePresent: 5, perRunAttestationPresent: 5,
  });
});

test("R1 tally fails closed on a mixed packaged-artifact binding", () => {
  const data = fixture();
  rewrite(data.root, data.schedule[2].label, (canary) => {
    canary.r1Binding.artifactHash = r1Digest("different artifact");
  });
  const report = tallyR1Repeatability(data.root, dependencies);
  assert.equal(report.ok, false);
  assert.ok(report.rows[2].errors.includes("ARTIFACT_HASH_MISMATCH"));
});

test("R1 tally distinguishes false green, unfinalized and conservative stop", () => {
  const data = fixture();
  rewrite(data.root, data.schedule[0].label, () => {}, (assessment) => {
    assessment.truth.stable = { exact: false, violatesContract: true };
  });
  rewrite(data.root, data.schedule[1].label, (canary) => {
    canary.complete = false;
    canary.proof.complete = false;
    canary.finalized = null;
  });
  rewrite(data.root, data.schedule[2].label, (canary) => {
    canary.complete = false;
    canary.proof.complete = false;
    canary.finalized.proofComplete = false;
  });
  const report = tallyR1Repeatability(data.root, dependencies);
  assert.equal(report.ok, false);
  assert.equal(report.summary.falseGreen, 1);
  assert.equal(report.summary.unfinalized, 1);
  assert.equal(report.summary.conservativeStops, 1);
});

test("R1 tally rejects duplicate run IDs/workspaces and unstable manifests", () => {
  const data = fixture();
  const first = JSON.parse(readFileSync(path.join(data.root, "results",
    `${data.schedule[0].label}.canary.json`), "utf8"));
  rewrite(data.root, data.schedule[1].label, (canary) => {
    canary.runId = first.runId;
    canary.cwd = first.cwd;
  }, (assessment) => {
    assessment.runId = first.runId;
    assessment.cwd = first.cwd;
    assessment.evidence.stable.manifestHash = r1Digest("post-window mutation");
  });
  const report = tallyR1Repeatability(data.root, dependencies);
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("RUN_IDS_NOT_FRESH"));
  assert.ok(report.errors.includes("WORKSPACES_NOT_FRESH"));
  assert.ok(report.rows[1].errors.includes("MANIFEST_NOT_STABLE"));
});

test("R1 tally classifies a pre-worker semantic outage as infrastructure, not product failure", () => {
  const data = fixture();
  rewrite(data.root, data.schedule[0].label, (canary) => {
    canary.complete = false;
    canary.phase = "before-worker";
    canary.fixtureId = R1_FIXTURE_ID;
    delete canary.fixture;
    canary.error = "SEMANTIC_CONTROL_PREFLIGHT_FAILED:403 Request not allowed";
    canary.runId = null;
    canary.runDirectory = null;
  }, (assessment) => {
    assessment.runId = null;
    assessment.runDirectory = null;
    assessment.errors = ["R1_POST_RUN_ASSESSMENT_FAILED:R1_INFRASTRUCTURE_FAILURE_BEFORE_WORKER"];
  });
  const report = tallyR1Repeatability(data.root, dependencies);
  assert.equal(report.ok, false);
  assert.equal(report.rows[0].outcomeClass, "infrastructure-failure-before-worker");
  assert.equal(report.rows[0].falseGreen, false);
  assert.equal(report.rows[0].conservativeStop, false);
  assert.equal(report.summary.infrastructureFailures, 1);
});
