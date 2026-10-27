#!/usr/bin/env node

import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync,
  openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildJudgmentFundGaoRealCasesFromSourceDirectory,
  verifyJudgmentFundGaoRealCasesEvidence,
  verifyJudgmentFundGaoRealCasesEvidenceWithSource,
} from "../src/outsider-judgment-fund-gao-real-cases.js";

const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `JUDGMENT_FUND_GAO_CLI_${code}`
    : `JUDGMENT_FUND_GAO_CLI_${code}:${detail}`);
}

function usage() {
  return [
    "Usage:",
    "  node scripts/judgment-fund-gao-real-cases.mjs build --source-dir <dir> --out <new.json> [--generated-at <canonical-ISO>]",
    "  node scripts/judgment-fund-gao-real-cases.mjs verify --artifact <artifact.json>",
    "  node scripts/judgment-fund-gao-real-cases.mjs verify-source --artifact <artifact.json> --source-dir <dir>",
    "",
    "Standalone verify is structure-only. verify-source replays every pinned official byte and exact-compares the rebuilt artifact.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--help")) {
    return { help: true };
  }
  const action = argv[0];
  if (!["build", "verify", "verify-source"].includes(action)) fail("ACTION_INVALID");
  const allowed = new Set(["--source-dir", "--out", "--artifact", "--generated-at"]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || typeof value !== "string" || value.length < 1
      || value.startsWith("--") || Object.hasOwn(values, flag)) fail("ARGUMENT_INVALID", flag);
    values[flag] = value;
  }
  if (action === "build") {
    if (!values["--source-dir"] || !values["--out"] || values["--artifact"]) {
      fail("BUILD_ARGUMENTS_INVALID");
    }
  } else if (action === "verify") {
    if (!values["--artifact"] || values["--source-dir"] || values["--out"]
      || values["--generated-at"]) fail("VERIFY_ARGUMENTS_INVALID");
  } else if (!values["--artifact"] || !values["--source-dir"] || values["--out"]
    || values["--generated-at"]) fail("VERIFY_SOURCE_ARGUMENTS_INVALID");
  return values;
}

function resolveBounded(value, code) {
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) fail(`${code}_TOO_BROAD`);
  return resolved;
}

function stableJsonRead(target) {
  const pathStat = lstatSync(target, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.size < 2n
    || pathStat.size > BigInt(MAX_ARTIFACT_BYTES)) fail("ARTIFACT_FILE_UNSAFE");
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (pathStat[field] !== before[field] || before[field] !== after[field]) {
        fail("ARTIFACT_FILE_CHANGED");
      }
    }
    if (bytes.includes(0)) fail("ARTIFACT_FILE_INVALID");
    return JSON.parse(bytes.toString("utf8"));
  } finally { closeSync(descriptor); }
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  if (options.action === "build") {
    const sourceDirectory = resolveBounded(options["--source-dir"], "SOURCE_DIRECTORY");
    const out = resolveBounded(options["--out"], "OUTPUT");
    const buildOptions = options["--generated-at"] === undefined ? {}
      : { generatedAt: options["--generated-at"] };
    const artifact = buildJudgmentFundGaoRealCasesFromSourceDirectory(sourceDirectory,
      buildOptions);
    mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
    const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    writeFileSync(out, bytes, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ok: true, out, artifactBytes: bytes.length,
      artifactHash: artifact.artifactHash,
      sourceObjectSetHash: artifact.sourceBinding.sourceObjectSetHash,
      acquisitionManifestSha256: artifact.sourceBinding.acquisitionManifestSha256,
      treasuryReportIntervals: artifact.treasuryJudgmentFund.snapshot.reportIntervals,
      treasuryPaymentComponentRows:
        artifact.treasuryJudgmentFund.totals.paymentComponentRows,
      treasuryTotalPublishedAmountCents:
        artifact.treasuryJudgmentFund.totals.amounts.totalPublishedAmountCents,
      gaoFiscalYear: artifact.gaoBidProtest.fiscalYear,
      gaoCasesFiled: artifact.gaoBidProtest.annualAggregate.casesFiled,
      authority: artifact.authority }, null, 2)}\n`);
  } else {
    const artifact = stableJsonRead(resolveBounded(options["--artifact"], "ARTIFACT"));
    const result = options.action === "verify"
      ? verifyJudgmentFundGaoRealCasesEvidence(artifact)
      : verifyJudgmentFundGaoRealCasesEvidenceWithSource(artifact,
        resolveBounded(options["--source-dir"], "SOURCE_DIRECTORY"));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
