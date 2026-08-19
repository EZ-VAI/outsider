import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  verifyAttestationV2,
  verifyStage05RunDirectory,
} from "./outsider-stage05-evidence.js";
import { verifyCoworkConformance } from "./outsider-cowork-conformance.js";

function sha256File(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`FIELD_EVIDENCE_JSON_INVALID:${file}:${error.message}`); }
}

function child(root, ...parts) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...parts);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`FIELD_EVIDENCE_PATH_ESCAPES_ROOT:${resolved}`);
  }
  return resolved;
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function expectedRuntimeMatches(verified, expectedVersion, expectedRuntimeHashes) {
  const source = verified?.binding?.source ?? {};
  const observed = {
    controller: source.controllerImplementationHash,
    runner: source.runnerImplementationHash,
    hook: source.hookImplementationHash,
    contractCompiler: source.contractCompilerHash,
    outcomeVerifier: source.outcomeVerifierHash,
  };
  return {
    ok: source.packageVersion === expectedVersion
      && Object.entries(expectedRuntimeHashes ?? {}).every(([key, value]) => observed[key] === value),
    packageVersion: source.packageVersion ?? null,
    runtimeHashes: observed,
  };
}

export function certifyCoworkEvidence({ stateRoot, workspace, expectedPrompt = null } = {}, {
  expectedVersion,
  expectedRuntimeHashes,
} = {}) {
  const errors = [];
  try {
    const assessment = verifyCoworkConformance({ stateRoot, workspace, expectedPrompt });
    add(errors, assessment.ok === true, "Desktop Cowork conformance did not pass");
    if (!assessment.runDirectory) errors.push("Desktop Cowork run directory is missing");
    const verified = assessment.runDirectory
      ? verifyStage05RunDirectory(assessment.runDirectory) : { ok: false };
    add(errors, verified.ok === true, "Desktop Cowork sealed run is invalid");
    if (verified.ok) {
      const runtime = expectedRuntimeMatches(verified, expectedVersion, expectedRuntimeHashes);
      add(errors, runtime.ok, "Desktop Cowork runtime differs from the release artifact");
      add(errors, verified.projection?.outcome?.terminalClass === "SAFE_DELIVERY",
        "Desktop Cowork terminal class is not SAFE_DELIVERY");
    }
    return { ok: errors.length === 0, status: errors.length ? "FAIL" : "PASS",
      gate: "DESKTOP_COWORK", runId: assessment.runId ?? null,
      runDirectory: assessment.runDirectory ?? null,
      manifestHash: verified.ok ? verified.manifest.manifestHash : null,
      preToolBoundaries: assessment.preToolBoundaries ?? 0,
      postToolBoundaries: assessment.postToolBoundaries ?? 0,
      errors: [...errors, ...(assessment.ok ? [] : assessment.errors ?? [])] };
  } catch (error) {
    return { ok: false, status: "FAIL", gate: "DESKTOP_COWORK",
      errors: [...errors, String(error?.message ?? error)] };
  }
}

export function certifyR1RepeatabilityEvidence(directory, {
  expectedArtifactHash,
  expectedVersion,
  expectedEvaluatorHashes = {},
} = {}) {
  const root = path.resolve(directory);
  const errors = [];
  try {
    const experiment = readJson(child(root, "experiment.json"));
    const tally = readJson(child(root, "tally.json"));
    add(errors, experiment.schema === "outsider/stage05-r1-repeatability-experiment/v1",
      "R1 experiment schema is invalid");
    add(errors, tally.schema === "outsider/stage05-r1-repeatability-tally/v1" && tally.ok === true,
      "R1 tally did not pass");
    const prereg = experiment.preregistration ?? {};
    const artifactFile = child(root, prereg.artifact?.path ?? "missing-artifact");
    add(errors, existsSync(artifactFile), "R1 frozen artifact is missing");
    if (existsSync(artifactFile)) {
      const observedArtifactHash = sha256File(artifactFile);
      add(errors, observedArtifactHash === expectedArtifactHash,
        "R1 artifact differs from the release artifact");
      add(errors, prereg.artifact?.sha256 === observedArtifactHash,
        "R1 preregistration does not bind its frozen artifact");
    }
    for (const entry of prereg.evaluator?.files ?? []) {
      const frozen = child(root, entry.path);
      add(errors, existsSync(frozen) && sha256File(frozen) === entry.sha256,
        `R1 evaluator file is missing or changed: ${entry.path}`);
      if (expectedEvaluatorHashes[entry.path]) {
        add(errors, entry.sha256 === expectedEvaluatorHashes[entry.path],
          `R1 evaluator differs from the release evaluator: ${entry.path}`);
      }
    }
    const summary = tally.summary ?? {};
    add(errors, summary.scheduled === 5 && summary.terminalProofComplete === 5
      && summary.independentlyExact === 5 && summary.falseGreen === 0
      && summary.unfinalized === 0 && summary.conservativeStops === 0
      && summary.infrastructureFailures === 0 && summary.supervisedExperiencePresent === 5
      && summary.perRunAttestationPresent === 5,
    "R1 five-run terminal summary is incomplete");
    const schedule = experiment.design?.schedule ?? [];
    const rows = tally.rows ?? [];
    add(errors, schedule.length === 5 && rows.length === 5,
      "R1 must contain exactly five scheduled results");
    const runIds = new Set();
    const workspaces = new Set();
    for (const item of schedule) {
      const assessment = readJson(child(root, "results", `${item.label}.r1.json`));
      const row = rows.find((candidate) => candidate.label === item.label);
      add(errors, assessment.schema === "outsider/stage05-r1-run-assessment/v1",
        `R1 assessment schema is invalid: ${item.label}`);
      add(errors, Array.isArray(assessment.errors) && assessment.errors.length === 0,
        `R1 assessment contains errors: ${item.label}`);
      add(errors, assessment.binding?.artifactHash === expectedArtifactHash,
        `R1 run is not bound to the release artifact: ${item.label}`);
      add(errors, assessment.causalChain?.ok === true
        && assessment.truth?.immediate?.exact === true
        && assessment.truth?.stable?.exact === true
        && assessment.evidence?.immediate?.ok === true
        && assessment.evidence?.stable?.ok === true
        && assessment.evidence.immediate.manifestHash === assessment.evidence.stable.manifestHash
        && assessment.evidence.immediate.evidenceRoot === assessment.evidence.stable.evidenceRoot
        && assessment.supervisedExperience?.verified === true,
      `R1 run lacks exact stable causal evidence: ${item.label}`);
      add(errors, row?.passed === true && row?.exact === true && row?.proofComplete === true
        && row?.falseGreen === false && row?.unfinalized === false
        && row?.conservativeStop === false && row?.infrastructureFailure === false,
      `R1 tally row is not a safe exact delivery: ${item.label}`);
      const runDirectory = child(root, "state", item.label, assessment.runId ?? "missing-run");
      const verified = verifyStage05RunDirectory(runDirectory);
      add(errors, verified.ok === true, `R1 sealed run is invalid: ${item.label}`);
      if (verified.ok) {
        const runtime = expectedRuntimeMatches(verified, expectedVersion, {});
        add(errors, runtime.packageVersion === expectedVersion,
          `R1 run package version differs from release: ${item.label}`);
        add(errors, verified.manifest.manifestHash === assessment.evidence.immediate.manifestHash,
          `R1 manifest hash differs from assessment: ${item.label}`);
      }
      const attestation = readJson(child(root, "attestations", `${item.label}.json`));
      add(errors, verifyAttestationV2(attestation).ok === true,
        `R1 per-run attestation is invalid: ${item.label}`);
      runIds.add(assessment.runId);
      workspaces.add(assessment.cwd);
    }
    add(errors, runIds.size === 5 && workspaces.size === 5,
      "R1 run IDs and workspaces are not independent");
    const aggregate = readJson(child(root, "attestations", "aggregate.json"));
    add(errors, verifyAttestationV2(aggregate).ok === true,
      "R1 aggregate attestation is invalid");
    return { ok: errors.length === 0, status: errors.length ? "FAIL" : "PASS",
      gate: "R1", artifactHash: expectedArtifactHash, runCount: rows.length,
      manifestHashes: rows.map((row) => row.manifestHash), errors };
  } catch (error) {
    return { ok: false, status: "FAIL", gate: "R1",
      errors: [...errors, String(error.message ?? error)] };
  }
}

export function certifyAgentTeamEvidence(directory, {
  expectedArtifactHash,
  expectedVersion,
  expectedRuntimeHashes,
  expectedSourceHashes,
  requireIntegrationCorrection = false,
} = {}) {
  const root = path.resolve(directory);
  const gate = requireIntegrationCorrection ? "R3" : "R2";
  const errors = [];
  try {
    const result = readJson(child(root, "result.json"));
    const prereg = readJson(child(root, "preregistration.json"));
    add(errors, result.schema === "outsider/stage05-agent-team-probe-result/v1",
      `${gate} result schema is invalid`);
    add(errors, prereg.schema === "outsider/stage05-agent-team-probe/v1",
      `${gate} preregistration schema is invalid`);
    add(errors, prereg.releaseArtifact?.sha256 === expectedArtifactHash
      && prereg.releaseArtifact?.packageVersion === expectedVersion,
    `${gate} is not bound to the exact release artifact`);
    const frozenArtifact = child(root, prereg.releaseArtifact?.file ?? "missing-artifact");
    add(errors, existsSync(frozenArtifact) && sha256File(frozenArtifact) === expectedArtifactHash,
      `${gate} frozen release artifact is missing or changed`);
    add(errors, JSON.stringify(result.releaseArtifact ?? null)
      === JSON.stringify(prereg.releaseArtifact ?? null),
    `${gate} result release-artifact binding differs from preregistration`);
    add(errors, result.ok === true && result.protocolOk === true
      && result.deliveryProofOk === true && result.evidenceBoundBeforeFinish === true
      && result.sourceHashesStable === true && result.sourceHashesStableAfterFinish === true
      && result.hostEnvelopeSourceStable === true && result.recorderStable === true
      && result.workerExit?.code === 0 && result.workerExit?.signal == null,
    `${gate} protocol or delivery proof did not pass`);
    add(errors, result.conformance?.ok === true && result.crossLedger?.ok === true,
      `${gate} Agent Team conformance did not pass`);
    add(errors, result.proof?.complete === true && result.evidence?.ok === true,
      `${gate} Stage 0.5 proof or sealed evidence is incomplete`);
    add(errors, prereg.r3IntegrationCorrection === requireIntegrationCorrection,
      `${gate} correction mode differs from the requested gate`);
    if (requireIntegrationCorrection) {
      add(errors, result.r3Assessment?.required === true && result.r3Assessment?.ok === true
        && result.r3Assessment?.injectionCount === 1
        && result.r3Assessment?.causalChainComplete === true
        && result.proof?.interventionRequired === true
        && result.proof?.interventionComplete === true,
      "R3 integration correction causal chain is incomplete");
    }
    const runDirectory = child(root, "state", result.runId ?? "missing-run");
    const verified = verifyStage05RunDirectory(runDirectory);
    add(errors, verified.ok === true, `${gate} sealed run is invalid`);
    if (verified.ok) {
      const runtime = expectedRuntimeMatches(verified, expectedVersion, expectedRuntimeHashes);
      add(errors, runtime.ok, `${gate} runtime differs from the release artifact`);
      add(errors, verified.manifest.manifestHash === result.evidence?.manifest?.manifestHash,
        `${gate} result does not bind the verified manifest`);
    }
    for (const [name, expected] of Object.entries(expectedSourceHashes ?? {})) {
      add(errors, prereg.sourceHashes?.[name] === expected
        && result.finalSourceHashes?.[name] === expected
        && result.postFinishSourceHashes?.[name] === expected,
      `${gate} evaluator/runtime source differs from release: ${name}`);
    }
    return { ok: errors.length === 0, status: errors.length ? "FAIL" : "PASS", gate,
      runId: result.runId ?? null, manifestHash: verified.ok ? verified.manifest.manifestHash : null,
      artifactHash: prereg.releaseArtifact?.sha256 ?? null, errors };
  } catch (error) {
    return { ok: false, status: "FAIL", gate,
      errors: [...errors, String(error.message ?? error)] };
  }
}

export function certifyR4CrashRecoveryEvidence(directory, {
  expectedArtifactHash,
  expectedVersion,
  expectedSourceHashes,
} = {}) {
  const root = path.resolve(directory);
  const errors = [];
  try {
    const result = readJson(child(root, "result.json"));
    const prereg = readJson(child(root, "preregistration.json"));
    add(errors, result.schema === "outsider/stage05-r4-batch-result/v1" && result.ok === true,
      "R4 batch result did not pass");
    add(errors, prereg.schema === "outsider/stage05-r4-preregistration/v1",
      "R4 preregistration schema is invalid");
    add(errors, result.artifactHash === expectedArtifactHash
      && prereg.artifactHash === expectedArtifactHash,
    "R4 artifact differs from the release artifact");
    add(errors, result.recoveryWindowMs >= 120_000 && prereg.recoveryWindowMs >= 120_000,
      "R4 recovery window is too short");
    for (const [relative, expected] of Object.entries(expectedSourceHashes ?? {})) {
      add(errors, prereg.sourceHashes?.[relative] === expected
        && result.sourceHashes?.[relative] === expected,
      `R4 source differs from release: ${relative}`);
    }
    const required = new Set(["correction-audit-in-flight", "correction-persisted-before-reply",
      "outcome-audit-in-flight", "terminal-event-before-state-lease",
      "controller-and-attached-daemon-restart"]);
    const seen = new Set();
    for (const entry of result.results ?? []) {
      const lane = entry.lane ?? {};
      seen.add(lane.lane);
      add(errors, required.has(lane.lane) && lane.passed === true
        && lane.sameRunId === true && lane.sameContractSeal === true
        && lane.orphanJudgeProcesses === 0,
      `R4 lane did not preserve recovery identity: ${lane.lane ?? "unknown"}`);
      const laneRoot = child(root, "state", lane.lane ?? "missing", lane.runId ?? "missing-run");
      const verified = verifyStage05RunDirectory(laneRoot);
      add(errors, verified.ok === true, `R4 sealed lane is invalid: ${lane.lane}`);
      if (verified.ok) {
        add(errors, verified.binding.source.packageVersion === expectedVersion,
          `R4 lane package version differs from release: ${lane.lane}`);
        add(errors, verified.manifest.manifestHash === entry.manifestHash,
          `R4 lane manifest differs from result: ${lane.lane}`);
      }
      const attestation = readJson(child(root, `${lane.lane}.attestation.json`));
      add(errors, verifyAttestationV2(attestation).ok === true,
        `R4 lane attestation is invalid: ${lane.lane}`);
    }
    add(errors, (result.results ?? []).length === 5 && required.size === seen.size
      && [...required].every((lane) => seen.has(lane)),
      "R4 does not contain exactly the five required lanes");
    return { ok: errors.length === 0, status: errors.length ? "FAIL" : "PASS", gate: "R4",
      artifactHash: result.artifactHash ?? null, laneCount: seen.size,
      manifestHashes: (result.results ?? []).map((entry) => entry.manifestHash), errors };
  } catch (error) {
    return { ok: false, status: "FAIL", gate: "R4",
      errors: [...errors, String(error.message ?? error)] };
  }
}
