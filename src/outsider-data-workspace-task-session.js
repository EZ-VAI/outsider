import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";
import { executeDataWorkspaceTask } from "./outsider-data-workspace-task-runtime.js";
const digest = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { const error = new Error(code); error.code = `DATA_TASK_${code}`; throw error; };

export function createDataWorkspaceTaskSession({ directory, input, registration, dependencies = {} }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const lock = operation => withUserHeldExecutionLockV2(digest({ directory, kind: "DATA_TASK_SESSION_V1" }), operation);
  const source = { registrationHash: digest(registration), inputHash: digest(input) };
  writePrivateExecutionRecordOnce(file("family-binding"), source);
  const request = read(input.productionInput.requestFile);
  if (digest(request) !== registration.requestHash) fail("REQUEST_BINDING_CHANGED");
  function inspect() {
    const p = existsSync(file("preparation")) ? read(file("preparation")) : null;
    const c = existsSync(file("confirmation")) ? read(file("confirmation")) : null;
    const started = existsSync(file("execution-started"));
    const result = existsSync(file("result")) ? read(file("result")) : null;
    if (p) {
      const { preparationHash, ...body } = p;
      if (preparationHash !== digest(body) || p.registrationHash !== source.registrationHash
        || p.program.programHash !== digest(p.program.body)) fail("PREPARATION_CHANGED");
    }
    if (c && (!p || c.preparationHash !== p.preparationHash || c.programHash !== p.program.programHash)) fail("CONFIRMATION_CHANGED");
    return { schema: "outsider/data-workspace-task-status/v1", taskFamily: registration.taskFamily,
      state: result?.state ?? (started ? "RUNNING" : c ? "CONFIRMED" : p ? "PROPOSED" : "NEW"),
      confirmed: Boolean(c), executionStarted: started, terminal: Boolean(result),
      preparationHash: p?.preparationHash ?? null, programHash: p?.program.programHash ?? null,
      proposal: p ? { outcome: { statement: "Create three synthetic records, back up across GitHub, restore a fresh database, independently observe its live read endpoint, and clean up all task resources.",
        budget: { currency: "USD", maximumAmountMinor: "0" }, recordCount: 3, recordsHash: digest(p.records),
        acceptance: [
          { criterionId: "restored_records_hash", comparator: "EQ", subject: "restored records", expected: digest(p.records) },
          { criterionId: "external_live_read", comparator: "EQ", subject: "independent external observation", expected: true },
          { criterionId: "temporary_resources_released", comparator: "EQ", subject: "task resource cleanup", expected: true },
        ] },
        formationDeadline: p.program.formationDeadline,
        completionDeadline: request.completionDeadline,
        resourceRoles: [
          { requirementId: "data_workspace_primary", role: "PRIMARY", capability: "D1_SYNTHETIC_THREE_RECORD_WORKSPACE" },
          { requirementId: "data_workspace_recovery", role: "RECOVERY", capability: "GITHUB_SNAPSHOT_TO_FRESH_D1_RESTORE" },
          { requirementId: "data_workspace_witness", role: "INDEPENDENT_WITNESS", capability: "EXACT_PUBLIC_RESPONSE_OBSERVATION" },
        ],
        confirmationRequired: true,
        commercialGuaranteeCreated: false, reservedRecoveryCapacityEstablished: false } : null,
      actualDelivery: result, paymentAuthorized: false, realMoneyMoved: false, commercialGuaranteeCreated: false };
  }
  return Object.freeze({ inspect, status: inspect,
    prepare: () => lock(async () => {
      if (!existsSync(file("preparation"))) {
        const profile = registration.profile;
        if (Date.parse(request.completionDeadline) >= Date.parse(profile.zeroCostScope.expiresAt)
          || Date.parse(clock()) >= Date.parse(request.completionDeadline)) fail("DEADLINE_OUTSIDE_DATA_SCOPE");
        const body = { taskFamily: registration.taskFamily, requestId: request.requestId,
          recordsHash: digest(registration.records), profileHash: digest(profile),
          createdAt: clock(), completionDeadline: request.completionDeadline };
        const programHash = digest(body);
        const program = { body, programHash, programId: `data_${programHash.slice(7, 39)}`,
          formationDeadline: new Date(Math.min(Date.parse(clock()) + 300000,
            Date.parse(request.completionDeadline) - 1000)).toISOString(),
          completionDeadline: request.completionDeadline, obligations: [] };
        const p = { schema: "outsider/data-workspace-task-preparation/v1", registrationHash: source.registrationHash,
          records: registration.records, profile, program, preparedAt: clock() };
        writePrivateExecutionRecordOnce(file("preparation"), { ...p, preparationHash: digest(p) });
      }
      return inspect();
    }),
    confirm: hashes => lock(async () => {
      const status = inspect();
      if (!status.preparationHash || !hashes || Object.keys(hashes).sort().join(",") !== "preparationHash,programHash"
        || hashes.preparationHash !== status.preparationHash || hashes.programHash !== status.programHash) fail("CONFIRMATION_HASH_MISMATCH");
      if (!existsSync(file("confirmation"))) writePrivateExecutionRecordOnce(file("confirmation"), {
        ...hashes, confirmedAt: clock(), paymentAuthorized: false });
      return inspect();
    }),
    runConfirmed: () => lock(async () => {
      const status = inspect(); if (!status.confirmed) fail("CONFIRMATION_REQUIRED");
      if (status.terminal) return status;
      if (!status.executionStarted) writePrivateExecutionRecordOnce(file("execution-started"), {
        preparationHash: status.preparationHash, programHash: status.programHash, startedAt: clock() });
      const result = await (dependencies.executeDataTask ?? executeDataWorkspaceTask)({
        directory: input.productionInput.runtimeDirectory, preparation: read(file("preparation")) }, dependencies);
      if (result.state !== "SUCCEEDED" || result.cleanupComplete !== true) fail("EXECUTION_NOT_COMPLETE");
      writePrivateExecutionRecordOnce(file("result"), result); return inspect();
    }),
  });
}
