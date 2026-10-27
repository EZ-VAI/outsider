#!/usr/bin/env node

import {
  closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync, readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildRealCaseGapEvidenceCatalog,
  verifyRealCaseGapEvidenceCatalog,
} from "../src/outsider-real-case-gap-evidence-catalog.js";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/real-case-gap-evidence-catalog.mjs build --out PATH [--as-of ISO]",
    "  node scripts/real-case-gap-evidence-catalog.mjs verify --artifact PATH",
    "",
    "This command emits or verifies the code-fixed 36-gap discovery catalog.",
    "It does not replay source datasets or grant target-specific authority.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!new Set(["build", "verify"]).has(action)) fail("REAL_CASE_GAP_CLI_ACTION_INVALID");
  const allowed = new Set(["--out", "--artifact", "--as-of"]);
  const options = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== "string" || value.length < 1
      || value.startsWith("--") || Object.hasOwn(options, key)) {
      fail("REAL_CASE_GAP_CLI_ARGUMENT_INVALID");
    }
    options[key] = value;
  }
  if (action === "build" && (!options["--out"] || options["--artifact"])) {
    fail("REAL_CASE_GAP_CLI_BUILD_ARGUMENTS_INVALID");
  }
  if (action === "verify" && (!options["--artifact"]
    || options["--out"] || options["--as-of"])) {
    fail("REAL_CASE_GAP_CLI_VERIFY_ARGUMENTS_INVALID");
  }
  return options;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) fail(`${code}_TOO_BROAD`);
  return target;
}

function stableReadJson(filePath) {
  const target = resolved(filePath, "REAL_CASE_GAP_CLI_ARTIFACT");
  const descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const value = JSON.parse(readFileSync(descriptor, "utf8"));
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs) {
      fail("REAL_CASE_GAP_CLI_ARTIFACT_CHANGED_DURING_READ");
    }
    if (typeof value.asOf !== "string"
      || BigInt(Date.parse(value.asOf)) * 1_000_000n > before.mtimeNs) {
      fail("REAL_CASE_GAP_CLI_AS_OF_AFTER_ARTIFACT_MTIME");
    }
    return value;
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusive(filePath, value) {
  const target = resolved(filePath, "REAL_CASE_GAP_CLI_OUTPUT");
  if (typeof value.asOf !== "string" || Date.parse(value.asOf) > Date.now()) {
    fail("REAL_CASE_GAP_CLI_AS_OF_AFTER_BUILD_START");
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const descriptor = openSync(target,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
    const published = fstatSync(descriptor, { bigint: true });
    if (BigInt(Date.parse(value.asOf)) * 1_000_000n > published.mtimeNs) {
      fail("REAL_CASE_GAP_CLI_AS_OF_AFTER_ARTIFACT_MTIME");
    }
  } finally {
    closeSync(descriptor);
  }
  return target;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
  } else if (options.action === "build") {
    const buildStartedAt = new Date().toISOString();
    const catalog = buildRealCaseGapEvidenceCatalog({
      asOf: options["--as-of"] ?? buildStartedAt,
    });
    const checked = verifyRealCaseGapEvidenceCatalog(catalog);
    if (!checked.ok) fail("REAL_CASE_GAP_CLI_BUILD_VERIFY_FAILED");
    const output = writeExclusive(options["--out"], catalog);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      action: "build",
      output,
      buildStartedAt,
      artifactAsOf: catalog.asOf,
      artifactAsOfNoLaterThanBuildStart:
        Date.parse(catalog.asOf) <= Date.parse(buildStartedAt),
      catalogHash: catalog.catalogHash,
      sources: catalog.counts.sources,
      gaps: catalog.counts.gaps,
      verificationLevel: checked.verificationLevel,
      sourceArtifactsReverified: false,
      webCompletenessEstablished: false,
    })}\n`);
  } else {
    const checked = verifyRealCaseGapEvidenceCatalog(stableReadJson(options["--artifact"]));
    process.stdout.write(`${JSON.stringify({ action: "verify", ...checked })}\n`);
    if (!checked.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
