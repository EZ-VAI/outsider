/* One-command bridge from an existing frozen failure rehearsal to the existing
 * sandbox transport. No account creation, live endpoint, timers or new ledger.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { createPayPalSandboxConnection } from "../src/outsider-paypal-sandbox-connection.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce }
  from "../src/outsider-user-held-durable-execution-v2.js";

const fail = code => {
  const error = new TypeError(`OUTSIDER_PAYPAL_SANDBOX_COMMAND_${code}`);
  error.code = code;
  throw error;
};
const read = file => JSON.parse(readPrivateExecutionBytes(file).toString("utf8"));
export async function runPayPalSandboxPayoutCli(argv, dependencies = {}) {
  const [stage, configFile, flag, outputFile, operationId] = argv;
  if (!["prepare", "submit", "reconcile", "inspect", "run"].includes(stage)
    || !path.isAbsolute(configFile ?? "") || flag !== "--output"
    || !path.isAbsolute(outputFile ?? "")
    || (["prepare", "run"].includes(stage) ? argv.length !== 4 : argv.length !== 5)) fail("ARGUMENTS_INVALID");
  if (existsSync(outputFile)) fail("OUTPUT_EXISTS");
  const config = read(configFile);
  const fields = ["directory", "credentialsFile", "testRecipientFile", "resultFile", "authorizationFile"];
  if (!config || typeof config !== "object" || Object.keys(config).length !== fields.length
    || fields.some(key => !path.isAbsolute(config[key] ?? ""))) fail("CONFIG_PATHS_INVALID");
  const result = read(config.resultFile);
  const transfer = result.failureRehearsal?.sandboxTransfer;
  if (result.schema !== "outsider/private-digital-goal-mvp-result/v1"
    || result.delivery?.program?.state !== "SUCCEEDED"
    || result.actualOutcomeDecision?.decision !== "NO_SANDBOX_COMPENSATION"
    || result.failureRehearsal?.rehearsal?.kind !== "CONTROLLED_FAILURE_REHEARSAL"
    || result.failureRehearsal?.decision !== "SANDBOX_COMPENSATION_CALCULATED"
    || !transfer) fail("FROZEN_CONTROLLED_FAILURE_REHEARSAL_REQUIRED");
  const authorization = read(config.authorizationFile);
  const recipient = read(config.testRecipientFile);
  if (authorization.transferIdempotencyKey !== transfer.idempotencyKey
    || authorization.testAccountRefHash !== recipient.testRecipient?.testAccountRefHash
    || canonicalizeStrict(authorization.amount) !== canonicalizeStrict(transfer.amount)) {
    fail("EXACT_TRANSFER_RECIPIENT_AMOUNT_ACCEPTANCE_REQUIRED");
  }
  const connectionFactory = dependencies.createConnection ?? createPayPalSandboxConnection;
  if (typeof connectionFactory !== "function") fail("CONNECTION_FACTORY_INVALID");
  const adapter = connectionFactory({ directory: config.directory,
    credentialsFile: config.credentialsFile, testRecipientFile: config.testRecipientFile });
  const prepared = adapter.prepare({ sandboxTransfer: transfer,
    sandboxAcceptance: authorization.sandboxAcceptance });
  if (!["prepare", "run"].includes(stage) && operationId !== prepared.operationId) fail("OPERATION_ID_MISMATCH");
  let operation;
  if (stage === "run") {
    operation = await adapter.submit(prepared.operationId);
    const sleep = dependencies.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const attempts = dependencies.maximumReconciliations ?? 6;
    if (typeof sleep !== "function" || !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 20)
      fail("RUN_POLICY_INVALID");
    for (let index = 0; index < attempts
      && !["PROVIDER_TEST_COMPLETED", "PROVIDER_TEST_FAILED", "PROVIDER_TEST_UNSUPPORTED"].includes(operation.status)
      && operation.payoutBatchId; index += 1) {
      if (index > 0) await sleep(1000);
      operation = await adapter.reconcile(prepared.operationId);
    }
  } else {
    operation = stage === "prepare" ? prepared : stage === "inspect"
      ? adapter.inspect(operationId) : await adapter[stage](operationId);
  }
  const record = { schema: "outsider/private-paypal-sandbox-payout-command/v1", stage,
    recordedAt: new Date().toISOString(), mode: "CONTROLLED_FAILURE_REHEARSAL_ONLY",
    programHash: result.delivery.program.programHash,
    acceptanceRefHash: authorization.sandboxAcceptance.acceptanceRefHash,
    operation, actualCompensationDue: null, realMoneyMoved: false, commercialGuaranteeCreated: false };
  writePrivateExecutionRecordOnce(outputFile, record);
  return { stage, operationId: operation.operationId, status: operation.status,
    externalSandboxReceiptObserved: operation.externalSandboxReceiptObserved,
    realMoneyMoved: false, outputFile };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await runPayPalSandboxPayoutCli(process.argv.slice(2)))}\n`); }
  catch (error) {
    // No credential-bearing config values, remote bodies or causes reach stdout/stderr.
    const code = error?.code ?? error?.outsiderCode;
    process.stderr.write(`${typeof code === "string" && /^[A-Z0-9_]+$/u.test(code) ? code : "PAYPAL_SANDBOX_COMMAND_FAILED"}\n`);
    process.exitCode = 1;
  }
}
