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
  buildRemedyPaymentRecoveryEvidenceFromSource,
  buildRemedyPaymentRecoveryEvidenceProjection,
  extractXlsxEntry,
  resolveWorkbookWorksheetMember,
  verifyRemedyPaymentRecoveryEvidence,
  verifyRemedyPaymentRecoveryEvidenceAgainstSource,
} from "../src/outsider-remedy-payment-recovery-evidence.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "artifacts/remedy-payment-recovery-20260821/source");
const HAS_SOURCE = existsSync(SOURCE);

function domainHash(domain, value) {
  return `sha256:${createHash("sha256").update(
    `${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

test("fixed official tables preserve real payment experience without authority transfer", () => {
  const book = buildRemedyPaymentRecoveryEvidenceProjection();
  const checked = verifyRemedyPaymentRecoveryEvidence(book);
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(book.evidenceInterpretation.publicDataRemainRealCasesAndRealInstitutionalExperience,
    true);
  assert.equal(book.evidenceInterpretation.publicOriginAutomaticallyDowngradesEvidence, false);
  assert.equal(book.evidenceInterpretation.outsiderCollectionAutomaticallyUpgradesEvidence, false);
  assert.equal(book.sourceManifest.pdfTablesMachineParsed, false);
  assert.equal(book.cfpb.civilPenaltyFund.summary.allocationEvents, 8);
  assert.equal(book.cfpb.civilPenaltyFund.summary.allocatedUsdCents, 26_077_480_300);
  assert.equal(book.cfpb.civilPenaltyFund.summary.initiatedDistributedUsdCents,
    206_005_493_700);
  assert.equal(book.cfpb.civilPenaltyFund.summary.concludedDistributedUsdCents,
    3_580_507_600);
  assert.ok(book.cfpb.civilPenaltyFund.allocations.every((event) => (
    event.allocationMeansFundsSetAside === true
      && event.recipientReceiptEstablishedByAllocation === false
  )));
  assert.equal(book.ftc.closedProgramsSummary.caseRows, 25);
  assert.equal(book.ftc.closedProgramsSummary.returnedToConsumersUsdCents, 14_833_747_249);
  assert.equal(book.ftc.closedProgramsSummary.consumersSentPayment, 1_770_214);
  assert.equal(book.ftc.closedProgramsSummary.consumersCashedAtLeastOnePayment, 1_162_743);
  assert.ok(book.ftc.closedPrograms.every((event) => (
    event.publisherProgramClosureObserved === true
      && event.fullIndividualRecoveryEstablished === false
  )));
  assert.equal(book.authority.PRICE, false);
  assert.equal(book.authority.CUSTODY, false);
  assert.equal(book.authority.SETTLE, false);
  assert.equal(book.authority.CLOSE, false);
});

test("caller reseal cannot promote payment, custody, settlement, or closure authority", () => {
  const book = structuredClone(buildRemedyPaymentRecoveryEvidenceProjection());
  book.authority.PRICE = true;
  book.authority.CUSTODY = true;
  book.authority.SETTLE = true;
  book.authority.CLOSE = true;
  const { bookHash: ignored, ...body } = book;
  book.bookHash = domainHash("outsider:remedy-payment-recovery-book:v1", body);
  const checked = verifyRemedyPaymentRecoveryEvidence(book);
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.authorityBoundaryVerified, false);
});

test("full pinned sources reproduce correlated CPSC remedy progress", { skip: !HAS_SOURCE }, () => {
  const built = buildRemedyPaymentRecoveryEvidenceFromSource({ sourceDirectory: SOURCE });
  const checked = verifyRemedyPaymentRecoveryEvidenceAgainstSource(built.book,
    { sourceDirectory: SOURCE });
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.pdfByteIdentityReverified, true);
  assert.equal(checked.pdfTableValuesMachineReparsed, false);
  assert.equal(built.book.cpsc.summary.mprRows, 38);
  assert.equal(built.book.cpsc.summary.recallApiRows, 1_492);
  assert.equal(built.book.cpsc.summary.correlatedCases, 38);
  assert.equal(built.book.cpsc.summary.exactRecallDateAgreementCases, 38);
  assert.equal(built.book.cpsc.summary.normalizedTitleAgreementCases, 38);
  assert.equal(built.book.cpsc.summary.exactTitleAgreementCases, 35);
  assert.equal(built.book.cpsc.summary.recallApiRowsWithPublisherUrlAnomaly, 2);
  assert.equal(built.book.cpsc.summary.correlatedCasesWithCanonicalCpscHttpsUrl, 38);
  assert.equal(built.book.cpsc.summary.rowsWithRecalledUnits, 35);
  assert.equal(built.book.cpsc.summary.rowsWithCompleteCorrectionComponents, 17);
  assert.equal(built.book.cpsc.summary.arithmeticAgreementCases, 17);
  assert.equal(built.book.cpsc.summary.rowsWithAnyMissingCoreMprField, 21);
  assert.ok(built.book.cpsc.cases.every((record) => (
    record.qualityBoundary.realRecallAndRemedyProgressCase === true
      && record.qualityBoundary.mprSubmittedByRecallingFirm === true
      && record.qualityBoundary.mprCorrectionsIndependentlyVerifiedByOutsider === false
      && record.missingness.blankMeansZero === false
  )));
  assert.ok(built.book.cpsc.cases.some((record) => record.mpr.recalledUnits === null));
  assert.equal(built.book.qualityBoundary.fullRecoveryRateEligible, false);
});

test("XLSX central directory extraction authenticates CRC and visible sheet", {
  skip: !HAS_SOURCE,
}, () => {
  const bytes = readFileSync(path.join(SOURCE, "cpsc-mpr-20260713.xlsx"));
  const workbook = extractXlsxEntry(bytes, "xl/workbook.xml");
  const relationships = extractXlsxEntry(bytes, "xl/_rels/workbook.xml.rels");
  const binding = resolveWorkbookWorksheetMember(workbook, relationships, "MPR");
  const visible = extractXlsxEntry(bytes, binding.member).toString("utf8");
  assert.deepEqual(binding, {
    sheetName: "MPR", relationshipId: "rId1", member: "xl/worksheets/sheet1.xml",
  });
  assert.match(visible, /<dimension ref="A1:N41"\/>/);
});

test("workbook sheet binding follows r:id instead of a fixed sheet filename", () => {
  const workbook = Buffer.from(`<?xml version="1.0"?><workbook><sheets>
    <sheet sheetId="3" r:id="rId9" name="Archive" state="hidden"/>
    <sheet sheetId="7" name="MPR" r:id="rId2"/>
  </sheets></workbook>`);
  const relationships = Buffer.from(`<?xml version="1.0"?><Relationships>
    <Relationship Target="worksheets/sheet9.xml" Type="x/relationships/worksheet" Id="rId9"/>
    <Relationship Id="rId2" Type="x/relationships/worksheet" Target="worksheets/live-sheet.xml"/>
  </Relationships>`);
  assert.deepEqual(resolveWorkbookWorksheetMember(workbook, relationships, "MPR"), {
    sheetName: "MPR", relationshipId: "rId2", member: "xl/worksheets/live-sheet.xml",
  });
  const external = Buffer.from(`<?xml version="1.0"?><Relationships>
    <Relationship Id="rId2" Type="x/relationships/worksheet"
      Target="https://example.invalid/sheet.xml" TargetMode="External"/>
  </Relationships>`);
  assert.throws(() => resolveWorkbookWorksheetMember(workbook, external, "MPR"),
    /WORKBOOK_RELATIONSHIP_TARGET_INVALID/);
});

test("same-size official source substitution fails exact replay", { skip: !HAS_SOURCE }, () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-remedy-payment-tamper-"));
  const copy = path.join(temporary, "source");
  cpSync(SOURCE, copy, { recursive: true });
  const file = path.join(copy, "cfpb-fy2025-cpf-bar.pdf");
  const bytes = readFileSync(file);
  bytes[bytes.length - 32] ^= 1;
  writeFileSync(file, bytes);
  const book = buildRemedyPaymentRecoveryEvidenceFromSource({ sourceDirectory: SOURCE }).book;
  const checked = verifyRemedyPaymentRecoveryEvidenceAgainstSource(book,
    { sourceDirectory: copy });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_FILE_CHANGED_OR_MISMATCHED/);
});

test("CLI writes source-replayed HOLD artifact and refuses overwrite", { skip: !HAS_SOURCE }, () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-remedy-payment-cli-"));
  const output = path.join(temporary, "result");
  const args = ["scripts/remedy-payment-recovery-evidence.mjs",
    "--source-dir", SOURCE, "--output-dir", output];
  const first = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  const receipt = JSON.parse(readFileSync(path.join(output, "run-receipt.json"), "utf8"));
  assert.equal(receipt.result.sourceArtifactsReverified, true);
  assert.equal(receipt.result.cfpbAllocationEvents, 8);
  assert.equal(receipt.result.ftcClosedRefundPrograms, 25);
  assert.equal(receipt.result.cpscMprCases, 38);
  assert.equal(receipt.result.allocationIsPayment, false);
  assert.equal(receipt.result.refundProgramIsCompleteRecovery, false);
  assert.equal(receipt.result.firmMprIsIndependentVerification, false);
  assert.equal(receipt.result.CUSTODY, false);
  assert.equal(receipt.result.SETTLE, false);
  assert.equal(receipt.result.CLOSE, false);
  const verify = spawnSync(process.execPath,
    ["scripts/remedy-payment-recovery-evidence.mjs", "verify",
      "--source-dir", SOURCE, "--book", path.join(output, "book.json")],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  const verified = JSON.parse(verify.stdout);
  assert.equal(verified.command, "verify");
  assert.equal(verified.sourceArtifactsReverified, true);
  assert.equal(verified.authorityBoundaryVerified, true);
  const tamperedFile = path.join(temporary, "tampered-book.json");
  const tampered = JSON.parse(readFileSync(path.join(output, "book.json"), "utf8"));
  tampered.authority.CUSTODY = true;
  writeFileSync(tamperedFile, `${JSON.stringify(tampered)}\n`);
  const rejected = spawnSync(process.execPath,
    ["scripts/remedy-payment-recovery-evidence.mjs", "verify",
      "--source-dir", SOURCE, "--book", tamperedFile],
    { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /VERIFICATION_FAILED/);
  const second = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /OUTPUT_EXISTS_OR_TOO_BROAD/);
});
