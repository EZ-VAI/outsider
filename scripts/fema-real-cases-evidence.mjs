#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildFemaRealCasesEvidence,
  verifyFemaRealCasesEvidenceWithSource,
} from "../src/outsider-fema-real-cases-evidence.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/fema-real-cases-evidence.mjs build --source-dir <dir> --out <new-artifact.json> [--generated-at <canonical-ISO>]",
    "  node scripts/fema-real-cases-evidence.mjs verify --source-dir <dir> --artifact <artifact.json>",
    "",
    "Offline after acquisition. Full verification exact-rebuilds from the frozen official FEMA/CBCA bytes.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!new Set(["build", "verify"]).has(action)) {
    throw new Error("FEMA_REAL_CASES_CLI_ACTION_INVALID");
  }
  const allowed = new Set(["--source-dir", "--out", "--artifact", "--generated-at"]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--") || Object.hasOwn(values, key)) {
      throw new Error(`FEMA_REAL_CASES_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    values[key] = value;
  }
  if (!values["--source-dir"]) throw new Error("FEMA_REAL_CASES_CLI_SOURCE_DIR_REQUIRED");
  if (action === "build" && !values["--out"]) throw new Error("FEMA_REAL_CASES_CLI_OUT_REQUIRED");
  if (action === "verify" && !values["--artifact"]) {
    throw new Error("FEMA_REAL_CASES_CLI_ARTIFACT_REQUIRED");
  }
  if ((action === "build" && values["--artifact"])
    || (action === "verify" && (values["--out"] || values["--generated-at"]))) {
    throw new Error("FEMA_REAL_CASES_CLI_ARGUMENT_NOT_ALLOWED");
  }
  return values;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const sourceDirectory = resolved(options["--source-dir"], "FEMA_REAL_CASES_CLI_SOURCE_DIR");
  if (options.action === "build") {
    const buildOptions = options["--generated-at"]
      ? { generatedAt: options["--generated-at"] } : undefined;
    const artifact = buildFemaRealCasesEvidence(sourceDirectory, buildOptions);
    const out = resolved(options["--out"], "FEMA_REAL_CASES_CLI_OUT");
    mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
    writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      out,
      artifactHash: artifact.artifactHash,
      sourceRealityClass: artifact.source.sourceRealityClass,
      claimRecords: artifact.nfipClaims.scope.recordCount,
      netPaidDollars: artifact.nfipClaims.payments.netTotalPaymentDollars,
      currentResidentialContractsInForceNc:
        artifact.nfipResidentialExposure.northCarolina.contractsInForce,
      secondAppealRecords: artifact.publicAssistanceSecondAppeals.records,
      pinnedFemaDecisionBodies:
        artifact.publicAssistanceSecondAppeals.pinnedDecisionBodies.cases.length,
      cbcaIndexEntries: artifact.cbcaArbitration.officialFemaArbitrationIndexEntries,
      authority: artifact.authority,
    }, null, 2)}\n`);
  } else {
    const artifact = JSON.parse(readFileSync(resolved(options["--artifact"],
      "FEMA_REAL_CASES_CLI_ARTIFACT"), "utf8"));
    const result = verifyFemaRealCasesEvidenceWithSource(artifact, sourceDirectory);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
