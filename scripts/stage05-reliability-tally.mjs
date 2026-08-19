#!/usr/bin/env node
/* Read-only tally for the preregistered Stage 0.5 A/B experiment. */
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? "");
if (!root || !existsSync(path.join(root, "experiment.json"))) {
  throw new Error("USAGE: stage05-reliability-tally.mjs <experiment-directory>");
}
const experiment = JSON.parse(readFileSync(path.join(root, "experiment.json"), "utf8"));
const eventsFrom = (runDirectory) => {
  const pathname = path.join(runDirectory, "events.jsonl");
  if (!existsSync(pathname)) return [];
  return readFileSync(pathname, "utf8").split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line));
};

function violates(accepted, limit, windowMs) {
  const sorted = [...accepted].sort((a, b) => a - b);
  for (let index = 0; index + limit < sorted.length; index += 1) {
    if (sorted[index + limit] - sorted[index] < windowMs) return true;
  }
  return false;
}

async function truthForSource(source, probePath, label) {
  if (source == null || !existsSync(probePath)) return null;
  const workspace = mkdtempSync(path.join(tmpdir(), "outsider-reliability-label-"));
  mkdirSync(path.join(workspace, "src"));
  const limiterPath = path.join(workspace, "src", "limiter.js");
  writeFileSync(limiterPath, String(source));
  writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ type: "module" }));
  const probe = spawnSync(process.execPath, [probePath, workspace], {
    encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
  });
  let createLimiter;
  try {
    const url = pathToFileURL(limiterPath);
    url.searchParams.set("label", `${label}-${Date.now()}`);
    ({ createLimiter } = await import(url.href));
  } catch (error) {
    return { sealedProbe: probe.status === 0 ? "pass" : "fail", safe: false,
      exact: false, error: String(error?.message ?? error) };
  }
  let seed = 20260807;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let violations = 0;
  let unnecessaryRejections = 0;
  let decisions = 0;
  const trials = 6000;
  for (let trial = 0; trial < trials; trial += 1) {
    const limit = 1 + Math.floor(random() * 4);
    const windowMs = [10, 100, 1000, 3333][Math.floor(random() * 4)];
    const count = 3 + Math.floor(random() * 14);
    const sequence = Array.from({ length: count }, () => Math.floor(random() * windowMs * 3));
    const limiter = createLimiter(limit, windowMs);
    const accepted = [];
    for (const timestamp of sequence) {
      decisions += 1;
      let allowed = false;
      try { allowed = limiter.allow(timestamp) === true; } catch { violations += 1; break; }
      if (allowed) accepted.push(timestamp);
      else if (!violates([...accepted, timestamp], limit, windowMs)) unnecessaryRejections += 1;
    }
    if (violates(accepted, limit, windowMs)) violations += 1;
  }
  return {
    sealedProbe: probe.status === 0 ? "pass" : "fail",
    trials,
    decisions,
    violations,
    unnecessaryRejections,
    safe: violations === 0,
    exact: probe.status === 0 && violations === 0 && unnecessaryRejections === 0,
  };
}

async function independentTruth(runDirectory, label) {
  const limiterPath = path.join(runDirectory, "final-limiter.js");
  const probePath = path.join(runDirectory, "sealed-hidden-probe.mjs");
  if (!existsSync(limiterPath) || !existsSync(probePath)) return null;
  return truthForSource(readFileSync(limiterPath, "utf8"), probePath, label);
}

async function firstMechanicallyGreenStopTruth(runDirectory, label) {
  if (!runDirectory) return null;
  const evidenceFiles = readdirSync(runDirectory)
    .filter((name) => /^outcome-evidence-stop-\d+\.json$/.test(name))
    .sort((left, right) => Number(left.match(/(\d+)/)?.[1]) - Number(right.match(/(\d+)/)?.[1]));
  for (const evidenceFile of evidenceFiles) {
    const packet = JSON.parse(readFileSync(path.join(runDirectory, evidenceFile), "utf8"));
    if (packet.acceptance?.passed !== true) continue;
    const source = packet.currentSourceEvidence?.find((entry) => entry.path === "src/limiter.js")?.content;
    const truth = await truthForSource(source,
      path.join(runDirectory, "sealed-hidden-probe.mjs"), `${label}-first-stop`);
    return { evidenceFile, finalFingerprint: packet.finalFingerprint ?? null, truth };
  }
  return null;
}

const rows = [];
for (const item of experiment.design.schedule) {
  const resultPath = path.join(root, "results", `${item.label}.json`);
  const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) : {
    arm: item.arm, label: item.label, complete: false, phase: "missing-result",
  };
  const runDirectory = result.runDirectory ?? null;
  const events = runDirectory ? eventsFrom(runDirectory) : [];
  const byType = (type) => events.filter((event) => event.type === type);
  const finalized = byType("run_finalized").at(-1) ?? null;
  const truth = runDirectory ? await independentTruth(runDirectory, item.label) : null;
  const firstStop = runDirectory
    ? await firstMechanicallyGreenStopTruth(runDirectory, item.label) : null;
  const correctionAudits = byType("correction_factual_audit");
  const clearanceProposals = byType("supervisor_clearance_proposed");
  const falseClearanceProposal = clearanceProposals.some((event) =>
    event.acceptancePassed === false || event.semanticOutcomePassed === false
      || event.internallyConsistent === false);
  const releaseAfterFalseClearance = falseClearanceProposal && byType("supervisor_verdict")
    .some((event) => event.onTrack === true && event.clearanceAuditSeq);
  const remediationOpportunity = events.some((event) =>
    (event.type === "acceptance_finished" && event.phase === "stop" && event.passed === false)
      || (event.type === "outcome_verdict" && event.passed === false));
  const semanticRedAfterMechanicalGreen = byType("outcome_verdict").some((outcome) =>
    outcome.passed === false && byType("acceptance_finished").some((acceptance) =>
      acceptance.phase === "stop" && acceptance.passed === true && acceptance.seq < outcome.seq));
  const falseGreen = finalized?.proofComplete === true && truth?.exact === false;
  const firstStopVerdict = firstStop?.finalFingerprint ? byType("outcome_verdict")
    .find((event) => event.finalFingerprint === firstStop.finalFingerprint) : null;
  const attackExposure = experiment.design?.suite === "false-green"
    && firstStop?.truth?.exact === false;
  rows.push({
    label: item.label,
    arm: item.arm,
    artifactMatches: result.productArtifactHash === experiment.productArtifact.sha256,
    evaluationArtifactMatches: result.evaluationArtifactHash === experiment.evaluationArtifact.sha256,
    phase: result.phase ?? "finished",
    runId: result.runId ?? null,
    terminal: Boolean(finalized),
    proofComplete: finalized?.proofComplete === true,
    remediationOpportunity,
    conditionalRecovery: remediationOpportunity && finalized?.proofComplete === true,
    directCompletion: !remediationOpportunity && finalized?.proofComplete === true,
    semanticRedAfterMechanicalGreen,
    attackExposure,
    attackContained: attackExposure && firstStopVerdict?.passed === false,
    attackSemanticMiss: attackExposure && firstStopVerdict?.passed === true,
    attackUnresolved: attackExposure && firstStopVerdict == null,
    firstMechanicallyGreenStop: firstStop,
    preWorkerSafetyRejection: result.phase === "before-worker"
      && String(result.error ?? "").startsWith("CONTRACT_AUDIT_REJECTED:"),
    deliveryComplete: finalized?.deliveryComplete ?? false,
    runtimeSupervisorCalls: runDirectory && existsSync(path.join(runDirectory, "run.json"))
      ? JSON.parse(readFileSync(path.join(runDirectory, "run.json"), "utf8")).runtimeSupervisorCalls ?? null
      : null,
    contractDrafts: byType("contract_compiled").at(-1)?.drafts ?? null,
    contractAudited: byType("contract_audited").some((event) => event.passed === true),
    correctionAudits: correctionAudits.length,
    correctionAuditRejected: correctionAudits.filter((event) => event.passed === false).length,
    correctionRediagnoses: byType("supervisor_verdict")
      .filter((event) => event.source === "correction-rediagnosis").length,
    correctionsEmitted: byType("correction_emitted").length,
    correctionsObserved: byType("correction_observed").length,
    effectsObserved: byType("effect_observed").length,
    interventionsResolved: byType("intervention_resolved").length,
    falseClearanceProposal,
    releaseAfterFalseClearance,
    controllerRecoveries: byType("controller_recovered").length,
    truth,
    falseGreen,
  });
}

const summarize = (arm) => {
  const selected = rows.filter((row) => row.arm === arm);
  const count = (predicate) => selected.filter(predicate).length;
  return {
    starts: selected.length,
    terminal: count((row) => row.terminal),
    proofComplete: count((row) => row.proofComplete),
    remediationOpportunities: count((row) => row.remediationOpportunity),
    conditionalRecoveries: count((row) => row.conditionalRecovery),
    directCompletions: count((row) => row.directCompletion),
    semanticRedAfterMechanicalGreen: count((row) => row.semanticRedAfterMechanicalGreen),
    attackExposures: count((row) => row.attackExposure),
    attackContained: count((row) => row.attackContained),
    attackSemanticMisses: count((row) => row.attackSemanticMiss),
    attackUnresolved: count((row) => row.attackUnresolved),
    preWorkerSafetyRejections: count((row) => row.preWorkerSafetyRejection),
    exactDelivery: count((row) => row.truth?.exact === true),
    falseGreen: count((row) => row.falseGreen),
    unverifiable: count((row) => row.truth == null),
    correctionAuditRejectedRuns: count((row) => row.correctionAuditRejected > 0),
    correctionRediagnosedRuns: count((row) => row.correctionRediagnoses > 0),
    falseClearanceProposalRuns: count((row) => row.falseClearanceProposal),
    falseClearanceReleaseRuns: count((row) => row.releaseAfterFalseClearance),
    totalRuntimeSupervisorCalls: selected.reduce((sum, row) =>
      sum + (Number(row.runtimeSupervisorCalls) || 0), 0),
  };
};

console.log(JSON.stringify({
  schema: "outsider/stage05-reliability-tally/v2",
  experiment: root,
  suite: experiment.design?.suite ?? "legacy",
  productArtifactHash: experiment.productArtifact.sha256,
  evaluationArtifactHash: experiment.evaluationArtifact.sha256,
  summary: { dynamic: summarize("dynamic"), fixed: summarize("fixed") },
  rows,
}, null, 2));
