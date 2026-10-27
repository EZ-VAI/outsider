#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildInstitutionalAiRemedyEvidenceFromSource,
  verifyInstitutionalAiRemedyEvidence,
  verifyInstitutionalAiRemedyEvidenceAgainstSource,
} from "../src/outsider-institutional-ai-remedy-evidence.js";

const DEFAULT_SOURCE = "artifacts/reality-institutional-ai-remedies-20260821/source";
const DEFAULT_OUTPUT = "artifacts/reality-institutional-ai-remedies-20260821/evidence-book-final-v3";
const DEFAULT_TIME = "2026-08-21T12:00:00.000Z";

function fail(code) { throw new Error(`INSTITUTIONAL_AI_REMEDY_CLI_${code}`); }
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function parseArgs(argv) {
  const values = { sourceDirectory: DEFAULT_SOURCE, outputDirectory: DEFAULT_OUTPUT,
    createdAt: DEFAULT_TIME };
  const allowed = new Map([["--source-dir", "sourceDirectory"],
    ["--output-dir", "outputDirectory"], ["--created-at", "createdAt"]]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = allowed.get(argv[index]);
    if (!key || typeof argv[index + 1] !== "string" || argv[index + 1].length < 1) {
      fail("ARGUMENT_INVALID");
    }
    values[key] = argv[index + 1];
  }
  return values;
}

const options = parseArgs(process.argv.slice(2));
const sourceDirectory = path.resolve(options.sourceDirectory);
const outputDirectory = path.resolve(options.outputDirectory);
if (outputDirectory === path.parse(outputDirectory).root || existsSync(outputDirectory)) {
  fail("OUTPUT_EXISTS_OR_TOO_BROAD");
}
const built = buildInstitutionalAiRemedyEvidenceFromSource({
  sourceDirectory, createdAt: options.createdAt,
});
const structural = verifyInstitutionalAiRemedyEvidence(built.book);
const sourceVerification = verifyInstitutionalAiRemedyEvidenceAgainstSource(built.book,
  { sourceDirectory });
if (!structural.ok || structural.authorityBoundaryVerified !== true
  || sourceVerification.ok !== true || sourceVerification.sourceArtifactsReverified !== true) {
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
    schema: "outsider/institutional-ai-remedy-run-receipt/v1",
    createdAt: options.createdAt,
    bookHash: built.book.bookHash,
    sourceObjectSetHash: sourceVerification.sourceObjectSetHash,
    files: {
      book: { path: "book.json", sizeBytes: bookBytes.length, sha256: sha256(bookBytes) },
      verification: { path: "verification.json", sizeBytes: verificationBytes.length,
        sha256: sha256(verificationBytes) },
    },
    result: {
      cases: built.book.summary.cases,
      obligations: built.book.summary.obligations,
      monitoringDocuments: built.book.summary.monitoringDocuments,
      realEnvironmentEvidence: true,
      sourceArtifactsReverified: true,
      economicLossEvidenceEligible: false,
      incidentFrequencyEligible: false,
      PRICE: false, GUARANTEE: false, SETTLE: false,
      permitsExecution: false, permitsClosure: false,
    },
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(path.join(temporary, "run-receipt.json"), receiptBytes,
    { flag: "wx", mode: 0o600 });
  renameSync(temporary, outputDirectory);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory,
    bookHash: built.book.bookHash, receiptFileSha256: sha256(receiptBytes),
    summary: built.book.summary })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
