import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildInstitutionalAiRemedyEvidenceFromSource,
  buildInstitutionalAiRemedyEvidenceProjection,
  verifyInstitutionalAiRemedyEvidence,
  verifyInstitutionalAiRemedyEvidenceAgainstSource,
} from "../src/outsider-institutional-ai-remedy-evidence.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "artifacts/reality-institutional-ai-remedies-20260821/source");
const HAS_SOURCE = existsSync(SOURCE);

function hash(domain, value) {
  return `sha256:${createHash("sha256").update(
    `${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

test("fixed projection separates real environment, institutional remedy, and authority", () => {
  const book = buildInstitutionalAiRemedyEvidenceProjection();
  const checked = verifyInstitutionalAiRemedyEvidence(book);
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(book.summary.cases, 2);
  assert.equal(book.summary.obligations, 13);
  assert.equal(book.summary.monitoringDocuments, 5);
  assert.equal(book.evidenceInterpretation.realEnvironmentEvidence, true);
  assert.equal(book.evidenceInterpretation.privateResearchOnlySourceRealityClaimed, false);
  assert.equal(book.evidenceInterpretation.orderIsPerformance, false);
  assert.equal(book.sourceManifest.sourceArtifactsReverifiedByBook, false);
  assert.ok(book.cases[0].monitoringRecords.every((row) => (
    row.reportBytePinDeclared === true
      && row.reportBytesSourceReplayedByBook === false
  )));
  assert.equal(book.sourceManifest.officialPageProjectionReparsedByBook, false);
  assert.equal(book.sourceManifest.rights.legalReuseRightsVerifiedForTraining, false);
  assert.equal(book.authority.economicLossEvidenceEligible, false);
  assert.equal(book.authority.PRICE, false);
  assert.equal(book.flywheel.decision, "HOLD_EXTERNAL_GOVERNANCE_AND_COMPLETENESS");
  assert.equal(book.flywheel.observedStageCounts.implementationEvidence, 0);
  assert.equal(book.flywheel.observedStageCounts.monitoringDocumentPublication, 5);
  assert.equal(book.flywheel.quantitativeBoundary.stageTransitionProbabilityEstimated, false);
});

test("public reseal cannot promote remedy evidence to price, execution, or closure", () => {
  const book = structuredClone(buildInstitutionalAiRemedyEvidenceProjection());
  book.authority.PRICE = true;
  book.authority.GUARANTEE = true;
  book.flywheel.permitsExecution = true;
  book.flywheel.permitsClosure = true;
  const flywheelHash = book.flywheel.flywheelHash;
  delete book.flywheel.flywheelHash;
  book.flywheel.flywheelHash = hash("outsider:institutional-remedy-flywheel:v1",
    book.flywheel);
  assert.notEqual(book.flywheel.flywheelHash, flywheelHash);
  delete book.bookHash;
  book.bookHash = hash("outsider:institutional-remedy-book:v1", book);
  const checked = verifyInstitutionalAiRemedyEvidence(book);
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.authorityBoundaryVerified, false);
});

test("full official document set replays exact remedy projection", { skip: !HAS_SOURCE }, () => {
  const built = buildInstitutionalAiRemedyEvidenceFromSource({ sourceDirectory: SOURCE });
  const checked = verifyInstitutionalAiRemedyEvidenceAgainstSource(built.book,
    { sourceDirectory: SOURCE });
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.legalMeaningIndependentlyReviewed, false);
  assert.equal(built.book.summary.sourceBytes, 23_294_396);
  assert.equal(built.book.cases[0].complaintAllegationsAdjudicatedOnMerits, false);
  assert.equal(built.book.cases[1].reportedRejectedApplicantsLowerBoundExclusive, 200);
});

test("same-size official source tamper fails full replay", { skip: !HAS_SOURCE }, () => {
  const temp = mkdtempSync(path.join(tmpdir(), "outsider-remedy-tamper-"));
  const copy = path.join(temp, "source");
  cpSync(SOURCE, copy, { recursive: true });
  const file = path.join(copy, "itutorgroup-eeoc-release.html");
  const bytes = readFileSync(file);
  bytes[bytes.length - 16] ^= 1;
  writeFileSync(file, bytes);
  const book = buildInstitutionalAiRemedyEvidenceProjection();
  const checked = verifyInstitutionalAiRemedyEvidenceAgainstSource(book,
    { sourceDirectory: copy });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_FILE_CHANGED_OR_MISMATCHED/);
});

test("CLI writes source-replayed HOLD artifact and refuses overwrite", { skip: !HAS_SOURCE }, () => {
  const temp = mkdtempSync(path.join(tmpdir(), "outsider-remedy-cli-"));
  const output = path.join(temp, "result");
  const args = ["scripts/reality-institutional-ai-remedies.mjs",
    "--source-dir", SOURCE, "--output-dir", output];
  const first = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  const receipt = JSON.parse(readFileSync(path.join(output, "run-receipt.json"), "utf8"));
  assert.equal(receipt.result.realEnvironmentEvidence, true);
  assert.equal(receipt.result.sourceArtifactsReverified, true);
  assert.equal(receipt.result.economicLossEvidenceEligible, false);
  assert.equal(receipt.result.PRICE, false);
  const second = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /OUTPUT_EXISTS_OR_TOO_BROAD/);
});
