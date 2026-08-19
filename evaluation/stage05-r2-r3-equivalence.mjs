#!/usr/bin/env node
/*
 * One-way, gate-scoped evidence bridge for the 1.3.86 Agent Team result.
 *
 * This does not declare two npm artifacts globally equivalent. It proves only
 * that the bytes which adjudicate R2/R3 are unchanged, except for the private
 * expectedShiftSteps() helper whose complete body is removed before comparing
 * the controllers. That helper is used only by R5 endurance wake handling.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import { certifyAgentTeamEvidence } from "../src/outsider-field-evidence.js";
import { verifyStage05RunDirectory } from "../src/outsider-stage05-evidence.js";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const priorRoot = path.resolve(valueAfter("--prior-run") ?? "");
const targetArtifact = path.resolve(valueAfter("--target-artifact") ?? "");
const output = path.resolve(valueAfter("--output") ?? "");
if (!existsSync(path.join(priorRoot, "result.json")) || !existsSync(targetArtifact) || !output) {
  throw new Error("R2_R3_EQUIVALENCE_INPUT_MISSING");
}
if (existsSync(output)) throw new Error("R2_R3_EQUIVALENCE_OUTPUT_EXISTS");

const shaBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const shaFile = (file) => shaBytes(readFileSync(file));
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const prereg = readJson(path.join(priorRoot, "preregistration.json"));
const result = readJson(path.join(priorRoot, "result.json"));
const priorArtifact = path.resolve(priorRoot, prereg.releaseArtifact?.file ?? "missing");
if (!existsSync(priorArtifact)) throw new Error("R2_R3_PRIOR_ARTIFACT_MISSING");

function extractArtifact(artifact) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-equivalence-"));
  try {
    execFileSync("tar", ["-xzf", artifact, "-C", directory], { stdio: "pipe" });
    const root = path.join(directory, "package");
    const pkg = readJson(path.join(root, "package.json"));
    return { directory, root, pkg };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

/* Return the source with one complete named function replaced. The scanner is
 * deliberately tiny but fail-closed for strings/templates and brace balance. */
function omitNamedFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`R2_R3_SCOPED_FUNCTION_CARDINALITY:${name}`);
  }
  const brace = source.indexOf("{", start);
  if (brace < 0) throw new Error(`R2_R3_SCOPED_FUNCTION_BODY_MISSING:${name}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (["\"", "'", "`"].includes(char)) { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) {
      return `${source.slice(0, start)}function ${name}(/* R5-only body omitted */) {}`
        + source.slice(index + 1);
    }
  }
  throw new Error(`R2_R3_SCOPED_FUNCTION_UNBALANCED:${name}`);
}

const prior = extractArtifact(priorArtifact);
const target = extractArtifact(targetArtifact);
try {
  if (shaFile(priorArtifact) !== prereg.releaseArtifact.sha256) {
    throw new Error("R2_R3_PRIOR_ARTIFACT_HASH_MISMATCH");
  }
  const priorRunDirectory = path.join(priorRoot, "state", result.runId ?? "missing");
  const verified = verifyStage05RunDirectory(priorRunDirectory);
  if (!verified.ok) throw new Error("R2_R3_PRIOR_SEALED_RUN_INVALID");
  const observedRuntime = {
    controller: verified.binding.source.controllerImplementationHash,
    runner: verified.binding.source.runnerImplementationHash,
    hook: verified.binding.source.hookImplementationHash,
    contractCompiler: verified.binding.source.contractCompilerHash,
    outcomeVerifier: verified.binding.source.outcomeVerifierHash,
  };
  const priorR3 = certifyAgentTeamEvidence(priorRoot, {
    expectedArtifactHash: prereg.releaseArtifact.sha256,
    expectedVersion: prereg.releaseArtifact.packageVersion,
    expectedRuntimeHashes: observedRuntime,
    expectedSourceHashes: prereg.sourceHashes,
    requireIntegrationCorrection: true,
  });
  if (!priorR3.ok) throw new Error(`R2_R3_PRIOR_R3_INVALID:${priorR3.errors.join("|")}`);
  if (!(result.conformance?.ok === true && result.crossLedger?.ok === true
    && result.protocolOk === true && result.deliveryProofOk === true
    && result.proof?.complete === true && result.evidence?.ok === true)) {
    throw new Error("R2_R3_PRIOR_R2_SUBCLAIM_INVALID");
  }

  const files = {
    controller: "src/outsider-kernel-controller.js",
    runner: "src/outsider-kernel-runner.js",
    hook: "bin/outsider-hook.mjs",
    probeHook: "scripts/stage05-agent-team-probe-hook.mjs",
    conformance: "src/outsider-agent-team-conformance.js",
    probe: "scripts/stage05-agent-team-probe.mjs",
    artifactBinding: "scripts/stage05-release-artifact-binding.mjs",
  };
  const exact = {};
  for (const [name, relative] of Object.entries(files)) {
    const before = shaFile(path.join(prior.root, relative));
    const after = shaFile(path.join(target.root, relative));
    exact[name] = { path: relative, priorHash: before, targetHash: after,
      exactMatch: before === after };
  }
  const nonControllerDrift = Object.entries(exact)
    .filter(([name, item]) => name !== "controller" && !item.exactMatch);
  if (nonControllerDrift.length) {
    throw new Error(`R2_R3_GATE_CLOSURE_DRIFT:${nonControllerDrift.map(([name]) => name).join(",")}`);
  }
  const priorController = readFileSync(path.join(prior.root, files.controller), "utf8");
  const targetController = readFileSync(path.join(target.root, files.controller), "utf8");
  const priorScopedHash = shaBytes(omitNamedFunction(priorController, "expectedShiftSteps"));
  const targetScopedHash = shaBytes(omitNamedFunction(targetController, "expectedShiftSteps"));
  if (priorScopedHash !== targetScopedHash) throw new Error("R2_R3_CONTROLLER_SCOPED_DRIFT");

  const body = {
    schema: "outsider/stage05-field-evidence-equivalence/v1",
    generatedAt: new Date().toISOString(),
    sourceEvidence: {
      gate: "R3_WITH_R2_SUBCLAIM",
      directory: path.relative(process.cwd(), priorRoot),
      artifactHash: prereg.releaseArtifact.sha256,
      packageVersion: prereg.releaseArtifact.packageVersion,
      runId: result.runId,
      manifestHash: verified.manifest.manifestHash,
      r2BaseConformance: true,
      r3AuditedIntegrationCorrection: true,
    },
    targetRelease: {
      artifact: path.basename(targetArtifact),
      artifactHash: shaFile(targetArtifact),
      packageVersion: target.pkg.version,
    },
    closureProof: {
      exactFiles: Object.values(exact).filter((item) => item.path !== files.controller),
      scopedFile: {
        path: files.controller,
        priorHash: exact.controller.priorHash,
        targetHash: exact.controller.targetHash,
        omittedFunction: "expectedShiftSteps",
        omittedFunctionClaim: "R5_ENDURANCE_SHIFT_ONLY",
        priorScopedHash,
        targetScopedHash,
        scopedMatch: true,
      },
    },
    inheritedGates: {
      R2: { status: "PASS", basis: "R3 sealed run includes exact Agent Team delivery subclaim" },
      R3: { status: "PASS", basis: "sealed audited integration-correction causal chain" },
    },
    exclusions: ["R1", "R4", "R5", "Desktop Cowork", "endurance", "cross-host"],
    claimBoundary: "Gate-scoped carry-forward only; this does not claim whole-artifact equivalence or pool reliability samples across versions.",
  };
  const record = { ...body, recordHash: shaBytes(canonicalizeStrict(body)) };
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ ok: true, output, recordHash: record.recordHash,
    inheritedGates: record.inheritedGates }, null, 2)}\n`);
} finally {
  rmSync(prior.directory, { recursive: true, force: true });
  rmSync(target.directory, { recursive: true, force: true });
}
