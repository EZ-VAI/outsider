import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync, lstatSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildNtsbBlsOutcomeEvidenceFromBytes,
  buildNtsbBlsOutcomeEvidenceFromSourceDirectory,
  NTSB_BLS_FROZEN_SOURCE_20260821,
  verifyNtsbBlsOutcomeEvidence,
  verifyNtsbBlsOutcomeEvidenceWithSource,
} from "../src/outsider-ntsb-bls-outcome-evidence.js";

const officialSource = path.resolve("artifacts/ntsb-bls-real-outcome-20260821/source");
const officialArtifactPath = path.resolve(
  "artifacts/ntsb-bls-real-outcome-20260821/final-v2/outcome-evidence.json");
const hardeningArtifactPath = path.resolve(
  "artifacts/ntsb-bls-real-outcome-20260828/final-v2-canonical-hardening/outcome-evidence.json");
const supersededArtifactPath = path.resolve(
  "artifacts/ntsb-bls-real-outcome-20260821/final-v1/outcome-evidence.json");
const supersessionMarkerPath = path.resolve(
  "artifacts/ntsb-bls-real-outcome-20260821/final-v1/SUPERSEDED.json");

function fixture() {
  return Object.fromEntries(NTSB_BLS_FROZEN_SOURCE_20260821.files
    .map((file) => [file.name, Buffer.from(`fixture:${file.name}`)]));
}
function officialBytes() {
  return Object.fromEntries(NTSB_BLS_FROZEN_SOURCE_20260821.files
    .map((file) => [file.name, readFileSync(path.join(officialSource, file.name))]));
}
function reseal(artifact) {
  const { artifactHash: _old, ...withoutHash } = artifact;
  return { ...withoutHash, artifactHash: `sha256:${createHash("sha256")
    .update(canonicalizeStrict(withoutHash)).digest("hex")}` };
}

test("NTSB/BLS frozen source has exact lane and document accounting", () => {
  const files = NTSB_BLS_FROZEN_SOURCE_20260821.files;
  assert.equal(files.length, 38);
  assert.equal(new Set(files.map((file) => file.name)).size, 38);
  assert.equal(files.filter((file) => file.lane === "NTSB").length, 24);
  assert.equal(files.filter((file) => file.lane === "BLS").length, 14);
  assert.equal(files.filter((file) => file.kind === "ADOPTED_FINAL_REPORT").length, 5);
  assert.equal(files.filter((file) => file.kind === "SELECTED_FACTUAL_REPORT").length, 6);
  assert.equal(files.filter((file) => file.name.endsWith(".pdf")).length, 11);
  assert.ok(files.every((file) => file.bytes > 0 && /^sha256:[a-f0-9]{64}$/u.test(file.sha256)));
});

test("generic source-shaped bytes cannot inherit official reality, rights, or authority", () => {
  const artifact = buildNtsbBlsOutcomeEvidenceFromBytes(fixture());
  assert.equal(artifact.source.profileMatchedAtBuild, false);
  assert.equal(artifact.source.sourceReality, "UNATTESTED_FIXTURE_BYTES");
  assert.equal(artifact.lanes.ntsb.cases.length, 0);
  assert.equal(artifact.lanes.bls.soii, null);
  assert.equal(artifact.admission.realNtsbCasesRecognized, false);
  assert.equal(artifact.admission.realBlsExperienceRecognized, false);
  assert.equal(artifact.rights.officialPublicAccessObserved, false);
  assert.equal(artifact.authority.PRICE, false);
  assert.throws(() => buildNtsbBlsOutcomeEvidenceFromBytes(fixture(), { official: true }),
    /BUILD_ARGUMENTS_INVALID/u);
});

test("standalone verifier is structure-only and never establishes source admission", () => {
  const artifact = buildNtsbBlsOutcomeEvidenceFromBytes(fixture());
  const forgedProfile = reseal({ ...artifact,
    source: { ...artifact.source, profileMatchedAtBuild: true,
      sourceReality: "REAL_OFFICIAL_CASE_AND_OCCUPATIONAL_EXPERIENCE",
      publishers: ["NATIONAL_TRANSPORTATION_SAFETY_BOARD", "UNITED_STATES_BUREAU_OF_LABOR_STATISTICS"] },
    rights: { ...artifact.rights, officialPublicAccessObserved: true },
    admission: { ...artifact.admission, realNtsbCasesRecognized: true,
      realBlsExperienceRecognized: true, sourceDomainDescriptiveUseOnly: true } });
  const checked = verifyNtsbBlsOutcomeEvidence(forgedProfile);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "STRUCTURE_ONLY");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.realCaseOrExperienceAdmissionEstablished, false);
  assert.equal(checked.decision, null);
});

test("standalone verifier rejects authority and rights escalation even when resealed", () => {
  const artifact = buildNtsbBlsOutcomeEvidenceFromBytes(fixture());
  const authority = reseal({ ...artifact, authority: { ...artifact.authority, PRICE: true } });
  assert.equal(verifyNtsbBlsOutcomeEvidence(authority).ok, false);
  const rights = reseal({ ...artifact, rights: { ...artifact.rights, modelTrainingRightConcluded: true } });
  assert.equal(verifyNtsbBlsOutcomeEvidence(rights).ok, false);
});

test("official NTSB cases preserve finality, docket, typo, and legal-use boundaries",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildNtsbBlsOutcomeEvidenceFromSourceDirectory(officialSource);
    const lane = artifact.lanes.ntsb;
    assert.equal(lane.cases.length, 6);
    assert.equal(lane.sourceAccounting.finalReportFiles, 5);
    assert.equal(lane.sourceAccounting.docketDocumentLinks, 199);
    assert.equal(lane.sourceAccounting.allElevenPdfsByteCompleteAndFullyParsed, true);
    assert.equal(lane.multiRootBinding.officialDefectsQuarantined.length, 2);
    assert.equal(lane.multiRootBinding.officialDefectsQuarantined[0].labelUsedAsIdentifier, false);
    assert.equal(lane.multiRootBinding.officialDefectsQuarantined[1].footerUsedAsSoleIdentifierRoot, false);
    assert.equal(lane.findingBoundary.assignsFaultOrBlame, false);
    assert.equal(lane.findingBoundary.determinesRightsOrLiabilities, false);
    assert.equal(lane.findingBoundary.civilDamagesEvidenceUseRestrictedBy49USC1154b, true);
    assert.equal(lane.inferenceBoundary.causalGeneralizationBeyondInvestigatedCases, false);
  });

test("official BLS experience preserves RSE, suppression, exposure, and classification boundaries",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildNtsbBlsOutcomeEvidenceFromSourceDirectory(officialSource);
    const { soii, cfoi, oiics } = artifact.lanes.bls;
    assert.equal(soii.tables[0].dataRowCount, 1070);
    assert.equal(soii.tables[0].suppression.enDash, 228);
    assert.equal(soii.tables[4].suppression.singleHyphen, 14);
    assert.equal(soii.crossTableCorrelation.repeatedRowsPreservedNotDeduplicated, 23);
    assert.equal(soii.privateIndustryPublished.totalRecordableRatePer100Fte, 2.3);
    assert.equal(soii.privateIndustryPublished.employeeHoursThousands, 213077936);
    assert.equal(soii.uncertainty.rseMeasuresAllError, false);
    assert.equal(cfoi.publishedCounts.allFatalOccupationalInjuries, 5070);
    assert.equal(cfoi.publishedRates.total.fatalInjuryRatePer100000Fte, 3.3);
    assert.equal(cfoi.denominator.displayedTotalFatalInjuryCountIsBeforeThoseRateExclusions, true);
    assert.equal(cfoi.denominator.dividePublished5070ByPublishedTotalHoursToRecalculateRatePermitted, false);
    assert.equal(cfoi.denominator.publicationThreshold.minimumReportedFatalWorkInjuries, 5);
    assert.equal(cfoi.uncertainty.marginOfErrorMeasuresFatalCountVariation, false);
    assert.equal(oiics.version, "3.03");
    assert.equal(oiics.revisionBoundary.referenceYear2023WasSeriesBreakFromPriorYears, true);
    assert.equal(oiics.revisionBoundary.crossSeriesPoolingWithoutVersionHandlingPermitted, false);
  });

test("CFOI dense-cell commitments replay exact original bytes without mutating the source",
  { skip: !existsSync(officialSource) }, () => {
    const before = Object.fromEntries(NTSB_BLS_FROZEN_SOURCE_20260821.files.map((file) => {
      const bytes = readFileSync(path.join(officialSource, file.name));
      return [file.name, `sha256:${createHash("sha256").update(bytes).digest("hex")}`];
    }));
    const artifact = buildNtsbBlsOutcomeEvidenceFromSourceDirectory(officialSource);
    assert.deepEqual(artifact.lanes.bls.cfoi.tables.map((table) => table.worksheetHash), [
      "sha256:d40162112b885bc47e366ee663dfaf5df9092478f3f907ede9c37ee10068e395",
      "sha256:36ebedb8e53ab75caceda34523041c3eb25cfafc30b0d01501a6856aad3a3182",
      "sha256:6765dd5d3896f3ac4f6b28d15c2aaa82ea8e99fa1d0a13066b1e7df968c5ab1b",
      "sha256:18ae44784f343240be063a9bebdde124ab37324142f1c5efe957e6c9f881b9d8",
      "sha256:40239e4df96818a3b04f3a207bef0ea043ba987da29edbab62891a31fe24d1f9",
    ]);
    const after = Object.fromEntries(NTSB_BLS_FROZEN_SOURCE_20260821.files.map((file) => {
      const bytes = readFileSync(path.join(officialSource, file.name));
      return [file.name, `sha256:${createHash("sha256").update(bytes).digest("hex")}`];
    }));
    assert.deepEqual(after, before);
    assert.ok(NTSB_BLS_FROZEN_SOURCE_20260821.files
      .every((file) => before[file.name] === file.sha256));
  });

test("passing exact official bytes through generic builder still does not self-attest",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildNtsbBlsOutcomeEvidenceFromBytes(officialBytes());
    assert.equal(artifact.source.callerBytesMatchedFrozenPins, true);
    assert.equal(artifact.source.profileMatchedAtBuild, false);
    assert.equal(artifact.admission.realNtsbCasesRecognized, false);
    const checked = verifyNtsbBlsOutcomeEvidenceWithSource(artifact, officialSource);
    assert.equal(checked.ok, false);
    assert.equal(checked.verificationLevel, "FULL_SOURCE_REPLAY_FAILED");
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.sourceTruthEstablished, false);
    assert.equal(checked.publisherAuthorityEstablished, false);
    assert.equal(checked.candidateArtifactExactlyRebuilt, false);
    assert.equal(checked.realCaseOrExperienceAdmissionEstablished, false);
  });

test("resealed official-looking derivation mismatch never inherits replay or truth claims",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildNtsbBlsOutcomeEvidenceFromSourceDirectory(officialSource);
    const attacked = reseal({ ...artifact, progress: { ...artifact.progress,
      causalModel: "ATTACKER_ASSERTED_CAUSAL_MODEL" } });
    assert.equal(verifyNtsbBlsOutcomeEvidence(attacked).ok, true);
    const checked = verifyNtsbBlsOutcomeEvidenceWithSource(attacked, officialSource);
    assert.equal(checked.ok, false);
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.sourceTruthEstablished, false);
    assert.equal(checked.publisherAuthorityEstablished, false);
    assert.equal(checked.officialSourceProfileReproduced, true);
    assert.equal(checked.publisherRecordStatusReproduced, true);
    assert.equal(checked.candidateArtifactExactlyRebuilt, false);
    assert.equal(checked.realCaseOrExperienceAdmissionEstablished, false);
  });

test("source directory rejects extra members and symlinked members", () => {
  const extra = mkdtempSync(path.join(tmpdir(), "outsider-ntsb-bls-extra-"));
  writeFileSync(path.join(extra, "unexpected"), "x");
  assert.throws(() => buildNtsbBlsOutcomeEvidenceFromSourceDirectory(extra),
    /SOURCE_DIRECTORY_PROFILE_MISMATCH/u);

  const linked = mkdtempSync(path.join(tmpdir(), "outsider-ntsb-bls-link-"));
  for (const file of NTSB_BLS_FROZEN_SOURCE_20260821.files) {
    writeFileSync(path.join(linked, file.name), "x");
  }
  writeFileSync(path.join(linked, "acquisition.json"), "x");
  const first = NTSB_BLS_FROZEN_SOURCE_20260821.files[0].name;
  const firstPath = path.join(linked, first);
  const target = path.join(linked, NTSB_BLS_FROZEN_SOURCE_20260821.files[1].name);
  // Replace only the first inspected member; later fixture members are never trusted or parsed.
  unlinkSync(firstPath);
  symlinkSync(target, firstPath);
  assert.throws(() => buildNtsbBlsOutcomeEvidenceFromSourceDirectory(linked), /SOURCE_FILE_UNSAFE/u);
});

test("truncated formerly observed HIR2602 shape is rejected before admission",
  { skip: !existsSync(officialSource) }, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-ntsb-bls-truncated-"));
    for (const file of NTSB_BLS_FROZEN_SOURCE_20260821.files) {
      const source = readFileSync(path.join(officialSource, file.name));
      writeFileSync(path.join(directory, file.name), file.name === "HIR2602.pdf"
        ? source.subarray(0, 5_100_000) : source);
    }
    writeFileSync(path.join(directory, "acquisition.json"), readFileSync(path.join(officialSource, "acquisition.json")));
    assert.throws(() => buildNtsbBlsOutcomeEvidenceFromSourceDirectory(directory),
      /SOURCE_PIN_MISMATCH:HIR2602\.pdf/u);
  });

test("canonical artifact performs full exact source replay",
  { skip: !(existsSync(officialSource) && existsSync(officialArtifactPath)) }, () => {
    const serialized = readFileSync(officialArtifactPath);
    const artifact = JSON.parse(serialized.toString("utf8"));
    const checked = verifyNtsbBlsOutcomeEvidenceWithSource(artifact, officialSource);
    assert.equal(checked.ok, true);
    assert.equal(checked.verificationLevel, "FULL_OFFICIAL_NTSB_BLS_SOURCE_REPLAYED");
    assert.equal(checked.sourceArtifactsReverified, true);
    assert.equal(checked.sourceTruthEstablished, false);
    assert.equal(checked.publisherAuthorityEstablished, false);
    assert.equal(checked.officialSourceProfileReproduced, true);
    assert.equal(checked.candidateArtifactExactlyRebuilt, true);
    assert.equal(checked.realCaseOrExperienceAdmissionEstablished, true);
    assert.equal(checked.artifactHash, artifact.artifactHash);
    assert.equal(artifact.artifactHash,
      "sha256:da933b03d6ed8c3c56cc80561373f03bb2060b93adce45995eb88f13c8ff4792");
    assert.equal(`sha256:${createHash("sha256").update(serialized).digest("hex")}`,
      "sha256:1b1b57250becd399ef0a698d7273275fe0f21e8b99bf7b9d5a15597835f399af");
  });

test("superseded NTSB/BLS final-v1 bytes remain preserved", {
  skip: !existsSync(supersededArtifactPath),
}, () => {
  const bytes = readFileSync(supersededArtifactPath);
  assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    "sha256:18f4a8d461f0cc49e24f415b76c107a6086187b9a6419532c153ae71dc533c55");
});

test("standard final-v2 equals the hardening replay and exact v1 marker routes only to it", {
  skip: !(existsSync(officialArtifactPath) && existsSync(hardeningArtifactPath)
    && existsSync(supersessionMarkerPath)),
}, () => {
  const canonicalBytes = readFileSync(officialArtifactPath);
  const hardeningBytes = readFileSync(hardeningArtifactPath);
  assert.deepEqual(canonicalBytes, hardeningBytes);
  assert.equal(canonicalBytes.length, 46469);
  assert.equal(`sha256:${createHash("sha256").update(canonicalBytes).digest("hex")}`,
    "sha256:1b1b57250becd399ef0a698d7273275fe0f21e8b99bf7b9d5a15597835f399af");
  const markerBytes = readFileSync(supersessionMarkerPath);
  const marker = JSON.parse(markerBytes.toString("utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  assert.equal(marker.supersededArtifactHash,
    "sha256:a49deae0ee325ce1cbc725ef32143181c824ab10d2826da9b4b139d6e92145f9");
  assert.equal(marker.currentArtifactHash,
    "sha256:da933b03d6ed8c3c56cc80561373f03bb2060b93adce45995eb88f13c8ff4792");
  assert.equal(marker.currentCanonicalPath,
    "artifacts/ntsb-bls-real-outcome-20260821/final-v2/outcome-evidence.json");
  assert.equal(marker.sourceArtifactsReverifiedByMarker, false);
  assert.equal(marker.sourceTruthEstablishedByMarker, false);
  assert.equal(marker.trainingAdmission, false);
  assert.equal(marker.pricingAdmission, false);
  assert.equal(marker.operationalAuthorityGranted, false);
  assert.equal(Number(lstatSync(supersessionMarkerPath).mode & 0o777), 0o600);
});

test("NTSB/BLS CLIs expose acquisition help and structure verification",
  { skip: !existsSync(officialArtifactPath) }, () => {
    const help = spawnSync(process.execPath, ["scripts/acquire-ntsb-bls-outcome-evidence.mjs", "--help"],
      { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--ntsb-dir/u);
    assert.match(help.stdout, /--bls-dir/u);
    const verified = spawnSync(process.execPath, ["scripts/ntsb-bls-outcome-evidence.mjs", "verify",
      "--artifact", officialArtifactPath], { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(verified.status, 0, verified.stderr);
    const result = JSON.parse(verified.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.verificationLevel, "STRUCTURE_ONLY");
    assert.equal(result.realCaseOrExperienceAdmissionEstablished, false);
  });
