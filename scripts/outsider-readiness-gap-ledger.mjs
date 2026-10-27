#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createReadinessGapLedger,
  verifyReadinessGapLedger,
} from "../src/outsider-readiness-gap-ledger.js";

function fail(code) { throw new Error(code); }

function options(argv) {
  const parsed = { submissions: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--as-of") parsed.asOf = argv[++index];
    else if (key === "--out") parsed.out = argv[++index];
    else if (key === "--submission") parsed.submissions.push(argv[++index]);
    else fail(`READINESS_CLI_UNKNOWN_OPTION:${key}`);
  }
  if ([parsed.asOf, parsed.out, ...parsed.submissions]
    .some((value) => value !== undefined && (typeof value !== "string" || value.length === 0))) {
    fail("READINESS_CLI_OPTION_VALUE_MISSING");
  }
  return parsed;
}

function loadSubmissions(files) {
  return files.flatMap((file) => {
    const value = JSON.parse(readFileSync(path.resolve(file), "utf8"));
    return Array.isArray(value) ? value : [value];
  });
}

try {
  const parsed = options(process.argv.slice(2));
  const ledger = createReadinessGapLedger({
    ...(parsed.asOf === undefined ? {} : { asOf: parsed.asOf }),
    externalSubmissions: loadSubmissions(parsed.submissions),
  });
  const verified = verifyReadinessGapLedger(ledger);
  if (!verified.ok) fail(`READINESS_CLI_VERIFY_FAILED:${verified.error}`);
  const rendered = `${JSON.stringify(ledger, null, 2)}\n`;
  if (parsed.out) writeFileSync(path.resolve(parsed.out), rendered, { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({
    ok: true,
    ledgerHash: ledger.ledgerHash,
    gaps: ledger.gaps.length,
    stages: ledger.stages.map((stage) => ({
      stage: stage.key,
      claimCeiling: stage.claimCeiling,
      openInternal: stage.byCategory.INTERNAL_ENGINEERING.openInternal,
      blockedExternalPlatformCapability:
        stage.byCategory.EXTERNAL_PLATFORM_CAPABILITY.blockedExternal,
      blockedExternalEvidence: stage.byCategory.EXTERNAL_EVIDENCE.blockedExternal,
      blockedExternalAuthority:
        stage.byCategory.EXTERNAL_INSTITUTION_AUTHORITY.blockedExternal,
    })),
    output: parsed.out ? path.resolve(parsed.out) : null,
  }, null, 2) + "\n");
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
