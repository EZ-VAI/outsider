/* Provider-neutral read model for the first controlled-failure payout demo.
 * It binds an immutable Outcome result to an immutable external Sandbox payout
 * command. It does not infer an actual failure, authorize payment, submit a
 * payout, or turn Sandbox balance into capital/coverage.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce } from "./outsider-user-held-durable-execution-v2.js";
import { createPayPalSandboxConnection } from "./outsider-paypal-sandbox-connection.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const PAYOUT_STATES = new Set(["PREPARED", "PROVIDER_TEST_ACCEPTED",
  "PROVIDER_TEST_PENDING", "PROVIDER_TEST_RECONCILIATION_REQUIRED",
  "PROVIDER_TEST_SUBMISSION_UNKNOWN", "PROVIDER_TEST_COMPLETED",
  "PROVIDER_TEST_FAILED", "PROVIDER_TEST_UNSUPPORTED"]);
const fail = code => { const error = new Error(`OUTSIDER_SANDBOX_LIABILITY_${code}`);
  error.code = code; throw error; };
const digest = value => `sha256:${createHash("sha256")
  .update(`outsider/sandbox-liability-status/v1\0${canonicalizeStrict(value)}`).digest("hex")}`;
const read = file => {
  if (!path.isAbsolute(file ?? "")) fail("ABSOLUTE_PRIVATE_PATH_REQUIRED");
  try { return JSON.parse(readPrivateExecutionBytes(file)); }
  catch { fail("PRIVATE_RECORD_REQUIRED"); }
};
const same = (left, right) => canonicalizeStrict(left) === canonicalizeStrict(right);

export function inspectSandboxLiabilityStatus({ resultFile, payoutRecordFile }) {
  const result = read(resultFile), payout = read(payoutRecordFile);
  return projectLiability(result, payout, false);
}

function projectLiability(result, payout, sourceReplayPerformed) {
  const rehearsal = result.failureRehearsal;
  const transfer = rehearsal?.sandboxTransfer;
  const operation = payout.operation;
  if (result.schema !== "outsider/private-digital-goal-mvp-result/v1"
    || result.delivery?.program?.state !== "SUCCEEDED"
    || result.actualOutcomeDecision?.decision !== "NO_SANDBOX_COMPENSATION"
    || rehearsal?.decision !== "SANDBOX_COMPENSATION_CALCULATED"
    || rehearsal?.rehearsal?.kind !== "CONTROLLED_FAILURE_REHEARSAL"
    || !HASH.test(result.sandboxContractDraft?.contractHash ?? "")
    || !HASH.test(transfer?.idempotencyKey ?? "")) fail("BOUND_REHEARSAL_REQUIRED");
  if (payout.schema !== "outsider/private-paypal-sandbox-payout-command/v1"
    || payout.mode !== "CONTROLLED_FAILURE_REHEARSAL_ONLY"
    || payout.programHash !== result.delivery.program.programHash
    || payout.actualCompensationDue !== null || payout.realMoneyMoved !== false
    || payout.commercialGuaranteeCreated !== false || operation?.environment !== "SANDBOX"
    || operation.sourceKind !== "PAYPAL_SANDBOX_API"
    || operation.transferIdempotencyKey !== transfer.idempotencyKey
    || !same(operation.amount, transfer.amount) || !PAYOUT_STATES.has(operation.status)
    || !HASH.test(operation.operationHash ?? "") || !HASH.test(operation.journalHeadHash ?? "")) {
    fail("PAYOUT_BINDING_INVALID");
  }
  const sourceReceipts = Array.isArray(operation.sources) ? operation.sources.map(source => {
    if (!source || !HASH.test(source.hash ?? "") || !Number.isSafeInteger(source.bytes)
      || source.bytes < 0 || !["POST", "GET"].includes(source.method)
      || !Number.isSafeInteger(source.httpStatus)) fail("PAYOUT_SOURCE_INVALID");
    return { method: source.method, httpStatus: source.httpStatus,
      bytes: source.bytes, sourceHash: source.hash };
  }) : fail("PAYOUT_SOURCES_REQUIRED");
  const body = {
    schema: "outsider/sandbox-liability-status/v1",
    programHash: result.delivery.program.programHash,
    contractHash: result.sandboxContractDraft.contractHash,
    actualOutcome: { state: "SUCCEEDED", failureEstablished: false,
      compensationDue: null, decision: "NO_SANDBOX_COMPENSATION" },
    controlledFailureRehearsal: { scenarioRefHash: rehearsal.rehearsal.scenarioRefHash,
      termRefHash: transfer.termRefHash, amount: transfer.amount,
      calculationOnly: true, actualFailureEstablished: false },
    payoutTransport: { provider: "PAYPAL", environment: "SANDBOX",
      operationId: operation.operationId, status: operation.status,
      providerItemStatus: operation.providerItemStatus ?? null,
      providerErrorCode: operation.providerErrorCode ?? null,
      externalReceiptObserved: operation.externalSandboxReceiptObserved === true,
      eventCount: operation.eventCount, journalHeadHash: operation.journalHeadHash,
      sourceReceipts },
    responsibilityState: operation.status === "PROVIDER_TEST_COMPLETED"
      ? "SANDBOX_REHEARSAL_SETTLED" : operation.status === "PROVIDER_TEST_FAILED"
        ? "SANDBOX_REHEARSAL_PROVIDER_FAILED" : "SANDBOX_REHEARSAL_OPEN",
    commercialGuaranteeCreated: false,
    actualCompensationDue: null,
    realMoneyMoved: false,
    providerReceiptIsIndependentOutcomeTruth: false,
    sourceReplayPerformed,
  };
  return Object.freeze({ ...body, statusHash: digest(body) });
}

/** Attach references to the existing session; frozen delivery is untouched.
 * Reads replay the original payout journal and every raw provider source.
 * Querying task status never performs OAuth or submits/reconciles a payment.
 */
export function attachSandboxLiability({ configFile, payoutRecordFile }) {
  const config = read(configFile), payout = read(payoutRecordFile), result = read(config.resultFile);
  const operation = createPayPalSandboxConnection({ directory: config.directory,
    credentialsFile: config.credentialsFile, testRecipientFile: config.testRecipientFile })
    .inspect(payout.operation?.operationId);
  const status = projectLiability(result, { ...payout, operation }, true);
  const binding = { schema: "outsider/session-sandbox-payout-binding/v1", configFile,
    configHash: digest(config), resultHash: digest(result), operationId: operation.operationId,
    programHash: payout.programHash, acceptanceRefHash: payout.acceptanceRefHash };
  writePrivateExecutionRecordOnce(path.join(path.dirname(config.resultFile), "sandbox-payout-binding.json"), binding);
  return status;
}

export function inspectAttachedSandboxLiability(resultFile) {
  const bindingFile = path.join(path.dirname(resultFile), "sandbox-payout-binding.json");
  if (!existsSync(bindingFile)) return null;
  const binding = read(bindingFile), config = read(binding.configFile), result = read(resultFile);
  if (binding.schema !== "outsider/session-sandbox-payout-binding/v1"
    || config.resultFile !== resultFile || binding.configHash !== digest(config)
    || binding.resultHash !== digest(result)) fail("ATTACHED_BINDING_CHANGED");
  const operation = createPayPalSandboxConnection({ directory: config.directory,
    credentialsFile: config.credentialsFile, testRecipientFile: config.testRecipientFile })
    .inspect(binding.operationId);
  return projectLiability(result, { schema: "outsider/private-paypal-sandbox-payout-command/v1",
    mode: "CONTROLLED_FAILURE_REHEARSAL_ONLY", programHash: binding.programHash,
    operation, actualCompensationDue: null, realMoneyMoved: false,
    commercialGuaranteeCreated: false }, true);
}
