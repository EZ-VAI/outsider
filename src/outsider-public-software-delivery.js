/* Deploy caller-approved executable PUBLIC modules, not an embedded dataset.
 * Native Cloudflare compilation/activation is the execution path. GitHub holds
 * the exact portable source package; Globalping supplies separate root-response
 * evidence. The second runtime shares Cloudflare's failure domain, explicitly. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { compileWorldStateResourcePlan } from "./outsider-world-state-program-compiler.js";
import { createOutcomeEconomicContractDraftV1 } from "./outsider-outcome-economic-contract-v1.js";
import { createGitHubReleaseAssetProductionRecoveryAdapterV2 } from "./outsider-github-release-asset-production-recovery-adapter-v2.js";
import { createGitHubImmutableReleasePolicyProductionProbeV1 } from "./outsider-github-immutable-release-policy-production-probe-v1.js";
import { createGlobalpingExactHttpObserverV2 } from "./outsider-globalping-exact-http-observer-v2.js";
import { createGitHubPublicBuild, normalizePublicSoftwareInput, softwareBytesHash as hash } from "./outsider-github-public-build.js";
import { publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { jsonFunctionSoftware, javascriptFunctionSoftware, createNeonJsonFunctionRuntime, JSON_FUNCTION_CAPABILITY } from "./outsider-portable-json-function.js";
import { createDenoDeployRuntime } from "./outsider-deno-deploy-runtime.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export const SOFTWARE_CAPABILITY = "PUBLIC_SOFTWARE_SERVICE_V1";
export function publicSoftwareSourceBytes(packet, wireEncoding) {
  const json = JSON.stringify(normalizePublicSoftwareInput(packet));
  // The source remains losslessly JSON-decodable. ASCII avoids a real probe's
  // UTF-8 chunk-decoding corruption; never repair its old observation in place.
  return Buffer.from(wireEncoding === "ASCII_ESCAPED_JSON_V1"
    ? json.replace(/[^\x00-\x7f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`) : json);
}
export function compilePublicSoftwareDelivery({ request, software, profile, createdAt, simulationTerms, portableFunction }) {
  const packet = normalizePublicSoftwareInput(software);
  const capability = portableFunction ? portableFunction.metadata.capability : SOFTWARE_CAPABILITY;
  const deno = portableFunction?.recoveryProvider === "deno";
  if (deno && !profile.denoDeploy) throw new Error("DENO_PLATFORM_NOT_CONNECTED");
  if (Object.keys(packet.files).some(name => name.endsWith(".ts")) && !profile.githubBuild) throw new Error("TYPESCRIPT_EXTERNAL_BUILD_CONNECTION_REQUIRED");
  if (Object.hasOwn(packet.files, "outsider-entry.mjs")) throw new Error("SOFTWARE_WRAPPER_NAME_RESERVED");
  const sourceWireEncoding = deno ? "ASCII_ESCAPED_JSON_V1" : undefined;
  const sourceHash = hash(publicSoftwareSourceBytes(packet, sourceWireEncoding)), key = digest({ request, sourceHash }).slice(7, 39);
  const retentionEndsAt = new Date(Date.parse(request.completionDeadline) + profile.retentionMs).toISOString();
  if (Date.parse(retentionEndsAt) >= Date.parse(profile.zeroCostScope.expiresAt)) throw new Error("SOFTWARE_SCOPE_EXPIRES_BEFORE_HANDOFF");
  const requirements = [
    { requirementId: "runtime_primary", role: "PRIMARY", capability },
    { requirementId: "runtime_recovery", role: "RECOVERY", capability },
    { requirementId: "source_copy", role: "RECOVERY", capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION" },
    { requirementId: "independent_read", role: "INDEPENDENT_WITNESS", capability: "EXACT_PUBLIC_RESPONSE_OBSERVATION" },
  ].map(row => ({ ...row, minimumReservationMs: 1, dependsOnRequirementIds: row.role === "INDEPENDENT_WITNESS" ? ["source_copy"] : [], constraints: { sourceHash,
    ...(row.requirementId === "source_copy" ? { artifactHash: sourceHash } : {}),
    ...(row.role === "INDEPENDENT_WITNESS" ? { admissionMode: "ON_DEMAND_OBSERVATION" } : {}) } }));
  const compilation = compileWorldStateResourcePlan({ planningInput: { initialState: [],
    targetPredicates: [{ predicateId: "software_available", valueType: "boolean", value: true, operator: "EQ" }],
    actions: [{ actionId: "deliver_software", capability, preconditions: [],
      effects: [{ predicateId: "software_available", valueType: "boolean", value: true }], durationMs: 30000, costMinor: "0", resourceClaims: [] }],
    resources: [], budget: { currency: "USD", maximumAmountMinor: "0" }, deadlineMs: Date.parse(request.completionDeadline) - Date.parse(createdAt) },
    programInput: { programId: `software_${key}`, orderId: `software_order_${key}`, createdAt,
      formationDeadline: new Date(Math.min(Date.parse(createdAt) + 180000, Date.parse(request.completionDeadline) - 30000)).toISOString(),
      completionDeadline: request.completionDeadline,
      statement: deno
        ? `Deliver PUBLIC synchronous JSON function ${portableFunction.functionHash} as the same portable JavaScript source on Cloudflare Workers and Deno Deploy. Execute the same ${portableFunction.packet.checks.length} frozen input/output cases on both providers; independently invoke these computations and observe the GitHub source package. Retain until ${retentionEndsAt}. No universal correctness, uptime guarantee or capital commitment.`
        : portableFunction
        ? `Deliver PUBLIC synchronous JSON function ${portableFunction.functionHash} using its explicit JavaScript and PostgreSQL implementations on Cloudflare and Neon. Execute the same ${portableFunction.packet.checks.length} frozen input/output cases on both providers, independently observe those computations and the GitHub source package. Retain until ${retentionEndsAt}. No universal implementation equivalence, arbitrary Node/server portability, uptime guarantee or capital commitment.`
        : `Deploy PUBLIC executable JavaScript package ${sourceHash}; exercise ${packet.checks.length} exact HTTP cases on two separate Cloudflare runtime instances, independently observe each root response and the GitHub portable source package. Retain until ${retentionEndsAt}. Shared runtime provider, not cross-provider failover or arbitrary software correctness.`,
      requirements, finalWitnessRequirementId: "independent_read", obligations: [{ obligationId: "software_handoff", targetRequirementId: "runtime_primary",
        nodeId: null, trigger: "ON_SUCCESS", action: "RECORD_DELIVERED_RESOURCE_RETENTION", input: { retentionEndsAt }, deadline: request.completionDeadline }] },
    actionBindings: { deliver_software: { primaryRequirementId: "runtime_primary", recoveryRequirementId: "runtime_recovery", witnessRequirementId: "independent_read" } } });
  const contractDraft = createOutcomeEconomicContractDraftV1({ contractVersion: 1, supersedesContractHash: null,
    outcomeProgramHash: compilation.program.programHash, outcomeDefinitionHash: digest(compilation.program.outcome),
    episodeRefHash: digest({ requestId: request.requestId, kind: "SOFTWARE_DELIVERY" }), compensationTerms: [{
      termRefHash: digest({ key, simulationTerms }), triggerPredicateRefHash: digest({ key, trigger: "CONFIRMED_SOFTWARE_NOT_DELIVERED" }),
      responsiblePartyRefHash: digest({ key, role: "OUTSIDER_SIMULATION_NOT_FUNDED" }), beneficiaryRefHash: digest({ key, role: "REQUESTER" }),
      paymentDueWithinSeconds: simulationTerms.paymentDueWithinSeconds, calculation: { kind: "FIXED", amount: simulationTerms.amount } }] });
  return { compilation, packet, sourceHash, retentionEndsAt, profile, contractDraft, sourcePublicationApproved: true,
    ...(sourceWireEncoding ? { sourceWireEncoding } : {}),
    ...(portableFunction ? { portableFunction } : {}),
    executionMode: deno ? "PORTABLE_JSON_FUNCTION_CLOUDFLARE_AND_DENO" : portableFunction ? "DUAL_JSON_FUNCTION_CLOUDFLARE_AND_NEON_SQL" : profile.githubBuild ? "GITHUB_BUILD_TO_CLOUDFLARE_RUNTIME" : "CLOUDFLARE_NATIVE_ES_MODULES_NO_LOCAL_BUILD", recoveryProviderIndependent: !!portableFunction,
    financeMode: "SIMULATION_ONLY", capitalBacked: false, paymentAuthorized: false };
}

export function compilePublicJsonFunctionDelivery({ request, functionInput, profile, createdAt, simulationTerms }) {
  const portableFunction = jsonFunctionSoftware(functionInput);
  // A synchronous function needs no CI conversion. Both native providers compile
  // the caller's explicit implementations; no source runs in the product Node.
  const { githubBuild, ...nativeProfile } = profile;
  const prepared = compilePublicSoftwareDelivery({ request, software: portableFunction.software, profile: nativeProfile,
    createdAt, simulationTerms, portableFunction });
  return prepared;
}

export function compilePublicJsFunctionDelivery({ request, functionInput, profile, createdAt, simulationTerms }) {
  const portableFunction = javascriptFunctionSoftware(functionInput), { githubBuild, ...nativeProfile } = profile;
  return compilePublicSoftwareDelivery({ request, software: portableFunction.software, profile: nativeProfile,
    createdAt, simulationTerms, portableFunction });
}

function createNativeSoftwareRuntime({ directory, profile, packet, sourceHash, namespace, expiresAt, fetchImpl, clock }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  const suffix = digest({ namespace, sourceHash, expiresAt }).slice(7, 39), scriptName = `outsider-app-${suffix}`;
  const routeUrl = `https://${scriptName}.${profile.cloudflare.workersDevSubdomain}.workers.dev/`;
  const base = `/client/v4/accounts/${profile.cloudflare.accountId}/workers/scripts/${scriptName}`;
  const wrapper = `import app from "./${packet.entry}";export default{async fetch(request,env,ctx){if(Date.now()>=${Date.parse(expiresAt)})return Response.json({expired:true},{status:410});return app.fetch(request,env,ctx)}};\n`;
  async function exchange(method, route, body) {
    const credentials = read(profile.cloudflare.workersCredentialsFile);
    const r = await fetchImpl(`https://api.cloudflare.com${route}`, { method, headers: { authorization: `Bearer ${credentials.cloudflare.apiToken}`,
      ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) }, ...(body ? { body } : {}),
      redirect: "error", signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await r.arrayBuffer()); let json; try { json = JSON.parse(bytes); } catch {}
    writeOnce(file(`source-${randomUUID()}`), { sourceKind: "CLOUDFLARE_SOFTWARE_API", method, route, observedAt: clock(), status: r.status, bodyBase64: bytes.toString("base64") });
    return { status: r.status, bytes, json, receiptHash: hash(bytes) };
  }
  const owns = response => response.status === 200 && response.bytes.includes(Buffer.from(wrapper))
    && Object.values(packet.files).every(source => response.bytes.includes(Buffer.from(source)));
  return { routeUrl,
    async reserve() {
      if (existsSync(file("allocation"))) return read(file("allocation"));
      const before = await exchange("GET", base);
      if (before.status !== 404 && !owns(before)) throw new Error("SOFTWARE_NAMESPACE_OCCUPIED");
      if (before.status === 404) {
        const form = new FormData();
        form.set("metadata", JSON.stringify({ main_module: "outsider-entry.mjs", compatibility_date: "2025-08-01", bindings: [] }));
        for (const [name, source] of Object.entries({ ...packet.files, "outsider-entry.mjs": wrapper }))
          form.set(name, new Blob([source], { type: "application/javascript+module" }), name);
        const uploaded = await exchange("PUT", base, form);
        if (uploaded.json?.success !== true) throw new Error(`SOFTWARE_NATIVE_COMPILE_HTTP_${uploaded.status}`);
      }
      const active = await exchange("POST", `${base}/subdomain`, JSON.stringify({ enabled: true, previews_enabled: false }));
      if (active.json?.result?.enabled !== true) throw new Error("SOFTWARE_RUNTIME_NOT_ACTIVE");
      const source = await exchange("GET", base);
      if (!owns(source)) throw new Error("SOFTWARE_NATIVE_MODULE_READBACK_MISMATCH");
      const result = { status: "RESERVED", reservationId: `software:${scriptName}`, validUntil: expiresAt,
        providerReceipt: { activation: active.receiptHash, moduleReadback: source.receiptHash, sourceHash },
        adapterState: { routeUrl, scriptName, allocationBasis: "PROVISIONED_EXECUTABLE_RUNTIME_NOT_SLA", sourceHash } };
      writeOnce(file("allocation"), result); return result;
    },
    async exercise() {
      const results = [];
      for (const test of packet.checks) {
        const r = await fetchImpl(new URL(test.path, routeUrl), { method: test.method, headers: { "content-type": "application/json" },
          ...(test.body === null ? {} : { body: test.body }), redirect: "error", signal: AbortSignal.timeout(15000) });
        const bytes = Buffer.from(await r.arrayBuffer()); let json; try { json = JSON.parse(bytes); } catch {}
        const matched = r.status === test.expectedStatus && json !== undefined && canonicalizeStrict(json) === canonicalizeStrict(JSON.parse(test.expectedBody));
        const result = { method: test.method, path: test.path, status: r.status, matched, responseHash: hash(bytes) };
        writeOnce(file(`http-effect-${randomUUID()}`), { ...result, observedAt: clock(), bodyBase64: bytes.toString("base64") });
        results.push(result);
      }
      return { status: results.every(row => row.matched) ? "SUCCEEDED" : "FAILED", routeUrl, checks: results, localExecutionUsed: false,
        observationIndependentlyOperated: false, evidenceScope: "EXACT_CALLER_DEFINED_HTTP_CASES_NOT_ALL_BEHAVIOR" };
    },
    async release() {
      if (existsSync(file("released"))) return read(file("released"));
      const before = await exchange("GET", base);
      if (before.status !== 404) {
        if (!owns(before)) throw new Error("SOFTWARE_REMOTE_OWNER_CHANGED");
        const deleted = await exchange("DELETE", base);
        if (deleted.status !== 404 && deleted.json?.success !== true) throw new Error("SOFTWARE_DELETE_NOT_ACCEPTED");
      }
      const result = { status: "CLOSED", receipt: { scriptName, activeRuntimeRemoved: true, physicalErasureClaimed: false } };
      writeOnce(file("released"), result); return result;
    },
  };
}

export function createPublicSoftwareDeliveryRuntime({ directory, preparation }, dependencies = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (preparation.profile.githubBuild && !preparation.externalBuild) {
    let pending;
    const runtime = () => pending ??= (async () => {
      const externalBuild = await (dependencies.createBuild ?? createGitHubPublicBuild)({ directory: path.join(directory, "build"),
        profile: preparation.profile.githubBuild, packet: preparation.packet, programHash: preparation.compilation.program.programHash,
        ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}), ...(dependencies.clock ? { clock: dependencies.clock } : {}) }).build();
      if (externalBuild.sourceHash !== preparation.sourceHash) throw new Error("SOFTWARE_BUILD_SOURCE_CHANGED");
      return createPublicSoftwareDeliveryRuntime({ directory, preparation: { ...preparation, externalBuild,
        sourcePacket: preparation.packet, packet: { ...preparation.packet, entry: "built.mjs",
          files: { "built.mjs": Buffer.from(externalBuild.artifactBase64, "base64").toString("utf8") } } } }, dependencies);
    })().catch(error => { pending = null; throw error; });
    const providers = { software_primary: "cloudflare", software_recovery: "cloudflare", software_copy: "github", software_observer: "globalping" };
    return { resourceBindings: { bindings: { runtime_primary: "software_primary", runtime_recovery: "software_recovery",
      source_copy: "software_copy", independent_read: "software_observer" },
      adapters: Object.fromEntries(Object.entries(providers).map(([id, providerRef]) => [id, { providerRef,
        ...Object.fromEntries(["reserve", "execute", "observe", "release", "closeObligation"].map(method => [method,
          async context => (await runtime()).resourceBindings.adapters[id][method](context)])) }])) },
      deliveryDescriptor: async () => (await runtime()).deliveryDescriptor(),
      cleanupComposed: async (...args) => (await runtime()).cleanupComposed(...args) };
  }
  const { profile, packet, sourceHash, retentionEndsAt, compilation } = preparation, { program } = compilation;
  const clock = dependencies.clock ?? (() => new Date().toISOString()), fetchImpl = dependencies.fetchImpl ?? fetch;
  const file = name => path.join(directory, `${name}.json`);
  writeOnce(file("preparation"), preparation);
  // Persistent records sort JSON keys. Rebuild the frozen wire representation
  // rather than accidentally treating storage key order as a different source.
  const sourceBytes = publicSoftwareSourceBytes(preparation.sourcePacket ?? packet, preparation.sourceWireEncoding);
  if (hash(sourceBytes) !== sourceHash) throw new Error("SOFTWARE_SOURCE_PACKAGE_CHANGED");
  const primary = createNativeSoftwareRuntime({ directory: path.join(directory, "primary"), profile, packet, sourceHash,
    namespace: `${program.programHash}:primary:${compilation.finalNodeId}`, expiresAt: retentionEndsAt, fetchImpl, clock });
  const deno = preparation.portableFunction?.recoveryProvider === "deno";
  const recovery = deno
    ? (dependencies.createDenoRuntime ?? createDenoDeployRuntime)({ directory: path.join(directory, "recovery"), connection: profile.denoDeploy,
      packet, sourceHash, namespace: `${program.programHash}:recovery:${compilation.finalNodeId}`, expiresAt: retentionEndsAt, fetchImpl, clock })
    : preparation.portableFunction
    ? (dependencies.createNeonFunctionRuntime ?? createNeonJsonFunctionRuntime)({ directory: path.join(directory, "recovery"), profile,
      portableFunction: preparation.portableFunction, sourceHash, expiresAt: retentionEndsAt, fetchImpl, clock })
    : createNativeSoftwareRuntime({ directory: path.join(directory, "recovery"), profile, packet, sourceHash,
      namespace: `${program.programHash}:recovery:${compilation.finalNodeId}`, expiresAt: retentionEndsAt, fetchImpl, clock });
  const independentRecovery = !!preparation.portableFunction;
  const credentials = read(profile.github.credentialsFile).githubReleaseAsset;
  const capturedGitHubFetch = async (url, init) => {
    const response = await fetchImpl(url, init), bytes = Buffer.from(await response.clone().arrayBuffer());
    writeOnce(file(`github-source-${randomUUID()}`), { sourceKind: "GITHUB_SOFTWARE_COPY", method: init?.method ?? "GET",
      url: String(url).split("?")[0], observedAt: clock(), status: response.status, bodyBase64: bytes.toString("base64") });
    return response;
  };
  const copy = createGitHubReleaseAssetProductionRecoveryAdapterV2({ ...profile.github,
    apiToken: credentials.contentsWriteApiToken, artifactBytes: sourceBytes, fetchImpl: capturedGitHubFetch,
    immutableReleasePolicyProbe: createGitHubImmutableReleasePolicyProductionProbeV1({ ...profile.github,
      apiToken: credentials.administrationReadApiToken, administrationReadCapabilityConfirmed: true, fetchImpl: capturedGitHubFetch }) });
  const observer = (dependencies.createObserver ?? createGlobalpingExactHttpObserverV2)({ directory: path.join(directory, "observer"), clock });
  const root = packet.checks.find(test => test.method === "GET" && test.path === "/");
  const rootHash = hash(Buffer.from(root.expectedBody));
  const handoff = existsSync(file("retention-handoff"));
  let retained = handoff;
  const wrap = runtime => ({ providerRef: runtime.providerRef ?? "cloudflare", reserve: () => runtime.reserve(), execute: () => runtime.exercise(),
    release: () => retained && Date.parse(clock()) < Date.parse(retentionEndsAt)
      ? { status: "CLOSED", receipt: { retainedForUserUntil: retentionEndsAt } } : runtime.release(),
    closeObligation: ({ obligation }) => { retained = true; writeOnce(file("retention-handoff"), { retentionEndsAt, obligationId: obligation.obligationId });
      return { status: "CLOSED", receipt: { retainedForUserUntil: retentionEndsAt } }; } });
  const adapters = { software_primary: wrap(primary), software_recovery: wrap(recovery), software_copy: { providerRef: "github",
    async reserve(context) {
      if (existsSync(file("copy-allocation"))) return read(file("copy-allocation"));
      const result = await copy.reserve(context); writeOnce(file("copy-allocation"), result); return result;
    }, execute: context => copy.execute(context), release: context => retained && Date.parse(clock()) < Date.parse(retentionEndsAt)
      ? { status: "CLOSED", receipt: { retainedForUserUntil: retentionEndsAt } } : copy.release(context) },
    software_observer: { providerRef: "globalping",
      async reserve({ operationId }) {
        const observed = await observer.observe({ operationId: `${operationId}_ready`, targetUrl: read(file("copy-allocation")).adapterState.routeUrl });
        if (observed.status !== 200 || observed.bodyHash !== hash(sourceBytes)) throw new Error("SOFTWARE_SOURCE_WITNESS_NOT_READY");
        return { status: "READY_ON_DEMAND", reservationId: `software-observe:${operationId}`,
          validUntil: program.completionDeadline, capacityReserved: false, providerReceipt: observed };
      },
      async observe({ operationId }) {
        const observationStartedAt = clock();
        const [p, r] = await Promise.all([primary.exercise(), recovery.exercise()]);
        const copyAllocation = read(file("copy-allocation"));
        const targets = [[primary.routeUrl, rootHash], [recovery.routeUrl, rootHash, independentRecovery ? hash(Buffer.from(canonicalizeStrict(preparation.portableFunction.metadata))) : null], [copyAllocation.adapterState.routeUrl, hash(sourceBytes)]];
        if (independentRecovery) {
          const access = await recovery.access();
          for (const test of preparation.portableFunction.packet.checks) {
            const query = new URLSearchParams({ input: JSON.stringify(test.input) });
            const expected = hash(Buffer.from(canonicalizeStrict(test.expected)));
            targets.push([new URL(`/evaluate?${query}`, primary.routeUrl).href, null, expected], [`${access.observeUrl ?? access.invokeUrl}?${query}`, null, expected]);
          }
        }
        const attempts = await Promise.allSettled(targets.map(async ([targetUrl, expectedBodyHash, expectedCanonicalHash], index) => {
          const result = await observer.observe({ operationId: `${operationId}_${index}`, targetUrl });
          return { result, matched: result.status === 200 && (expectedCanonicalHash ? result.canonicalJsonHash === expectedCanonicalHash : result.bodyHash === expectedBodyHash) };
        }));
        const rejected = attempts.find(row => row.status === "rejected");
        if (rejected) {
          const code = rejected.reason?.outsiderCode;
          if (!["EXACT_FINAL_BODY_UNAVAILABLE", "EXACT_HTTP_RESULT_UNAVAILABLE", "MEASUREMENT_POLL_EXHAUSTED"].includes(code)) throw rejected.reason;
          // A new runtime can be reachable locally before every edge serves it.
          // Keep the failed measurement, and let the original program schedule
          // a new observation occurrence instead of replaying that same sample.
          return { status: "INCONCLUSIVE", reason: `GLOBALPING_${code}`, observationStartedAt, observedAt: clock(),
            retryAfter: new Date(Date.parse(clock()) + 5000).toISOString(), runtimeChecks: [p, r],
            completedObservations: attempts.filter(row => row.status === "fulfilled").map(row => row.value),
            independentPostObservation: false, recoveryProviderIndependent: independentRecovery, continuousUptimeGuaranteed: false };
        }
        const observed = attempts.map(row => row.value);
        return { status: p.status === "SUCCEEDED" && r.status === "SUCCEEDED" && observed.every(row => row.matched) ? "SATISFIED" : "NOT_SATISFIED",
          observationStartedAt, observedAt: clock(), runtimeChecks: [p, r], independentlyObservedRootAndSource: observed,
          independentPostObservation: false, independentGetComputationCases: independentRecovery ? preparation.portableFunction.packet.checks.length * 2 : 0,
          recoveryProviderIndependent: independentRecovery, continuousUptimeGuaranteed: false };
      }, release: () => ({ status: "CLOSED", receipt: { noProbeLease: true } }) } };
  return { resourceBindings: { adapters, bindings: { runtime_primary: "software_primary", runtime_recovery: "software_recovery",
    source_copy: "software_copy", independent_read: "software_observer" } },
    async deliveryDescriptor() { return { primaryUrl: primary.routeUrl, alternateUrl: recovery.routeUrl,
      portableCopyUrl: read(file("copy-allocation")).adapterState.routeUrl, sourceHash, availableUntil: retentionEndsAt,
      httpChecks: packet.checks.map(({ expectedBody, body, ...test }) => test), executableModuleCount: Object.keys(packet.files).length,
      executionMode: preparation.executionMode, recoveryProviderIndependent: independentRecovery,
      ...(independentRecovery ? { capability: preparation.portableFunction.metadata.capability, functionHash: preparation.portableFunction.functionHash,
        invocation: { primary: { providerRef: "cloudflare", url: new URL("/evaluate", primary.routeUrl).href, bodyMode: "DIRECT_JSON" },
          alternate: deno ? { providerRef: "deno", url: (await recovery.access()).invokeUrl, bodyMode: "DIRECT_JSON" }
            : { providerRef: "neon", url: (await recovery.access()).invokeUrl, bodyMode: "INPUT_FIELD",
              publicAnonymousTokenUrl: (await recovery.access()).publicAnonymousTokenUrl } },
        portabilityScope: "SYNCHRONOUS_PUBLIC_JSON_FUNCTION_NOT_GENERAL_NODE_OR_HTTP_SERVER" } : {}),
      ...(preparation.externalBuild ? { build: { runUrl: preparation.externalBuild.runUrl, runId: preparation.externalBuild.runId,
        workflowCommit: preparation.externalBuild.workflowCommit, compiler: preparation.externalBuild.compiler,
        artifactHash: preparation.externalBuild.artifactHash, localCompilationUsed: false } } : {}) }; },
    async cleanupComposed(result, prefix) {
      if (Date.parse(clock()) < Date.parse(retentionEndsAt) || existsSync(file("expiry-cleanup"))) return null;
      retained = false;
      const allocation = existsSync(file("copy-allocation")) ? read(file("copy-allocation")) : null;
      const releases = await Promise.all([primary.release(), recovery.release(), allocation?.status === "RESERVED" ? copy.release({ program,
        requirement: program.requirements.find(row => row.requirementId === `${prefix}source_copy`),
        reservation: allocation, operationId: `software-expiry:${program.programHash}` }) : { status: "CLOSED", receipt: { sourceCopyNeverAllocated: true } }]);
      writeOnce(file("expiry-cleanup"), { completedAt: clock(), releases }); return { completedAt: clock(), releasedCount: releases.length };
    },
  };
}
