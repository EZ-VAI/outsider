#!/usr/bin/env node
/* Merge a verified gate-scoped carry-forward record with an immutable base
 * release certificate. The base certificate is never rewritten. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const certificateFile = path.resolve(valueAfter("--certificate") ?? "");
const equivalenceFile = path.resolve(valueAfter("--equivalence") ?? "");
const output = path.resolve(valueAfter("--output") ?? "");
if (!existsSync(certificateFile) || !existsSync(equivalenceFile) || !output) {
  throw new Error("RELEASE_ASSESSMENT_INPUT_MISSING");
}
if (existsSync(output)) throw new Error("RELEASE_ASSESSMENT_OUTPUT_EXISTS");
const shaBytes = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const certificateBytes = readFileSync(certificateFile);
const certificate = JSON.parse(certificateBytes);
const equivalence = JSON.parse(readFileSync(equivalenceFile, "utf8"));
const { recordHash: observedRecordHash, ...equivalenceBody } = equivalence;
if (shaBytes(canonicalizeStrict(equivalenceBody)) !== observedRecordHash) {
  throw new Error("RELEASE_EQUIVALENCE_RECORD_HASH_INVALID");
}
if (equivalence.targetRelease?.artifactHash !== certificate.artifact?.sha256
  || equivalence.targetRelease?.packageVersion !== certificate.product?.version) {
  throw new Error("RELEASE_EQUIVALENCE_TARGET_MISMATCH");
}
if (equivalence.inheritedGates?.R2?.status !== "PASS"
  || equivalence.inheritedGates?.R3?.status !== "PASS") {
  throw new Error("RELEASE_EQUIVALENCE_GATES_NOT_PASS");
}
const fieldEvidence = structuredClone(certificate.fieldEvidence ?? {});
for (const gate of ["R2", "R3"]) {
  const key = gate === "R2" ? "r2AgentTeamDelivery" : "r3IntegrationCorrection";
  fieldEvidence[key] = {
    status: "PASS",
    ok: true,
    gate,
    inherited: true,
    equivalenceRecordHash: observedRecordHash,
    sourceArtifactHash: equivalence.sourceEvidence.artifactHash,
    sourceRunId: equivalence.sourceEvidence.runId,
    sourceManifestHash: equivalence.sourceEvidence.manifestHash,
    targetArtifactHash: equivalence.targetRelease.artifactHash,
    basis: equivalence.inheritedGates[gate].basis,
    claimBoundary: equivalence.claimBoundary,
  };
}
const required = ["liveCanary", "r1Repeatability", "r2AgentTeamDelivery",
  "r3IntegrationCorrection", "r4CrashRecovery", "desktopCoworkPlugin",
  "multiHourEndurance", "independentSecondMachineInstall"];
const blockers = required.filter((name) => fieldEvidence[name]?.status !== "PASS")
  .map((name) => ({ gate: name, status: fieldEvidence[name]?.status ?? "MISSING" }));
const body = {
  schema: "outsider/stage05-release-assessment/v1",
  generatedAt: new Date().toISOString(),
  product: certificate.product,
  artifact: certificate.artifact,
  baseCertificate: {
    file: path.basename(certificateFile),
    sha256: shaBytes(certificateBytes),
    releaseDecision: certificate.releaseDecision,
  },
  supplementalEvidence: {
    file: path.relative(path.dirname(output), equivalenceFile),
    recordHash: observedRecordHash,
  },
  fieldEvidence,
  stablePublicReleaseReady: blockers.length === 0,
  blockers,
  claimBoundary: [
    "R2/R3 carry-forward is gate-scoped and does not pool reliability samples across versions",
    "R4 and R5 retain their exact 1.3.88 outcomes",
    "a failed or missing gate is never promoted by equivalence",
  ],
};
const assessment = { ...body, recordHash: shaBytes(canonicalizeStrict(body)) };
writeFileSync(output, `${JSON.stringify(assessment, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ ok: true, output,
  inherited: ["R2", "R3"], blockers, recordHash: assessment.recordHash }, null, 2)}\n`);
