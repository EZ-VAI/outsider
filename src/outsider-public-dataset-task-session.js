import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { normalizePublicDataset, publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { normalizeDatasetDeliveryInput, discoverNativeServiceNetwork } from "./outsider-native-service-network.js";
import { compilePublicDatasetDelivery, createPublicDatasetDeliveryRuntime, PUBLIC_DATASET_DELIVERY_FAMILY }
  from "./outsider-public-dataset-delivery.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));

export function createPublicDatasetTaskExtension(profileFile) {
  const profile = read(profileFile);
  if (profile.schema !== "outsider/public-dataset-delivery-profile/v1" || profile.zeroCostScope?.confirmed !== true
    || !Number.isSafeInteger(profile.retentionMs) || profile.retentionMs < 60_000 || profile.retentionMs > 86_400_000
    || !/^sha256:[a-f0-9]{64}$/u.test(profile.permissionGrantHash ?? "")) throw new Error("DATASET_TASK_PROFILE_INVALID");
  return { taskFamily: PUBLIC_DATASET_DELIVERY_FAMILY,
    description: "Deliver 1–100 PUBLIC id/value records, at most 8192 bytes. Optional networkPolicy selects accountless or existing-account primary from freshly discovered supported interfaces, then provisions two independently queryable database services on different providers plus a portable copy; independent external observation. No private data, public mutations, uptime guarantee or real payment. Finance is simulation only.",
    profile, normalizeInput: normalizeDatasetDeliveryInput, createSession: createPublicDatasetTaskSession };
}

export function createPublicDatasetTaskSession({ directory, input, registration, dependencies = {} }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`), clock = dependencies.clock ?? (() => new Date().toISOString());
  const request = read(input.productionInput.requestFile);
  if (digest(request) !== registration.requestHash) throw new Error("DATASET_TASK_REQUEST_CHANGED");
  writeOnce(file("family-binding"), { registrationHash: digest(registration), inputHash: digest(input) });
  const lock = action => withUserHeldExecutionLockV2(digest({ directory, kind: "PUBLIC_DATASET_TASK" }), action);
  function inspect() {
    const p = existsSync(file("preparation")) ? read(file("preparation")) : null;
    const confirmed = existsSync(file("confirmation")), started = existsSync(file("execution-started"));
    const result = existsSync(file("result")) ? read(file("result")) : null;
    return { taskFamily: PUBLIC_DATASET_DELIVERY_FAMILY, state: result?.state ?? (started ? "RUNNING" : confirmed ? "CONFIRMED" : p ? "PROPOSED" : "NEW"),
      confirmed, executionStarted: started, terminal: Boolean(result), preparationHash: p?.preparationHash ?? null,
      programHash: p?.compilation.program.programHash ?? null,
      proposal: p ? { outcome: p.compilation.program.outcome, recordCount: p.dataset.records.length, recordsHash: p.recordsHash,
        formationDeadline: p.compilation.program.formationDeadline, completionDeadline: request.completionDeadline,
        retentionEndsAt: p.retentionEndsAt, confirmationRequired: true,
        confirmationScope: "AUTHORIZE_ZERO_COST_FORMATION_AND_EXECUTION_OF_THIS_PUBLIC_DATASET",
        capacityAlreadyReserved: false, resultPromiseIssued: false,
        plannedResources: p.compilation.program.requirements.map(({ requirementId, role, capability }) => ({ requirementId, role, capability })),
        ...(p.selectedNetwork ? { selectedNetwork: p.selectedNetwork } : {}),
        contractDraft: p.contractDraft, capitalBacked: false, financeMode: "SIMULATION_ONLY" } : null,
      actualDelivery: result, paymentAuthorized: false, commercialGuaranteeCreated: false,
      runtimeProgress: existsSync(path.join(input.productionInput.runtimeDirectory, "last-progress.json"))
        ? read(path.join(input.productionInput.runtimeDirectory, "last-progress.json")) : null };
  }
  return { inspect, status: inspect,
    prepare: () => lock(async () => {
      if (!existsSync(file("preparation"))) {
        let selectedNetwork = null;
        if (registration.taskInput.networkPolicy) {
          const discoveryDirectory = path.join(directory, "discovery"); mkdirSync(discoveryDirectory, { recursive: true, mode: 0o700 });
          const selectionFile = path.join(discoveryDirectory, "selected-native-network.json");
          selectedNetwork = existsSync(selectionFile) ? read(selectionFile) : await discoverNativeServiceNetwork({
            input: registration.taskInput, profile: registration.profile,
            requiredUntil: new Date(Date.parse(request.completionDeadline) + registration.profile.retentionMs).toISOString(), clock,
            writeRecord: (name, value) => writeOnce(path.join(discoveryDirectory, `${name}.json`), value) });
          if (selectedNetwork.state === "UNAVAILABLE") {
            writeOnce(file("result"), { state: "UNAVAILABLE", completedAt: clock(), selectedNetwork,
              actualOutcomeDelivered: false, paymentPerformed: false, externalAllocations: 0, financialMode: "SIMULATION_ONLY" });
            return inspect();
          }
        }
        const body = compilePublicDatasetDelivery({ request, dataset: registration.taskInput, profile: registration.profile,
          createdAt: clock(), simulationTerms: input.sandboxFailureRehearsal, selectedNetwork });
        writeOnce(file("preparation"), { ...body, preparationHash: digest(body) });
      }
      return inspect();
    }),
    confirm: hashes => lock(async () => {
      const state = inspect();
      if (!hashes || Object.keys(hashes).sort().join(",") !== "preparationHash,programHash" || !state.preparationHash
        || hashes.preparationHash !== state.preparationHash || hashes.programHash !== state.programHash)
        throw new Error("DATASET_TASK_CONFIRMATION_MISMATCH");
      if (!existsSync(file("confirmation"))) writeOnce(file("confirmation"), { ...hashes, confirmedAt: clock(), paymentAuthorized: false });
      return inspect();
    }),
    runConfirmed: () => lock(async () => {
      const state = inspect(); if (!state.confirmed) throw new Error("DATASET_TASK_CONFIRMATION_REQUIRED");
      if (state.terminal) return state;
      if (!state.executionStarted) writeOnce(file("execution-started"), { startedAt: clock(), programHash: state.programHash });
      const runtime = (dependencies.createDatasetRuntime ?? createPublicDatasetDeliveryRuntime)({
        directory: input.productionInput.runtimeDirectory, preparation: read(file("preparation")) }, dependencies);
      const result = await runtime.run();
      if (["SUCCEEDED", "FAILED_CLOSED", "UNAVAILABLE"].includes(result.state)) writeOnce(file("result"), result);
      else { const error = new Error("DATASET_TASK_EXECUTION_PENDING"); error.code = "DATASET_TASK_EXECUTION_PENDING"; throw error; }
      // A pause remains a pause; do not convert it into success or silently mint a new order.
      return { ...inspect(), ...(result.retry ? { runtimeRetry: result.retry } : {}) };
    }),
  };
}

// Housekeeping in the existing Node, not a second execution queue or a chat
// automation. Only this family's task-owned, expired delivered resources qualify.
export async function cleanupExpiredPublicDatasets(nodeDirectory) {
  const root = path.join(nodeDirectory, "tasks"); if (!existsSync(root)) return [];
  const cleaned = [];
  for (const name of readdirSync(root)) {
    if (!/^task_[a-f0-9]{32}$/u.test(name)) continue;
    const runtimeDirectory = path.join(root, name, "runtime"), pfile = path.join(runtimeDirectory, "preparation.json");
    const resultFile = path.join(runtimeDirectory, "result.json");
    if (!existsSync(pfile) || !existsSync(resultFile) || existsSync(path.join(runtimeDirectory, "expiry-cleanup.json"))) continue;
    const p = read(pfile);
    if (p.compilation?.program?.programId?.startsWith("dataset_") !== true || !p.retentionEndsAt
      || Date.now() < Date.parse(p.retentionEndsAt)) continue;
    cleaned.push(await withUserHeldExecutionLockV2(digest({ runtimeDirectory, kind: "DATASET_EXPIRY" }), () =>
      createPublicDatasetDeliveryRuntime({ directory: runtimeDirectory, preparation: p }).cleanupExpired()));
  }
  return cleaned;
}
