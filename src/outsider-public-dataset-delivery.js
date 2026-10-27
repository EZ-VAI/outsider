/* Demand-specific success delivery on the original planner + OutcomeProgram.
 * This is a bounded data-service capability, not an open-world capability claim.
 * Account/API integrations are reusable; every allocation is made per order.
 * Financial terms are a simulation draft and never cause a payment. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { normalizePublicDataset, publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { compileWorldStateResourcePlan } from "./outsider-world-state-program-compiler.js";
import { createDurableOutcomeProgramOrchestratorV1 } from "./outsider-durable-outcome-program-orchestrator-v1.js";
import { createCloudflareD1PublicDatasetAdapter } from "./outsider-cloudflare-d1-resource-adapter.js";
import { createNeonClaimableResource } from "./outsider-neon-claimable-resource.js";
import { createDatasetReadService } from "./outsider-dataset-read-service.js";
import { createGitHubReleaseAssetProductionRecoveryAdapterV2 } from "./outsider-github-release-asset-production-recovery-adapter-v2.js";
import { createGitHubImmutableReleasePolicyProductionProbeV1 } from "./outsider-github-immutable-release-policy-production-probe-v1.js";
import { createGlobalpingExactHttpObserverV2 } from "./outsider-globalping-exact-http-observer-v2.js";
import { createOutcomeEconomicContractDraftV1 } from "./outsider-outcome-economic-contract-v1.js";
import { compileSandboxOutcomeCompensation } from "./outsider-outcome-compensation-sandbox.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce }
  from "./outsider-user-held-durable-execution-v2.js";

const read = file => JSON.parse(readPrivateExecutionBytes(file));
const bytesHash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const PUBLIC_DATASET_DELIVERY_FAMILY = "PUBLIC_DATASET_DELIVERY_V1";
const fact = predicateId => ({ predicateId, valueType: "boolean", value: true });
const condition = predicateId => ({ ...fact(predicateId), operator: "EQ" });

export function compilePublicDatasetDelivery({ request, dataset, profile, createdAt, simulationTerms, selectedNetwork = null }) {
  const normalized = normalizePublicDataset({ visibility: dataset.visibility, records: dataset.records }), recordsHash = digest(normalized.records);
  if (selectedNetwork && selectedNetwork.state !== "SELECTED_NOT_RESERVED") throw new Error("DATASET_NATIVE_NETWORK_UNAVAILABLE");
  const formationDeadline = new Date(Math.min(Date.parse(createdAt) + 5 * 60_000,
    Date.parse(request.completionDeadline) - 30_000)).toISOString();
  const retentionEndsAt = new Date(Date.parse(request.completionDeadline) + profile.retentionMs).toISOString();
  if (Date.parse(formationDeadline) <= Date.parse(createdAt)
    || Date.parse(retentionEndsAt) + 5 * 60_000 >= Date.parse(profile.zeroCostScope.expiresAt))
    throw new Error("DATASET_DELIVERY_WINDOW_INVALID");
  const key = digest({ request, dataset: normalized, profileHash: digest(profile), ...(selectedNetwork ? { selectedNetworkHash: digest(selectedNetwork) } : {}) }).slice(7, 39);
  const requirements = (selectedNetwork ? [
    { requirementId: "primary_bundle", role: "PRIMARY", capability: "PUBLIC_DATASET_SERVICE_V1", dependsOnRequirementIds: [] },
    { requirementId: "primary_recovery", role: "RECOVERY", capability: "PUBLIC_DATASET_SERVICE_V1", dependsOnRequirementIds: [] },
    { requirementId: "alternate_bundle", role: "PRIMARY", capability: "PUBLIC_DATASET_SERVICE_V1", dependsOnRequirementIds: [] },
    { requirementId: "alternate_recovery", role: "RECOVERY", capability: "PUBLIC_DATASET_SERVICE_V1", dependsOnRequirementIds: [] },
    { requirementId: "portable_copy", role: "RECOVERY", capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION", dependsOnRequirementIds: [] },
    { requirementId: "independent_read", role: "INDEPENDENT_WITNESS", capability: "EXACT_PUBLIC_RESPONSE_OBSERVATION",
      dependsOnRequirementIds: ["portable_copy"], constraints: { admissionMode: "ON_DEMAND_OBSERVATION" } },
  ] : [
    { requirementId: "store_primary", role: "PRIMARY", capability: "PUBLIC_DATASET_STORAGE_V1", dependsOnRequirementIds: [] },
    { requirementId: "store_recovery", role: "RECOVERY", capability: "PUBLIC_DATASET_STORAGE_V1", dependsOnRequirementIds: [] },
    { requirementId: "service_primary", role: "PRIMARY", capability: "PUBLIC_DATASET_HTTPS_V1", dependsOnRequirementIds: ["store_primary", "store_recovery"] },
    { requirementId: "service_recovery", role: "RECOVERY", capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION", dependsOnRequirementIds: [] },
    { requirementId: "independent_read", role: "INDEPENDENT_WITNESS", capability: "EXACT_PUBLIC_RESPONSE_OBSERVATION",
      dependsOnRequirementIds: ["service_recovery"], constraints: { admissionMode: "ON_DEMAND_OBSERVATION" } },
  ]).map(row => ({ ...row, minimumReservationMs: 1, constraints: { recordsHash,
    recordCount: normalized.records.length, artifactHash: recordsHash,
    ...(selectedNetwork ? { selectedNetworkHash: digest(selectedNetwork) } : {}), ...(row.constraints ?? {}) } }));
  const targets = selectedNetwork ? [condition("primary_live_query_available"), condition("different_provider_live_query_available")]
    : [condition("dataset_stored"), condition("read_service_and_portable_copy_available")];
  const compilation = compileWorldStateResourcePlan({
    planningInput: { initialState: [], targetPredicates: targets,
      actions: selectedNetwork ? [
        { actionId: "deliver_selected_primary", capability: "PUBLIC_DATASET_SERVICE_V1", preconditions: [],
          effects: [fact("primary_live_query_available")], durationMs: 15000, costMinor: "0", resourceClaims: [] },
        { actionId: "deliver_selected_alternate", capability: "PUBLIC_DATASET_SERVICE_V1", preconditions: [],
          effects: [fact("different_provider_live_query_available")], durationMs: 15000, costMinor: "0", resourceClaims: [] },
      ] : [
        { actionId: "store_dataset", capability: "PUBLIC_DATASET_STORAGE_V1", preconditions: [],
          effects: [fact("dataset_stored")], durationMs: 5000, costMinor: "0", resourceClaims: [] },
        { actionId: "deliver_read_service", capability: "PUBLIC_DATASET_HTTPS_V1", preconditions: [condition("dataset_stored")],
          effects: [fact("read_service_and_portable_copy_available")], durationMs: 5000, costMinor: "0", resourceClaims: [] },
      ], resources: [], budget: { currency: "USD", maximumAmountMinor: "0" },
      deadlineMs: Date.parse(request.completionDeadline) - Date.parse(createdAt) },
    programInput: { programId: `dataset_${key}`, orderId: `dataset_order_${key}`, createdAt, formationDeadline,
      completionDeadline: request.completionDeadline,
      statement: selectedNetwork
        ? `Deliver exactly ${normalized.records.length} approved PUBLIC records (${recordsHash}) through two separately queryable database services on different providers, with ${selectedNetwork.policy.primaryAccount} primary access, plus a portable copy. Independently observe all three at delivery. Retain until ${retentionEndsAt}; no continuous uptime or real compensation guarantee.`
        : `Deliver exactly ${normalized.records.length} caller-approved PUBLIC records (${recordsHash}) through a live HTTPS database reader and a byte-identical portable copy on a different provider, independently observed at delivery. Retain until ${retentionEndsAt}; continuous uptime and real compensation are not guaranteed.`,
      requirements, finalWitnessRequirementId: "independent_read", obligations: [{
        obligationId: "delivery_handoff", targetRequirementId: selectedNetwork ? "primary_bundle" : "service_primary", nodeId: null,
        trigger: "ON_SUCCESS", action: "RECORD_DELIVERED_RESOURCE_RETENTION", input: { retentionEndsAt },
        deadline: request.completionDeadline }] },
    actionBindings: selectedNetwork ? {
      deliver_selected_primary: { primaryRequirementId: "primary_bundle", recoveryRequirementId: "primary_recovery", witnessRequirementId: "independent_read" },
      deliver_selected_alternate: { primaryRequirementId: "alternate_bundle", recoveryRequirementId: "alternate_recovery", witnessRequirementId: "independent_read" },
    } : {
      store_dataset: { primaryRequirementId: "store_primary", recoveryRequirementId: "store_recovery", witnessRequirementId: "independent_read" },
      deliver_read_service: { primaryRequirementId: "service_primary", recoveryRequirementId: "service_recovery", witnessRequirementId: "independent_read" },
    },
  });
  const contractDraft = createOutcomeEconomicContractDraftV1({ contractVersion: 1, supersedesContractHash: null,
    outcomeProgramHash: compilation.program.programHash, outcomeDefinitionHash: digest(compilation.program.outcome),
    episodeRefHash: digest({ requestId: request.requestId, kind: "NODE_DATASET_DELIVERY_EPISODE_REFERENCE" }),
    compensationTerms: [{ termRefHash: digest({ key, simulationTerms }),
      triggerPredicateRefHash: digest({ key, predicate: "INDEPENDENTLY_ESTABLISHED_NONDELIVERY_BY_DEADLINE" }),
      responsiblePartyRefHash: digest({ key, role: "OUTSIDER_SIMULATION_NOT_FUNDED" }),
      beneficiaryRefHash: digest({ key, role: "REQUESTING_NODE_OWNER_SIMULATION" }),
      paymentDueWithinSeconds: simulationTerms.paymentDueWithinSeconds,
      calculation: { kind: "FIXED", amount: simulationTerms.amount } }] });
  return { compilation, dataset: normalized, recordsHash, retentionEndsAt, profile, contractDraft,
    financeMode: "SIMULATION_ONLY", paymentAuthorized: false, capitalBacked: false,
    recoveryRehearsalRequested: false, ...(selectedNetwork ? { selectedNetwork } : {}) };
}

export function createPublicDatasetDeliveryRuntime({ directory, preparation }, dependencies = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const { profile, dataset, recordsHash, retentionEndsAt, compilation } = preparation;
  const selectedNetwork = preparation.selectedNetwork;
  const { program } = compilation;
  const file = name => path.join(directory, `${name}.json`);
  writeOnce(file("preparation"), preparation);
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const resourceProgram = { ...program, completionDeadline: new Date(Date.parse(profile.zeroCostScope.expiresAt) - 1).toISOString() };
  const loadCredentials = () => read(profile.github.credentialsFile);
  const account = dependencies.credentials ?? loadCredentials();
  const githubCredentials = account.githubReleaseAsset;
  const token = () => readPrivateExecutionBytes(profile.cloudflare.d1TokenFile).toString("utf8").trim();
  const workers = profile.cloudflare.workersCredentialsFile === profile.github.credentialsFile ? account
    : read(profile.cloudflare.workersCredentialsFile);
  const pendingSteps = new Map();
  const step = async (name, action) => {
    if (existsSync(file(name))) return read(file(name));
    if (pendingSteps.has(name)) return pendingSteps.get(name);
    const pending = (async () => { const value = await action(); writeOnce(file(name), value); return value; })();
    pendingSteps.set(name, pending);
    try { return await pending; } finally { pendingSteps.delete(name); }
  };
  const d1 = (dependencies.createD1 ?? createCloudflareD1PublicDatasetAdapter)({ directory: path.join(directory, "d1"),
    accountId: profile.cloudflare.accountId, getApiToken: token, publicData: true, records: dataset.records,
    zeroCostScope: profile.zeroCostScope, clock });
  const neon = (dependencies.createNeon ?? createNeonClaimableResource)({ directory: path.join(directory, "neon"),
    permissionGrantHash: profile.permissionGrantHash, ...(selectedNetwork ? { dataApi: true } : {}), clock });
  // Raw API receipts, but never request credentials, stay private. The public
  // network projection contains exact receipt hashes and result URLs only.
  async function githubFetch(url, options = {}) {
    const response = await (dependencies.fetchImpl ?? fetch)(url, options);
    const raw = Buffer.from(await response.clone().arrayBuffer());
    writeOnce(file(`github-source-${randomUUID()}`), { sourceKind: "GITHUB_API", observedAt: clock(),
      method: options.method ?? "GET", url: String(url), status: response.status, bodyBase64: raw.toString("base64") });
    return response;
  }
  const github = (dependencies.createGitHub ?? createGitHubReleaseAssetProductionRecoveryAdapterV2)({
    owner: profile.github.owner, repository: profile.github.repository,
    apiToken: githubCredentials.contentsWriteApiToken, artifactBytes: Buffer.from(canonicalizeStrict(dataset.records)),
    fetchImpl: githubFetch,
    immutableReleasePolicyProbe: createGitHubImmutableReleasePolicyProductionProbeV1({
      owner: profile.github.owner, repository: profile.github.repository,
      apiToken: githubCredentials.administrationReadApiToken,
      administrationReadCapabilityConfirmed: profile.github.administrationReadCapabilityConfirmed === true }),
  });
  const d1Context = context => ({ ...context, program: resourceProgram, permissionGrantHash: profile.permissionGrantHash,
    requirementId: selectedNetwork ? "dataset_cloudflare_storage" : context.requirement.requirementId,
    ...(selectedNetwork ? { requirement: { ...context.requirement, requirementId: "dataset_cloudflare_storage", capability: "PUBLIC_DATASET_STORAGE_V1" },
      ...(existsSync(file("d1-allocation")) ? { reservation: read(file("d1-allocation")) } : {}) } : {}) });
  function endpoint() {
    const reservation = read(file("d1-allocation"));
    const createHash = digest({ operationRefHash: reservation.adapterState.operationRefHash, kind: "CREATE" });
    const createSource = read(path.join(directory, "d1", createHash.slice(7), "source.json"));
    const databaseId = JSON.parse(Buffer.from(createSource.bodyBase64, "base64")).result.uuid;
    return (dependencies.createEndpoint ?? createDatasetReadService)({ directory: path.join(directory, "endpoint"),
      accountId: profile.cloudflare.accountId, workersDevSubdomain: profile.cloudflare.workersDevSubdomain,
      databaseId, namespace: program.programId, recordsHash, recordCount: dataset.records.length, expiresAt: retentionEndsAt,
      getApiToken: () => workers.cloudflare.apiToken, getNeonConnection: () => neon.privateReadConnection(),
      ...(selectedNetwork ? { neonFallback: false } : {}) });
  }
  const observer = (dependencies.createObserver ?? createGlobalpingExactHttpObserverV2)({ directory: path.join(directory, "observer"), clock });
  const keep = context => context.disposition === "SUCCEEDED" && Date.parse(clock()) < Date.parse(retentionEndsAt);
  const retained = resource => ({ status: "CLOSED", receipt: { resource, reservationDisposition: "CONSUMED_BY_DELIVERED_SERVICE",
    remoteResourceDeleted: false, cleanupDueAt: retentionEndsAt } });
  const adapters = {
    d1_dataset: { providerRef: "cloudflare", reserve: context => step("d1-allocation", () => d1.reserve(d1Context(context))),
      async execute(context) {
        const result = await d1.execute(d1Context(context));
        return { status: result.status, recordsHash: result.recordsHash, providerReceipt: result.providerReceipt,
          providerRef: "cloudflare", providerObservationIndependent: false };
      },
      release: context => keep(context) ? retained("cloudflare-d1") : d1.release(d1Context(context)) },
    neon_dataset: { providerRef: "neon",
      reserve: () => step("neon-allocation", async () => { const value = await neon.reserve();
        return { ...value, reservationId: `neon:${value.projectRefHash.slice(7, 39)}` }; }),
      execute: () => neon.writePublicDataset(dataset),
      release: context => keep(context) ? retained("neon-postgres") : neon.clear().then(value => ({ status: "CLOSED", receipt: value })) },
    cloudflare_service: { providerRef: "cloudflare",
      reserve: () => step("endpoint-allocation", () => endpoint().reserve()),
      async execute() { return { status: "SUCCEEDED", routeUrl: endpoint().routeUrl,
        deliveryKind: "LIVE_DATABASE_READER", providerReceipt: read(file("endpoint-allocation")).providerReceipt,
        providerObservationIndependent: false }; },
      closeObligation: () => ({ status: "CLOSED", receipt: { routeUrl: endpoint().routeUrl,
        retentionEndsAt, lifecycleOwner: "EXISTING_OUTCOME_NODE", externalCapitalBound: false } }),
      release: context => keep(context) ? retained("cloudflare-worker") : endpoint().release() },
    github_copy: { providerRef: "github",
      reserve: context => step("github-allocation", () => github.reserve({ ...context, program: resourceProgram })),
      execute: context => github.execute(context),
      release: context => keep(context) ? retained("github-release-asset") : github.release(context) },
    globalping_read: { providerRef: "globalping",
      async reserve({ operationId }) {
        return step("witness-readiness", async () => {
          const observation = await observer.observe({ operationId: `${operationId}_readiness`,
            targetUrl: read(file("github-allocation")).adapterState.routeUrl });
          if (observation.status !== 200 || observation.bodyHash !== recordsHash) throw new Error("DATASET_WITNESS_NOT_AVAILABLE");
          return { status: "READY_ON_DEMAND", reservationId: `globalping-readiness:${operationId}`,
            validUntil: program.completionDeadline, providerReceipt: observation,
            capacityReserved: false, adapterState: { availabilityBasis: "ACTUAL_COMPLETED_MEASUREMENT_NOT_FUTURE_CAPACITY_LEASE" } };
        });
      },
      async observe({ operationId, node }) {
        const final = node.nodeId === compilation.finalNodeId;
        const bundleUrl = async adapterId => adapterId === "neon_bundle" ? neon.publicReadUrl() : endpoint().routeUrl;
        const urls = selectedNetwork ? (final
          ? [await bundleUrl(selectedNetwork.primary.adapterId), await bundleUrl(selectedNetwork.alternate.adapterId), read(file("github-allocation")).adapterState.routeUrl]
          : [await bundleUrl(node.input.worldStateAction.actionId === "deliver_selected_primary" ? selectedNetwork.primary.adapterId : selectedNetwork.alternate.adapterId)])
          : final || node.input.worldStateAction?.actionId === "deliver_read_service"
          ? [endpoint().routeUrl, read(file("github-allocation")).adapterState.routeUrl] : [endpoint().routeUrl];
        const began = clock();
        const attempts = await Promise.allSettled(urls.map((targetUrl, i) => observer.observe({ operationId: `${operationId}_${i}`, targetUrl })));
        const rejected = attempts.find(value => value.status === "rejected");
        if (rejected) {
          const code = rejected.reason?.outsiderCode;
          if (!["EXACT_FINAL_BODY_UNAVAILABLE", "EXACT_HTTP_RESULT_UNAVAILABLE", "MEASUREMENT_POLL_EXHAUSTED"].includes(code)) throw rejected.reason;
          // A real failed/unfinished spot observation is not a proven failure
          // to deliver by the future deadline. Preserve this occurrence and
          // ask the existing engine to schedule a new observation, never edit it.
          return { status: "INCONCLUSIVE", reason: `GLOBALPING_${code}`, observedAt: clock(),
            retryAfter: new Date(Date.parse(clock()) + 5000).toISOString(),
            completedObservations: attempts.filter(value => value.status === "fulfilled").map(value => value.value) };
        }
        const observations = attempts.map(value => value.value);
        const exact = observations.every(value => value.status === 200 && (value.canonicalJsonHash ?? value.bodyHash) === recordsHash);
        return { status: exact ? "SATISFIED" : "NOT_SATISFIED", observedAt: clock(), observations,
          observationStartedAt: began, observationMode: final ? "JOINT_CURRENT_STATE" : "CURRENT_STATE",
          providerRef: "globalping", dataContainsExpectedBytesOnly: true,
          independentOfExecutionProviders: true, expectedRecordsHash: recordsHash, simultaneousInstantClaimed: false };
      }, release: () => ({ status: "CLOSED", receipt: { capacityReserved: false, allSubmittedObservationsCompleted: true } }) },
  };
  if (selectedNetwork) {
    // A bundle's role aliases share one actual allocation, not two fake leases.
    // Both independently queryable services are populated on the normal success path.
    const handoff = async adapterId => ({ status: "CLOSED", receipt: { retentionEndsAt,
      routeUrl: adapterId === "neon_bundle" ? await neon.publicReadUrl() : endpoint().routeUrl, financialMode: "SIMULATION_ONLY" } });
    adapters.neon_bundle = { providerRef: "neon", reserve: () => step("neon-allocation", async () => {
      const value = await neon.reserve(); return { ...value, reservationId: `neon:${value.projectRefHash.slice(7, 39)}` }; }),
      execute: () => step("neon-service-delivery", async () => { await neon.writePublicDataset(dataset);
        return neon.publishPublicRead({ expiresAt: retentionEndsAt }); }),
      closeObligation: () => handoff("neon_bundle"), release: adapters.neon_dataset.release };
    adapters.cloudflare_bundle = { providerRef: "cloudflare", reserve: context => step("cloudflare-bundle-allocation", async () => {
      await adapters.d1_dataset.reserve(context); const value = await adapters.cloudflare_service.reserve(context);
      return { ...value, adapterState: { ...value.adapterState, bundle: "D1_AND_STANDALONE_WORKER" } }; }),
      execute: context => step("cloudflare-service-delivery", async () => { const stored = await adapters.d1_dataset.execute(context);
        if (stored.status !== "SUCCEEDED") return stored; return { ...stored, routeUrl: endpoint().routeUrl }; }),
      closeObligation: () => handoff("cloudflare_bundle"),
      async release(context) { if (keep(context)) return retained("cloudflare-d1-and-worker");
        const service = await endpoint().release();
        const storage = await d1.release(d1Context({ ...context, reservation: read(file("d1-allocation")) }));
        return { status: "CLOSED", receipt: { service, storage } }; } };
  }
  const bindings = selectedNetwork?.bindings ?? { store_primary: "d1_dataset", store_recovery: "neon_dataset", service_primary: "cloudflare_service",
    service_recovery: "github_copy", independent_read: "globalping_read" };
  const orchestrator = (dependencies.createOrchestrator ?? createDurableOutcomeProgramOrchestratorV1)({
    directory: path.join(directory, "program"), adapters, clock,
    discover: async ({ requirement }) => ({ adapterId: bindings[requirement.requirementId],
      providerRef: adapters[bindings[requirement.requirementId]].providerRef }),
    measureOperations: () => ({ outsiderStaffTouchCount: existsSync(file("engineering-intervention")) ? read(file("engineering-intervention")).count : 0, humanQueueCreated: false,
      source: "NODE_AUTOMATED_ADAPTER_PATH_NO_HUMAN_STEP_SELF_REPORTED" }),
  });
  return {
    // Composition exports the existing adapters, not another provider loop.
    // A parent OutcomeProgram may own discovery/reservation/execution instead
    // of calling this family's run(). All receipts then bind the parent hash.
    resourceBindings: { adapters, bindings },
    async deliveryDescriptor() {
      return { primaryUrl: selectedNetwork?.primary.adapterId === "neon_bundle" ? await neon.publicReadUrl() : endpoint().routeUrl,
        alternateUrl: selectedNetwork?.alternate.adapterId === "neon_bundle" ? await neon.publicReadUrl() : endpoint().routeUrl,
        portableCopyUrl: read(file("github-allocation")).adapterState.routeUrl,
        ...(selectedNetwork ? { publicAnonymousTokenUrl: await neon.publicAnonymousTokenUrl() } : {}),
        recordsHash, recordCount: dataset.records.length, availableUntil: retentionEndsAt };
    },
    async cleanupComposed(composedResult, requirementPrefix) {
      if (Date.parse(clock()) < Date.parse(retentionEndsAt)) return null;
      return step("expiry-cleanup", async () => {
        const resources = {};
        for (const id of ["primary_bundle", "alternate_bundle", "portable_copy"]) {
          const globalId = `${requirementPrefix}${id}`, reservation = composedResult.reservations[globalId];
          if (reservation) resources[globalId] = await adapters[bindings[id]].release({ program,
            requirement: program.requirements.find(row => row.requirementId === globalId), reservation,
            operationId: `expiry_${program.programHash.slice(7, 39)}_${globalId}`, disposition: "EXPIRED" });
        }
        return { completedAt: clock(), resources, neonProjectTermination: "PROVIDER_AUTOMATIC_EXPIRY_PENDING" };
      });
    },
    async run() {
      if (existsSync(file("result"))) return read(file("result"));
      let result = await orchestrator.run(program);
      for (let attempt = 0; result.state === "PAUSED_RETRYABLE" && result.retry?.phase === "OBSERVE"
        && attempt < 3 && Date.parse(clock()) + 6000 < Date.parse(program.completionDeadline); attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, dependencies.retryDelayMs ?? 5000));
        result = await orchestrator.resume(program.programId);
      }
      if (!["SUCCEEDED", "FAILED_CLOSED", "UNAVAILABLE"].includes(result.state)) return { state: result.state,
        retry: result.retry, program: result, financeMode: "SIMULATION_ONLY" };
      const success = result.state === "SUCCEEDED";
      const outcomeObserved = result.nodes[compilation.finalNodeId]?.witness?.status === "SATISFIED";
      const staffTouches = existsSync(file("engineering-intervention")) ? read(file("engineering-intervention")).count : 0;
      const body = { state: result.state, taskFamily: PUBLIC_DATASET_DELIVERY_FAMILY, completedAt: clock(),
        actualOutcomeDelivered: outcomeObserved, unattendedProductAcceptancePassed: success && staffTouches === 0,
        program: result, recordCount: dataset.records.length, recordsHash,
        delivery: outcomeObserved ? { primaryUrl: selectedNetwork?.primary.adapterId === "neon_bundle" ? await neon.publicReadUrl() : endpoint().routeUrl,
          ...(selectedNetwork ? { alternateUrl: selectedNetwork.alternate.adapterId === "neon_bundle" ? await neon.publicReadUrl() : endpoint().routeUrl,
            queryAccess: { neon: { endpoint: await neon.publicReadUrl(), publicAnonymousTokenUrl: await neon.publicAnonymousTokenUrl(),
              authorization: "PUBLIC_GUEST_TOKEN_NO_SIGNIN_NO_OWNER_SECRET" }, cloudflare: { endpoint: endpoint().routeUrl, authorization: "NONE" } },
            bothDatabasesPopulated: true, servicesDependOnEachOtherAtReadTime: false } : {}),
          portableCopyUrl: read(file("github-allocation")).adapterState.routeUrl, availableUntil: retentionEndsAt,
          continuousUptimeGuaranteed: false, cleanupState: "RETAINED_FOR_USER_UNTIL_EXPIRY" } : null,
        temporaryNetwork: { providerCount: 4, resourceCount: selectedNetwork ? 7 : 5, formationMode: "PER_ORDER_NATIVE_API_ALLOCATION",
          ...(selectedNetwork ? { selection: selectedNetwork, logicalRequirementsShareActualBundleAllocations: true } : {}),
          discoveryScope: selectedNetwork ? selectedNetwork.discovery.coverage : "CONFIGURED_ACCOUNT_INTERFACES_AND_ACCOUNTLESS_NEON_NOT_ARBITRARY_OPEN_WEB",
          resources: Object.entries(result.bindings).map(([requirementId, binding]) => ({ requirementId,
            providerRef: binding.providerRef, receipt: result.reservations[requirementId]?.providerReceipt,
            allocationBasis: result.reservations[requirementId]?.capacityReserved === false ? "ON_DEMAND_OBSERVATION" : "ACTUAL_ALLOCATED_RESOURCE",
            bespokeOutcomeLiabilityAccepted: false })),
          fullOpenWorldFourGatesComplete: false },
        financeMode: "SIMULATION_ONLY", capitalBacked: false, paymentPerformed: false,
        contractDraft: preparation.contractDraft,
        compensation: compileSandboxOutcomeCompensation({ contractDraft: preparation.contractDraft,
          terminalOutcome: result, createdAt: clock() }),
        forcedFailurePerformed: false, employeeStepsInExecution: staffTouches,
        staffTouchMeasurementIndependent: false, recoveryRouteExercised: Object.values(result.nodes).some(node => node.recovery !== null) };
      writeOnce(file("result"), body); return body;
    },
    async cleanupExpired() {
      if (!existsSync(file("result")) || Date.parse(clock()) < Date.parse(retentionEndsAt)) return null;
      return step("expiry-cleanup", async () => {
        const result = read(file("result")), released = {};
        // Stop external reads before dropping databases. No account-wide cleanup.
        for (const id of selectedNetwork ? ["primary_bundle", "alternate_bundle", "portable_copy"] : ["service_primary", "service_recovery", "store_primary", "store_recovery"]) {
          const reservation = result.program.reservations[id]; if (!reservation) continue;
          const context = { program, requirement: program.requirements.find(row => row.requirementId === id),
            reservation, operationId: `expiry_${program.programHash.slice(7, 39)}_${id}`, disposition: "EXPIRED" };
          released[id] = await adapters[bindings[id]].release(context);
        }
        return { completedAt: clock(), resources: released, neonProjectTermination: "PROVIDER_AUTOMATIC_EXPIRY_PENDING" };
      });
    },
  };
}
