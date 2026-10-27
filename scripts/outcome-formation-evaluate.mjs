#!/usr/bin/env node

import { canonicalizeStrict } from "../src/canonical.js";
import {
  evaluateOutcomeFormationOfflineDiagnosticV1,
  outcomeFormationOfflineDiagnosticFailureV1,
} from "../src/outsider-outcome-formation-offline-diagnostic-v1.js";

let result;
let exitCode = 0;
try {
  if (process.argv.length !== 3) throw new TypeError("INPUT_REJECTED");
  result = evaluateOutcomeFormationOfflineDiagnosticV1(process.argv[2]);
} catch {
  result = outcomeFormationOfflineDiagnosticFailureV1();
  exitCode = 1;
}

process.stdout.write(`${canonicalizeStrict(result)}\n`);
process.exitCode = exitCode;
