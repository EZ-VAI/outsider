import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync,
  unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildJudgmentFundGaoRealCasesFromSourceDirectory,
  createJudgmentFundGaoAcquisitionManifest,
  inspectGenericJudgmentFundWorkbookShape,
  JUDGMENT_FUND_GAO_SOURCE_PINS,
  serializeJudgmentFundGaoAcquisitionManifest,
  verifyJudgmentFundGaoRealCasesEvidence,
  verifyJudgmentFundGaoRealCasesEvidenceWithSource,
} from "../src/outsider-judgment-fund-gao-real-cases.js";

const SOURCE = path.resolve("artifacts/judgment-fund-gao-real-cases-20260821/source");
const HAS_SOURCE = existsSync(path.join(SOURCE, "acquisition.json"));
const DOMAIN = "outsider:judgment-fund-gao-real-cases:v1";
const WORKBOOK = "payment-report-01-01-26-thru-01-15-26.xlsx";
const ZIP_TOOLS = spawnSync("unzip", ["-v"], { encoding: "utf8" }).status === 0
  && spawnSync("zip", ["-v"], { encoding: "utf8" }).status === 0;

function reseal(artifact) {
  const { artifactHash: _old, ...body } = artifact;
  return { ...body, artifactHash: `sha256:${createHash("sha256")
    .update(`${DOMAIN}\0${canonicalizeStrict(body)}`).digest("hex")}` };
}

function mutateWorkbook(member, mutate) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-jf-xlsx-"));
  const unpacked = path.join(directory, "unpacked");
  const archive = path.join(directory, "mutated.xlsx");
  mkdirSync(unpacked);
  const extracted = spawnSync("unzip", ["-qq", path.join(SOURCE, WORKBOOK), "-d", unpacked], {
    encoding: "utf8",
  });
  assert.equal(extracted.status, 0, extracted.stderr);
  const target = path.join(unpacked, member);
  const before = readFileSync(target, "utf8");
  const after = mutate(before);
  assert.notEqual(after, before);
  writeFileSync(target, after);
  const zipped = spawnSync("zip", ["-q", "-X", "-r", archive, "."], {
    cwd: unpacked, encoding: "utf8",
  });
  assert.equal(zipped.status, 0, zipped.stderr);
  return readFileSync(archive);
}

test("Judgment Fund and GAO official source profile freezes exact bounded reality", () => {
  const manifest = createJudgmentFundGaoAcquisitionManifest();
  assert.equal(JUDGMENT_FUND_GAO_SOURCE_PINS.length, 31);
  assert.equal(manifest.sourceCount, 31);
  assert.equal(manifest.sourceBytes, 4_703_400);
  assert.equal(manifest.reportCoverage.intervalCount, 14);
  assert.equal(manifest.reportCoverage.contiguousWithoutGapOrOverlap, true);
  assert.equal(manifest.reportCoverage.augustFirstHalfReportPublishedByFreeze, false);
  assert.equal(manifest.independentRedownloadByteStabilityEstablishedObjectCount, 14);
  assert.equal(manifest.independentRedownloadByteStabilityNotEstablishedObjectCount, 17);
  assert.equal(JUDGMENT_FUND_GAO_SOURCE_PINS.filter((pin) =>
    pin.independentRedownloadByteStabilityEstablishedAtFreeze).length, 14);
  assert.equal(serializeJudgmentFundGaoAcquisitionManifest().length, 14_960);
  assert.equal(`sha256:${createHash("sha256")
    .update(serializeJudgmentFundGaoAcquisitionManifest()).digest("hex")}`,
  "sha256:59db45ff6ef406ad2be7151082333d917353cc1920b59085b28c6370fc5acab8");
  for (const pin of JUDGMENT_FUND_GAO_SOURCE_PINS) {
    assert.equal(new URL(pin.url).protocol, "https:");
    assert.ok(new Set(["fiscal.treasury.gov", "tfx.treasury.gov", "www.gao.gov"])
      .has(new URL(pin.url).hostname));
    assert.match(pin.sha256, /^sha256:[a-f0-9]{64}$/u);
  }
  assert.equal(JUDGMENT_FUND_GAO_SOURCE_PINS.some((pin) => pin.path === "form-196.pdf"),
    false, "stale URL redirects to HTML and must not be mislabeled as PDF");
});

test("source replay preserves payment components and GAO FY2025 aggregate without overclaiming", {
  skip: !HAS_SOURCE,
}, () => {
  const artifact = buildJudgmentFundGaoRealCasesFromSourceDirectory(SOURCE);
  assert.equal(artifact.artifactHash,
    "sha256:e10699896cd8e7de3ca420f4f7092d4871324110a0a299e8cd9c07f19263109e");
  assert.equal(artifact.sourceBinding.sourceObjectSetHash,
    "sha256:0073a8cf314aeadda25d281aa1d89db6ac00b5214093fcbb50069f29c8d81fe5");
  assert.equal(artifact.sourceBinding.acquisitionManifestSha256,
    "sha256:59db45ff6ef406ad2be7151082333d917353cc1920b59085b28c6370fc5acab8");
  assert.deepEqual(artifact.treasuryJudgmentFund.reports.map((report) =>
    report.paymentComponentRows),
  [496, 383, 4_117, 586, 2_704, 488, 524, 658, 691, 540, 630, 1_080, 1_972,
    1_285]);
  assert.deepEqual(artifact.treasuryJudgmentFund.totals, {
    paymentComponentRows: 16_154,
    zeroTotalPublishedAmountRows: 10_966,
    rowsOutsideWorkbookFilter: 2_487,
    rawNumericCellsWithMoreThanTwoDecimalPlaces: 214,
    exactFullRawRowsRepeatedOccurrencesWithinReports: 10_927,
    amounts: { currency: "USD", principalAmountCents: 314_631_622_284,
      attorneyFeesAmountCents: 1_283_791_346, costAmountCents: 81_217_399,
      interestAmountCents: 1_496_435_705,
      totalPublishedAmountCents: 317_493_066_734 },
  });
  assert.equal(artifact.treasuryJudgmentFund.responsibleAgencyAggregates.length, 93);
  assert.equal(artifact.treasuryJudgmentFund.submittingAgencyAggregates.length, 49);
  assert.equal(artifact.treasuryJudgmentFund.principalCitationAggregates.length, 52);
  assert.equal(artifact.treasuryJudgmentFund.amountAndUnitBoundary
    .paymentComponentRowCountIsClaimCount, false);
  assert.equal(artifact.treasuryJudgmentFund.certificationCustodyAndDisbursementBoundary
    .certificationIsDisbursement, false);
  assert.equal(artifact.treasuryJudgmentFund.certificationCustodyAndDisbursementBoundary
    .disbursementIsRecipientRecoveryOrAcceptance, false);
  assert.ok(artifact.treasuryJudgmentFund.reports.every((report) =>
    report.formulaCellCount === 0 && report.formulaCachedValueUsed === false
      && report.unsupportedTypedCellCount === 0));

  assert.deepEqual(artifact.gaoBidProtest.annualAggregate, {
    casesFiled: 1_688, protestsFiled: 1_617, costClaimsFiled: 24,
    reconsiderationRequestsFiled: 47, casesClosed: 1_737,
    protestsClosed: 1_676, costClaimsClosed: 20,
    reconsiderationRequestsClosed: 41, taskOrderCasesClosed: 359,
    meritDecisions: 380, sustains: 53,
    recomputedSustainRatePercent: 53 / 380 * 100,
    publisherRoundedSustainRatePercent: 14,
    publisherEffectivenessRatePercent: 52,
    adrCasesUsed: 53, publisherRoundedAdrSuccessRatePercent: 91,
    hearings: 3, publisherRoundedHearingsPercentOfFullyDevelopedCases: 0.5,
    finalDecisionsOverOneHundredDays: 0,
    agencyNonimplementationInstancesReported: 1,
  });
  assert.equal(artifact.gaoBidProtest.denominatorAndOutcomeBoundary
    .publicDecisionCorpusCompleteForAllClosures, false);
  assert.equal(artifact.gaoBidProtest.adjudicationAndConsequenceBoundary
    .gaoIsArticleThreeJudiciary, false);
  assert.equal(artifact.gaoBidProtest.adjudicationAndConsequenceBoundary
    .recommendationEqualsImplementation, false);
  assert.equal(artifact.gaoBidProtest.decisionSample.included, false);
  assert.deepEqual(verifyJudgmentFundGaoRealCasesEvidence(artifact), {
    ok: true,
    verificationLevel: "STRUCTURE_ONLY_SELF_SEALED_NO_SOURCE_TRUTH",
    artifactHashVerified: true,
    sourceArtifactsReverified: false,
    publisherIdentityReverified: false,
    realityStatusReverified: false,
    rightsReverified: false,
    authorityBoundaryVerified: true,
    authorityEstablished: false,
  });
  const full = verifyJudgmentFundGaoRealCasesEvidenceWithSource(artifact, SOURCE);
  assert.equal(full.ok, true);
  assert.equal(full.verificationLevel,
    "FULL_PINNED_TREASURY_GAO_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE");
  assert.equal(full.sourceArtifactsReverified, true);
  assert.equal(full.formulaCachesUsed, false);
  assert.equal(full.authorityEstablished, false);
});

test("derived artifact removes raw claimant, counsel, facts, and linkable fingerprints", {
  skip: !HAS_SOURCE,
}, () => {
  const artifact = buildJudgmentFundGaoRealCasesFromSourceDirectory(SOURCE);
  const serialized = JSON.stringify(artifact);
  // Keep raw-source names out of the tracked test and npm package as well as the artifact.
  // Exact schemas below ensure there is no projected field in which those values can survive.
  for (const forbidden of ["Name of Plaintiff or Claimant", "*Claimant Name",
    "*Claimant Counsel", "Brief Description of Facts that give Rise to the Claim"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(artifact.treasuryJudgmentFund.privacyProjection
    .claimantCounselOrRawRowFingerprintsPersistedInArtifact, false);
  assert.equal(artifact.treasuryJudgmentFund.privacyProjection
    .deterministicPseudonymousCaseLinksCreated, false);
});

test("generic workbook shape cannot inherit Treasury, reality, rights, or authority", {
  skip: !HAS_SOURCE,
}, () => {
  const generic = inspectGenericJudgmentFundWorkbookShape(readFileSync(path.join(SOURCE,
    WORKBOOK)));
  assert.equal(generic.workbookShapeParsed, true);
  assert.equal(generic.paymentLikeRows, 496);
  for (const field of ["publisherIdentityEstablished", "officialSourceByteIdentityEstablished",
    "realPaymentStatusEstablished", "finalityEstablished", "rightsEstablished",
    "trainingPermissionEstablished", "outsiderAuthorityEstablished"]) {
    assert.equal(generic[field], false, field);
  }
});

test("standalone fixed schema rejects resealed unknown keys, source substitution, and authority", {
  skip: !HAS_SOURCE,
}, () => {
  const artifact = buildJudgmentFundGaoRealCasesFromSourceDirectory(SOURCE);
  const attacks = [];
  const top = structuredClone(artifact);
  top.unknown = true;
  attacks.push(reseal(top));
  const nested = structuredClone(artifact);
  nested.treasuryJudgmentFund.amountAndUnitBoundary.unknown = false;
  attacks.push(reseal(nested));
  const source = structuredClone(artifact);
  source.sourceBinding.sourceObjects[0].url = "https://example.invalid/substitution.xlsx";
  attacks.push(reseal(source));
  const authority = structuredClone(artifact);
  authority.authority.PRICE = true;
  attacks.push(reseal(authority));
  const gao = structuredClone(artifact);
  gao.gaoBidProtest.adjudicationAndConsequenceBoundary.gaoIsArticleThreeJudiciary = true;
  attacks.push(reseal(gao));
  for (const attack of attacks) {
    const result = verifyJudgmentFundGaoRealCasesEvidence(attack);
    assert.equal(result.ok, false);
    assert.equal(result.sourceArtifactsReverified, false);
    assert.equal(result.authorityEstablished, false);
  }
});

test("source-aware replay rejects byte mutation, extra file, file symlink, and directory symlink", {
  skip: !HAS_SOURCE,
}, () => {
  const artifact = buildJudgmentFundGaoRealCasesFromSourceDirectory(SOURCE);
  const mutated = mkdtempSync(path.join(tmpdir(), "outsider-jf-mutated-"));
  cpSync(SOURCE, mutated, { recursive: true });
  const target = path.join(mutated, WORKBOOK);
  const bytes = readFileSync(target);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(target, bytes);
  assert.equal(verifyJudgmentFundGaoRealCasesEvidenceWithSource(artifact, mutated).ok, false);

  const extra = mkdtempSync(path.join(tmpdir(), "outsider-jf-extra-"));
  cpSync(SOURCE, extra, { recursive: true });
  writeFileSync(path.join(extra, "untrusted.json"), "{}\n");
  assert.throws(() => buildJudgmentFundGaoRealCasesFromSourceDirectory(extra),
    /SOURCE_FILE_SET_INVALID/);

  const linkedFile = mkdtempSync(path.join(tmpdir(), "outsider-jf-file-link-"));
  cpSync(SOURCE, linkedFile, { recursive: true });
  unlinkSync(path.join(linkedFile, WORKBOOK));
  symlinkSync(path.join(SOURCE, WORKBOOK), path.join(linkedFile, WORKBOOK));
  assert.throws(() => buildJudgmentFundGaoRealCasesFromSourceDirectory(linkedFile),
    /SOURCE_FILE_UNSAFE/);

  const linkedDirectoryParent = mkdtempSync(path.join(tmpdir(), "outsider-jf-dir-link-"));
  const linkedDirectory = path.join(linkedDirectoryParent, "source-link");
  symlinkSync(SOURCE, linkedDirectory);
  assert.throws(() => buildJudgmentFundGaoRealCasesFromSourceDirectory(linkedDirectory),
    /SOURCE_DIRECTORY_UNSAFE/);
});

test("workbook parser rejects formula caches, unsupported types, and relationship substitution", {
  skip: !HAS_SOURCE || !ZIP_TOOLS,
}, () => {
  const formula = mutateWorkbook("xl/worksheets/sheet1.xml", (xml) =>
    xml.replace(/(<c r="E6"[^>]*>)(<v>)/u, "$1<f>1+1</f>$2"));
  assert.throws(() => inspectGenericJudgmentFundWorkbookShape(formula),
    /FORMULA_CELL_PROHIBITED/);

  const type = mutateWorkbook("xl/worksheets/sheet1.xml", (xml) =>
    xml.replace('<c r="E6"', '<c r="E6" t="str"'));
  assert.throws(() => inspectGenericJudgmentFundWorkbookShape(type),
    /CELL_TYPE_UNSUPPORTED/);

  const relationship = mutateWorkbook("xl/_rels/workbook.xml.rels", (xml) =>
    xml.replace('Target="worksheets/sheet1.xml"',
      'Target="https://example.invalid/sheet.xml" TargetMode="External"'));
  assert.throws(() => inspectGenericJudgmentFundWorkbookShape(relationship),
    /WORKBOOK_SHEET_RELATIONSHIP_INVALID/);
});

test("builder rejects caller trust overrides and noncanonical generation time", {
  skip: !HAS_SOURCE,
}, () => {
  for (const options of [{ official: true }, { rights: true }, { generatedAt:
    "2026-08-21T12:30:00.000Z", sourceId: "caller" }]) {
    assert.throws(() => buildJudgmentFundGaoRealCasesFromSourceDirectory(SOURCE, options),
      /BUILD_OPTIONS_INVALID/);
  }
  assert.throws(() => buildJudgmentFundGaoRealCasesFromSourceDirectory(SOURCE, {
    generatedAt: "2026-08-21 12:30:00Z",
  }), /TIME_NON_CANONICAL/);
});

test("acquirer imports only the complete exact pinned staging set", { skip: !HAS_SOURCE }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-jf-acquire-"));
  const out = path.join(directory, "source");
  const script = path.resolve("scripts/acquire-judgment-fund-gao-real-cases.mjs");
  const acquired = spawnSync(process.execPath, [script, "--out-dir", out,
    "--staging-dir", SOURCE], { encoding: "utf8" });
  assert.equal(acquired.status, 0, acquired.stderr);
  const receipt = JSON.parse(acquired.stdout);
  assert.equal(receipt.sourceCount, 31);
  assert.equal(receipt.sourceBytes, 4_703_400);
  assert.equal(receipt.acquisitionManifestSha256,
    "sha256:59db45ff6ef406ad2be7151082333d917353cc1920b59085b28c6370fc5acab8");
  assert.equal(buildJudgmentFundGaoRealCasesFromSourceDirectory(out).artifactHash,
    "sha256:e10699896cd8e7de3ca420f4f7092d4871324110a0a299e8cd9c07f19263109e");
  writeFileSync(path.join(out, "caller-override.json"), "{}\n");
  const extra = spawnSync(process.execPath, [script, "--out-dir", out,
    "--staging-dir", SOURCE], { encoding: "utf8" });
  assert.notEqual(extra.status, 0);
  assert.match(extra.stderr, /OUT_DIRECTORY_EXTRA_FILE/u);
});

test("CLI builds once and separates standalone from source-aware verification", {
  skip: !HAS_SOURCE,
}, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-jf-cli-"));
  const out = path.join(directory, "evidence.json");
  const script = path.resolve("scripts/judgment-fund-gao-real-cases.mjs");
  const built = spawnSync(process.execPath, [script, "build", "--source-dir", SOURCE,
    "--out", out], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(JSON.parse(built.stdout).artifactHash,
    "sha256:e10699896cd8e7de3ca420f4f7092d4871324110a0a299e8cd9c07f19263109e");
  const standalone = spawnSync(process.execPath, [script, "verify", "--artifact", out], {
    encoding: "utf8",
  });
  assert.equal(standalone.status, 0, standalone.stderr);
  assert.equal(JSON.parse(standalone.stdout).publisherIdentityReverified, false);
  const full = spawnSync(process.execPath, [script, "verify-source", "--artifact", out,
    "--source-dir", SOURCE], { encoding: "utf8" });
  assert.equal(full.status, 0, full.stderr);
  assert.equal(JSON.parse(full.stdout).sourceArtifactsReverified, true);
  const overwrite = spawnSync(process.execPath, [script, "build", "--source-dir", SOURCE,
    "--out", out], { encoding: "utf8" });
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /EEXIST/u);
  const linked = path.join(directory, "artifact-link.json");
  symlinkSync(out, linked);
  const linkedVerify = spawnSync(process.execPath, [script, "verify", "--artifact", linked], {
    encoding: "utf8",
  });
  assert.notEqual(linkedVerify.status, 0);
  assert.match(linkedVerify.stderr, /ARTIFACT_FILE_UNSAFE/u);
});
