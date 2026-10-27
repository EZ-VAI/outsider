#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readFileSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildRemedyPaymentRecoveryEvidenceFromSource,
  verifyRemedyPaymentRecoveryEvidence,
  verifyRemedyPaymentRecoveryEvidenceAgainstSource,
} from "../src/outsider-remedy-payment-recovery-evidence.js";

const DEFAULT_SOURCE = "artifacts/remedy-payment-recovery-20260821/source";
const DEFAULT_OUTPUT = "artifacts/remedy-payment-recovery-20260821/evidence-book-final-v1";
const DEFAULT_TIME = "2026-08-21T12:00:00.000Z";

function fail(code) { throw new Error(`REMEDY_PAYMENT_RECOVERY_CLI_${code}`); }
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function parseBuildArgs(argv) {
  const values = { sourceDirectory: DEFAULT_SOURCE, outputDirectory: DEFAULT_OUTPUT,
    createdAt: DEFAULT_TIME };
  const allowed = new Map([["--source-dir", "sourceDirectory"],
    ["--output-dir", "outputDirectory"], ["--created-at", "createdAt"]]);
  if (argv.length % 2 !== 0) fail("ARGUMENT_INVALID");
  for (let index = 0; index < argv.length; index += 2) {
    const key = allowed.get(argv[index]);
    if (!key || typeof argv[index + 1] !== "string" || argv[index + 1].length < 1) {
      fail("ARGUMENT_INVALID");
    }
    values[key] = argv[index + 1];
  }
  return values;
}

function parseVerifyArgs(argv) {
  const values = { sourceDirectory: DEFAULT_SOURCE,
    bookFile: path.join(DEFAULT_OUTPUT, "book.json") };
  const allowed = new Map([["--source-dir", "sourceDirectory"], ["--book", "bookFile"]]);
  if (argv.length % 2 !== 0) fail("ARGUMENT_INVALID");
  for (let index = 0; index < argv.length; index += 2) {
    const key = allowed.get(argv[index]);
    if (!key || typeof argv[index + 1] !== "string" || argv[index + 1].length < 1) {
      fail("ARGUMENT_INVALID");
    }
    values[key] = argv[index + 1];
  }
  return values;
}

function readBoundedRegularFile(file, maximumBytes = 16 * 1024 * 1024) {
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 1n || before.size > BigInt(maximumBytes)) {
      fail("BOOK_FILE_INVALID");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      fail("BOOK_FILE_CHANGED");
    }
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function runVerify(argv) {
  const options = parseVerifyArgs(argv);
  const sourceDirectory = path.resolve(options.sourceDirectory);
  const bookFile = path.resolve(options.bookFile);
  let book;
  try { book = JSON.parse(readBoundedRegularFile(bookFile).toString("utf8")); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("REMEDY_PAYMENT_RECOVERY_CLI_")) {
      throw error;
    }
    fail("BOOK_JSON_INVALID");
  }
  const structural = verifyRemedyPaymentRecoveryEvidence(book);
  const sourceVerification = verifyRemedyPaymentRecoveryEvidenceAgainstSource(book,
    { sourceDirectory });
  if (!structural.ok || !structural.authorityBoundaryVerified
    || !sourceVerification.ok || !sourceVerification.sourceArtifactsReverified) {
    fail("VERIFICATION_FAILED");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, command: "verify", bookFile,
    bookHash: book.bookHash, sourceArtifactsReverified: true,
    sourceObjectSetHash: sourceVerification.sourceObjectSetHash,
    cpscCaseProjectionHash: sourceVerification.cpscCaseProjectionHash,
    authorityBoundaryVerified: true })}\n`);
}

function runBuild(argv) {
  const options = parseBuildArgs(argv);
  const sourceDirectory = path.resolve(options.sourceDirectory);
  const outputDirectory = path.resolve(options.outputDirectory);
  if (outputDirectory === path.parse(outputDirectory).root || existsSync(outputDirectory)) {
    fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  }
  const built = buildRemedyPaymentRecoveryEvidenceFromSource({
    sourceDirectory, createdAt: options.createdAt,
  });
  const structural = verifyRemedyPaymentRecoveryEvidence(built.book);
  const sourceVerification = verifyRemedyPaymentRecoveryEvidenceAgainstSource(built.book,
    { sourceDirectory });
  if (!structural.ok || !structural.authorityBoundaryVerified
    || !sourceVerification.ok || !sourceVerification.sourceArtifactsReverified) {
    fail("VERIFICATION_FAILED");
  }

  mkdirSync(path.dirname(outputDirectory), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(outputDirectory),
    `.${path.basename(outputDirectory)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const bookBytes = Buffer.from(`${JSON.stringify(built.book, null, 2)}\n`);
    const verificationBytes = Buffer.from(`${JSON.stringify(sourceVerification, null, 2)}\n`);
    writeFileSync(path.join(temporary, "book.json"), bookBytes, { flag: "wx", mode: 0o600 });
    writeFileSync(path.join(temporary, "verification.json"), verificationBytes,
      { flag: "wx", mode: 0o600 });
    const receipt = {
      schema: "outsider/remedy-payment-recovery-run-receipt/v1",
      createdAt: options.createdAt, bookHash: built.book.bookHash,
      sourceObjectSetHash: sourceVerification.sourceObjectSetHash,
      cpscCaseProjectionHash: sourceVerification.cpscCaseProjectionHash,
      files: {
        book: { path: "book.json", sizeBytes: bookBytes.length, sha256: sha256(bookBytes) },
        verification: { path: "verification.json", sizeBytes: verificationBytes.length,
          sha256: sha256(verificationBytes) },
      },
      result: {
        sourceArtifactsReverified: true,
        cfpbAllocationEvents: built.book.cfpb.civilPenaltyFund.summary.allocationEvents,
        cfpbInitiatedDistributionCases:
          built.book.cfpb.civilPenaltyFund.summary.initiatedCaseRows,
        cfpbConcludedDistributionCases:
          built.book.cfpb.civilPenaltyFund.summary.concludedCaseRows,
        ftcClosedRefundPrograms: built.book.ftc.closedProgramsSummary.caseRows,
        cpscMprCases: built.book.cpsc.summary.mprRows,
        cpscRecallApiRows: built.book.cpsc.summary.recallApiRows,
        allocationIsPayment: false, refundProgramIsCompleteRecovery: false,
        firmMprIsIndependentVerification: false,
        PRICE: false, GUARANTEE: false, SETTLE: false,
        CUSTODY: false, PAY: false, CLOSE: false, REOPEN: false,
      },
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    writeFileSync(path.join(temporary, "run-receipt.json"), receiptBytes,
      { flag: "wx", mode: 0o600 });
    renameSync(temporary, outputDirectory);
    process.stdout.write(`${JSON.stringify({ ok: true, command: "build", outputDirectory,
      bookHash: built.book.bookHash, receiptFileSha256: sha256(receiptBytes),
      result: receipt.result })}\n`);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

const argv = process.argv.slice(2);
if (argv[0] === "verify") runVerify(argv.slice(1));
else if (argv[0] === "build") runBuild(argv.slice(1));
else runBuild(argv);
