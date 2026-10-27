#!/usr/bin/env node
/* User-facing read model over delivery + responsibility transport. Provider
 * credentials and raw receipts remain in private storage and never reach stdout.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspectSandboxLiabilityStatus, attachSandboxLiability }
  from "../src/outsider-sandbox-liability-status.js";

const fail = code => { const error = new Error(code); error.code = code; throw error; };
export function runResponsibilityCli(argv) {
  const [command, resultFlag, resultFile, payoutFlag, payoutRecordFile] = argv;
  if (command === "attach-sandbox" && resultFlag === "--config" && payoutFlag === "--payout"
    && argv.length === 5 && path.isAbsolute(resultFile ?? "") && path.isAbsolute(payoutRecordFile ?? ""))
    return attachSandboxLiability({ configFile: resultFile, payoutRecordFile });
  if (command !== "status-sandbox" || resultFlag !== "--result"
    || payoutFlag !== "--payout" || argv.length !== 5
    || !path.isAbsolute(resultFile ?? "") || !path.isAbsolute(payoutRecordFile ?? "")) {
    fail("RESPONSIBILITY_ARGUMENT_INVALID");
  }
  return inspectSandboxLiabilityStatus({ resultFile, payoutRecordFile });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(runResponsibilityCli(process.argv.slice(2)))}\n`); }
  catch (error) { process.stderr.write(`${error?.code ?? "RESPONSIBILITY_COMMAND_FAILED"}\n`); process.exitCode = 1; }
}
