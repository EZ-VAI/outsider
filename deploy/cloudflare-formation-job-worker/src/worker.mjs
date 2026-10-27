import { createHash, timingSafeEqual } from "node:crypto";

import { canonicalizeStrict } from "../../../src/canonical.js";
import {
  createCloudflareSqliteDurableObjectFormationJobStoreV1,
} from "../../../src/outsider-cloudflare-sqlite-do-formation-job-store-v1.js";
import {
  createFormationJobWorkerV1,
  formationJobIdentityV1,
  OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY,
} from "../../../src/outsider-formation-job-worker-v1.js";
import {
  classifyOutcomeCommitReadinessV1,
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY,
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_MANIFEST,
  prepareFormationRecoveryOptionsV1,
  prepareOutcomeOsV1,
} from "../../../src/outsider-three-layer-outcome-product-contract-v1.js";
import {
  createOutcomeOsLifecycleRuntimeV1,
  OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY,
  OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES,
  OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS,
  replayOutcomeOsLifecycleV1,
} from "../../../src/outsider-outcome-os-lifecycle-v1.js";
import {
  appendAgentNeutralRouteProposalV1,
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_BOUNDARY,
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS,
  replayAgentNeutralRouteProposalRegistryV1,
} from "../../../src/outsider-agent-neutral-route-proposal-registry-v1.js";
import {
  OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_FAILURE_DOMAIN_STATUSES,
  OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_MECHANISMS,
  OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_SCHEMA,
  prepareRecoveryOptionPortfolioV2,
} from "../../../src/outsider-recovery-option-portfolio-v2.js";
import {
  createOutcomeStandardBindingV1,
  OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BINDING_KINDS,
  OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY,
  OUTSIDER_OUTCOME_STANDARD_BINDING_V1_SCHEMAS,
  OUTSIDER_OUTCOME_STANDARD_BINDING_V1_STANDARDS,
} from "../../../src/outsider-outcome-standard-binding-v1.js";
import {
  deriveUserHeldFormationExecutorCapabilityHashV1,
  normalizeUserHeldFormationExecutionClaimRequestV1,
  normalizeUserHeldFormationExecutionResultSubmissionV1,
  OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_BOUNDARY,
  OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS,
} from "../../../src/outsider-user-held-formation-executor-protocol-v1.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const USER_HELD_ORDER_ID = /^order:uhf:[a-f0-9]{64}$/u;
const MAX_JOB_BYTES = 16 * 1024;
const API_VERSION = "2.5.0";
const API_SCHEMAS = Object.freeze({
  manifest: "outsider/three-layer-outcome-http-api-manifest/v1",
  outcomePrepareRequest: "outsider/outcome-os-prepare-request/v1",
  outcomePrepareResponse: "outsider/outcome-os-prepare-response/v1",
  recoveryPrepareRequest:
    "outsider/formation-recovery-options-prepare-request/v1",
  recoveryPrepareResponse:
    "outsider/formation-recovery-options-prepare-response/v1",
  recoveryOptionPortfolioPrepareRequest:
    "outsider/recovery-option-portfolio-prepare-request/v2",
  recoveryOptionPortfolioPrepareResponse:
    "outsider/recovery-option-portfolio-prepare-response/v2",
  standardBindingCreateRequest:
    "outsider/outcome-standard-binding-create-request/v1",
  standardBindingCreateResponse:
    "outsider/outcome-standard-binding-create-response/v1",
  commitReadinessRequest:
    "outsider/outcome-commit-readiness-evaluate-request/v1",
  commitReadinessResponse:
    "outsider/outcome-commit-readiness-evaluate-response/v1",
  legacyStatus: "outsider/three-layer-legacy-formation-status/v1",
  lifecycleCreateRequest: "outsider/outcome-os-lifecycle-create-request/v1",
  lifecycleAppendRequest: "outsider/outcome-os-lifecycle-append-request/v1",
  lifecycleOperationResponse:
    "outsider/outcome-os-lifecycle-durable-operation-response/v1",
  lifecycleReadResponse:
    "outsider/outcome-os-lifecycle-durable-read-response/v1",
  lifecycleReplayResponse:
    "outsider/outcome-os-lifecycle-durable-replay-response/v1",
  routeProposalAppendRequest:
    "outsider/agent-neutral-route-proposal-append-request/v1",
  routeProposalOperationResponse:
    "outsider/agent-neutral-route-proposal-durable-operation-response/v1",
  routeProposalReadResponse:
    "outsider/agent-neutral-route-proposal-durable-read-response/v1",
  clientExecutionPublishRequest:
    "outsider/user-held-formation-execution-publish-request/v1",
  clientExecutionPublishResponse:
    "outsider/user-held-formation-execution-publish-response/v1",
  clientExecutionReadResponse:
    "outsider/user-held-formation-execution-read-response/v1",
  internalLifecycleEventChain:
    "outsider/internal-outcome-os-lifecycle-event-chain/v1",
});
const CONTRACT_ID = /^contract_[a-f0-9]{32}$/u;
const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function json(status, value) {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: JSON_HEADERS,
  });
}

function exact(value, fields) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Reflect.ownKeys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function apiEnvelope(value, schema, fields) {
  if (!exact(value, ["schema", ...fields])) {
    throw new Error("API_REQUEST_FIELDS_INVALID");
  }
  if (value.schema !== schema) throw new Error("API_REQUEST_SCHEMA_INVALID");
  return value;
}

function apiManifest() {
  return Object.freeze({
    schema: API_SCHEMAS.manifest,
    apiVersion: API_VERSION,
    service: "outsider-formation-job-worker",
    agentNeutral: true,
    productContract:
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_MANIFEST,
    outcomeOsLifecycleContract: Object.freeze({
      schemas: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS,
      eventTypes: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES,
      boundary: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY,
    }),
    routeProposalRegistryContract: Object.freeze({
      schemas: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_SCHEMAS,
      boundary: OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_BOUNDARY,
    }),
    typedLayerTwoContract: Object.freeze({
      schema: OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_SCHEMA,
      schemaVersion: "2.0.0",
      recoveryMechanisms:
        OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_MECHANISMS,
      failureDomainStatuses:
        OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_FAILURE_DOMAIN_STATUSES,
      semantics: Object.freeze({
        primaryOptionRequired: true,
        recoveryOptionRequired: true,
        latestSafeExerciseTimeRequired: true,
        exerciseAuthorityReferenceRequired: true,
        cancellationReferenceRequired: true,
        exclusiveExerciseSemantics:
          "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
        typedFailureDomainComparisonPerformed: true,
        structuralReferencesEstablishExternalCapacity: false,
        structuralReferencesEstablishHeldRecoveryOption: false,
        structuralPreparationPermitsLayerTwoPromotion: false,
      }),
    }),
    standardBindingContract: Object.freeze({
      schemas: OUTSIDER_OUTCOME_STANDARD_BINDING_V1_SCHEMAS,
      acceptedStandardNames:
        OUTSIDER_OUTCOME_STANDARD_BINDING_V1_STANDARDS,
      acceptedBindingKinds:
        OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BINDING_KINDS,
      compatibilityOnly: true,
      sourceReportOnly: true,
      boundary: OUTSIDER_OUTCOME_STANDARD_BINDING_V1_BOUNDARY,
    }),
    userHeldExecutorContract: Object.freeze({
      schemas: OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS,
      transport: "USER_OWNED_OUTBOUND_CLAIM_AND_RESULT",
      durableStates: Object.freeze([
        "PUBLISHED", "CLAIMED", "EXPIRED_HOLD", "COMPLETE",
      ]),
      firstClaimReturnsInvocation: true,
      repeatedUnclosedClaimReturnsHold: true,
      claimAndReceiptRequirePublishedOrderScopedExecutorBearer: true,
      expiredEffectfulLeaseDisposition:
        "EXPIRED_HOLD_NEW_VERSIONED_ATTEMPT_REQUIRED",
      automaticReassignmentAfterClaim: false,
      boundary: OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_BOUNDARY,
    }),
    routes: Object.freeze([
      Object.freeze({ method: "GET", path: "/v1/outcomes/capabilities",
        layer: "MANIFEST", effect: "NONE", authentication: "PUBLIC",
        responseSchema: API_SCHEMAS.manifest }),
      Object.freeze({ method: "POST", path: "/v1/outcomes/prepare",
        layer: "OUTCOME_OS", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.outcomePrepareRequest,
        responseSchema: API_SCHEMAS.outcomePrepareResponse }),
      Object.freeze({ method: "POST", path: "/v1/outcome-os-lifecycles",
        layer: "OUTCOME_OS", effect: "DURABLE_APPEND_ONLY_CREATE",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.lifecycleCreateRequest,
        responseSchema: API_SCHEMAS.lifecycleOperationResponse }),
      Object.freeze({ method: "GET",
        path: "/v1/outcome-os-lifecycles/{contractId}",
        layer: "OUTCOME_OS", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        responseSchema: API_SCHEMAS.lifecycleReadResponse }),
      Object.freeze({ method: "POST",
        path: "/v1/outcome-os-lifecycles/{contractId}/events",
        layer: "OUTCOME_OS", effect: "DURABLE_APPEND_ONLY_SUCCESSOR",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.lifecycleAppendRequest,
        responseSchema: API_SCHEMAS.lifecycleOperationResponse }),
      Object.freeze({ method: "GET",
        path: "/v1/outcome-os-lifecycles/{contractId}/replay",
        layer: "OUTCOME_OS", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        responseSchema: API_SCHEMAS.lifecycleReplayResponse }),
      Object.freeze({ method: "POST",
        path: "/v1/outcomes/{contractId}/route-proposals",
        layer: "OUTCOME_OS", effect: "DURABLE_APPEND_ONLY_PROPOSAL",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.routeProposalAppendRequest,
        responseSchema: API_SCHEMAS.routeProposalOperationResponse }),
      Object.freeze({ method: "GET",
        path: "/v1/outcomes/{contractId}/route-proposals",
        layer: "OUTCOME_OS", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        responseSchema: API_SCHEMAS.routeProposalReadResponse }),
      Object.freeze({ method: "POST", path: "/v1/recovery-options/prepare",
        layer: "FORMATION_RECOVERY_OPTIONS", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.recoveryPrepareRequest,
        responseSchema: API_SCHEMAS.recoveryPrepareResponse }),
      Object.freeze({ method: "POST",
        path: "/v1/recovery-option-portfolios/prepare",
        layer: "FORMATION_RECOVERY_OPTIONS", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.recoveryOptionPortfolioPrepareRequest,
        responseSchema: API_SCHEMAS.recoveryOptionPortfolioPrepareResponse }),
      Object.freeze({ method: "POST", path: "/v1/standard-bindings/create",
        layer: "OUTCOME_OS_COMPATIBILITY", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.standardBindingCreateRequest,
        responseSchema: API_SCHEMAS.standardBindingCreateResponse }),
      Object.freeze({ method: "POST", path: "/v1/commit-readiness/evaluate",
        layer: "OUTCOME_COMMIT", effect: "NONE",
        authentication: "OUTCOME_OS_API_BEARER",
        requestSchema: API_SCHEMAS.commitReadinessRequest,
        responseSchema: API_SCHEMAS.commitReadinessResponse }),
      Object.freeze({ method: "GET", path: "/v1/outcomes/{jobKey}/status",
        layer: "CROSS_LAYER_STATUS", effect: "NONE",
        authentication: "FORMATION_DISPATCH_BEARER",
        responseSchema: API_SCHEMAS.legacyStatus }),
      Object.freeze({ method: "POST", path: "/v1/formation-jobs",
        layer: "LEGACY_DETERMINISTIC_EXECUTION", effect: "EXECUTOR_DEFINED",
        authentication: "FORMATION_DISPATCH_BEARER",
        requestSchema: "outsider/formation-job/v1" }),
      Object.freeze({ method: "GET", path: "/v1/formation-jobs/{jobKey}",
        layer: "LEGACY_DETERMINISTIC_EXECUTION", effect: "NONE",
        authentication: "FORMATION_DISPATCH_BEARER" }),
      Object.freeze({ method: "POST", path: "/v1/client-executions",
        layer: "FORMATION_USER_HELD_EXECUTION",
        effect: "DURABLE_HASH_ONLY_PUBLISH",
        authentication: "FORMATION_DISPATCH_BEARER",
        requestSchema: API_SCHEMAS.clientExecutionPublishRequest,
        responseSchema: API_SCHEMAS.clientExecutionPublishResponse }),
      Object.freeze({ method: "POST", path: "/v1/client-execution-claims",
        layer: "FORMATION_USER_HELD_EXECUTION",
        effect: "DURABLE_ONE_TIME_CLAIM",
        authentication: "ORDER_SCOPED_EXECUTOR_BEARER",
        requestSchema:
          OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimRequest,
        responseSchema:
          OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimResponse }),
      Object.freeze({ method: "POST",
        path: "/v1/client-executions/{jobKey}/receipt",
        layer: "FORMATION_USER_HELD_EXECUTION",
        effect: "DURABLE_HASH_ONLY_RECEIPT",
        authentication: "ORDER_SCOPED_EXECUTOR_BEARER",
        requestSchema:
          OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.resultSubmission,
        responseSchema:
          OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.completionAck }),
      Object.freeze({ method: "GET",
        path: "/v1/client-executions/{jobKey}",
        layer: "FORMATION_USER_HELD_EXECUTION", effect: "NONE",
        authentication: "FORMATION_DISPATCH_BEARER",
        responseSchema: API_SCHEMAS.clientExecutionReadResponse }),
    ]),
    boundary: Object.freeze({
      ...OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY,
      naturalLanguageAccepted: false,
      rawPersonalDataAccepted: false,
      credentialMaterialAccepted: false,
      paymentMaterialAccepted: false,
      preparationPersistsState: false,
      preparationReservesCapacity: false,
      callerReferencesEstablishRecoveryOptionReadiness: false,
      layerTwoPromotionPermitted: false,
      readinessEvaluationIssuesCommit: false,
      lifecycleAppendOnlyPersistence: true,
      lifecycleInPlaceMutationAllowed: false,
      routeProposalRegistryAppendOnlyPersistence: true,
      routeProposalRawEventsProjected: false,
      routeProposalCreatesSelectionOrCapacity: false,
      typedLayerTwoPreparationEstablishesExternalCapacity: false,
      typedLayerTwoPreparationEstablishesHeldRecoveryOption: false,
      standardBindingCompatibilityOnly: true,
      standardBindingSourceReportOnly: true,
      externalStandardStateAcceptedAsOutcomeTruth: false,
      externalStandardReceiptAcceptedAsOutcomeTruth: false,
      userHeldExecutorPrivateParametersAccepted: false,
      userHeldExecutorUnkeyedPrivateHashesAccepted: false,
      repeatedUnclosedClientClaimReturnsInvocation: false,
      clientClaimAutomaticallyReassigned: false,
      clientExecutorReceiptAcceptedAsIndependentOutcomeTruth: false,
      outcomeOsApiAndFormationDispatchAuthSeparated: true,
      outcomeApiCredentialCanDispatchFormationJobs: false,
      authorityMinted: false,
      outcomePromiseIssued: false,
    }),
  });
}

function prepareOutcomeOsFromHttp(value) {
  const request = apiEnvelope(value, API_SCHEMAS.outcomePrepareRequest,
    ["requestIdHash", "outcomeDefinitionHash", "acceptancePredicateHash",
      "formationDeadline", "completionDeadline", "maximumLossConstraintHash",
      "typedGraphRefs", "outcomeProgramHash"]);
  const artifact = prepareOutcomeOsV1({
    requestIdHash: request.requestIdHash,
    outcomeDefinitionHash: request.outcomeDefinitionHash,
    acceptancePredicateHash: request.acceptancePredicateHash,
    formationDeadline: request.formationDeadline,
    completionDeadline: request.completionDeadline,
    maximumLossConstraintHash: request.maximumLossConstraintHash,
    typedGraphRefs: request.typedGraphRefs,
    outcomeProgramHash: request.outcomeProgramHash,
  });
  return Object.freeze({
    schema: API_SCHEMAS.outcomePrepareResponse,
    apiVersion: API_VERSION,
    ok: true,
    layer: "OUTCOME_OS",
    artifact,
    externalEffect: "NONE",
    authorityMinted: false,
    outcomePromiseIssued: false,
  });
}

function prepareRecoveryOptionsFromHttp(value) {
  const request = apiEnvelope(value, API_SCHEMAS.recoveryPrepareRequest,
    ["outcomeOs", "observedAt", "recoveryTriggerPolicyRefHash",
      "routeOptions"]);
  const artifact = prepareFormationRecoveryOptionsV1({
    outcomeOs: request.outcomeOs,
    observedAt: request.observedAt,
    recoveryTriggerPolicyRefHash: request.recoveryTriggerPolicyRefHash,
    routeOptions: request.routeOptions,
  });
  return Object.freeze({
    schema: API_SCHEMAS.recoveryPrepareResponse,
    apiVersion: API_VERSION,
    ok: true,
    layer: "FORMATION_RECOVERY_OPTIONS",
    artifact,
    externalEffect: "NONE",
    authorityMinted: false,
    outcomePromiseIssued: false,
  });
}

function prepareRecoveryOptionPortfolioFromHttp(value) {
  const request = apiEnvelope(value,
    API_SCHEMAS.recoveryOptionPortfolioPrepareRequest,
    ["outcomeOs", "observedAt", "primaryOption", "recoveryOptions"]);
  const artifact = prepareRecoveryOptionPortfolioV2({
    outcomeOs: request.outcomeOs,
    observedAt: request.observedAt,
    primaryOption: request.primaryOption,
    recoveryOptions: request.recoveryOptions,
  });
  return Object.freeze({
    schema: API_SCHEMAS.recoveryOptionPortfolioPrepareResponse,
    apiVersion: API_VERSION,
    ok: true,
    layer: "FORMATION_RECOVERY_OPTIONS",
    artifact,
    externalEffect: "NONE",
    externalCapacityEstablished: false,
    recoveryOptionHeld: false,
    layerTwoPromotionPermitted: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function createStandardBindingFromHttp(value) {
  const request = apiEnvelope(value, API_SCHEMAS.standardBindingCreateRequest,
    ["standardName", "standardVersion", "standardRevisionHash",
      "sourcePayloadHash", "outsiderOutcomeArtifactHash",
      "outsiderLifecycleHeadHash", "bindingKind"]);
  const receipt = createOutcomeStandardBindingV1({
    standardName: request.standardName,
    standardVersion: request.standardVersion,
    standardRevisionHash: request.standardRevisionHash,
    sourcePayloadHash: request.sourcePayloadHash,
    outsiderOutcomeArtifactHash: request.outsiderOutcomeArtifactHash,
    outsiderLifecycleHeadHash: request.outsiderLifecycleHeadHash,
    bindingKind: request.bindingKind,
  });
  return Object.freeze({
    schema: API_SCHEMAS.standardBindingCreateResponse,
    apiVersion: API_VERSION,
    ok: true,
    compatibilityPlane: "OUTCOME_STANDARD_BINDING",
    compatibilityOnly: true,
    sourceReportOnly: true,
    receipt,
    externalEffect: "NONE",
    authorityMinted: false,
    capacityEstablished: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function classifyCommitReadinessFromHttp(value) {
  const request = apiEnvelope(value, API_SCHEMAS.commitReadinessRequest,
    ["formationRecoveryOptions", "observedAt", "selectedOptions",
      "commitReferences"]);
  const classification = classifyOutcomeCommitReadinessV1({
    formationRecoveryOptions: request.formationRecoveryOptions,
    observedAt: request.observedAt,
    selectedOptions: request.selectedOptions,
    commitReferences: request.commitReferences,
  });
  return Object.freeze({
    schema: API_SCHEMAS.commitReadinessResponse,
    apiVersion: API_VERSION,
    ok: true,
    layer: "OUTCOME_COMMIT",
    classification,
    externalEffect: "NONE",
    authorityMinted: false,
    outcomePromiseIssued: false,
  });
}

function bearerConfigured(value) {
  const secret = String(value ?? "");
  return secret.length >= 32 && secret.length <= 512;
}

function bearerAuthorized(request, secretValue) {
  const expected = String(secretValue ?? "");
  if (expected.length < 32 || expected.length > 512) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = createHash("sha256").update(presented).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right) && presented.length === expected.length;
}

function outcomeApiAuthorized(request, env) {
  return bearerAuthorized(request, env.OUTCOME_OS_API_BEARER_TOKEN);
}

function formationDispatchAuthorized(request, env) {
  return bearerAuthorized(request, env.FORMATION_DISPATCH_BEARER_TOKEN);
}

function presentedBearer(request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const value = header.slice(7);
  return value.length >= 32 && value.length <= 512
    && !/[\u0000-\u0020\u007f]/u.test(value) ? value : null;
}

function outcomeApiPath(pathname) {
  return pathname === "/v1/outcomes/prepare"
    || pathname === "/v1/recovery-options/prepare"
    || pathname === "/v1/recovery-option-portfolios/prepare"
    || pathname === "/v1/standard-bindings/create"
    || pathname === "/v1/commit-readiness/evaluate"
    || pathname === "/v1/outcome-os-lifecycles"
    || /^\/v1\/outcomes\/contract_[a-f0-9]{32}\/route-proposals$/u
      .test(pathname)
    || /^\/v1\/outcome-os-lifecycles\/contract_[a-f0-9]{32}(?:\/events|\/replay)?$/u
      .test(pathname);
}

function formationDispatchPath(pathname) {
  return pathname === "/v1/formation-jobs"
    || pathname === "/v1/client-executions"
    || /^\/v1\/client-executions\/sha256:[a-f0-9]{64}$/u
      .test(pathname)
    || /^\/v1\/formation-jobs\/sha256:[a-f0-9]{64}$/u.test(pathname)
    || /^\/v1\/outcomes\/sha256:[a-f0-9]{64}\/status$/u.test(pathname);
}

function userHeldExecutorPath(pathname) {
  return pathname === "/v1/client-execution-claims"
    || /^\/v1\/client-executions\/sha256:[a-f0-9]{64}\/receipt$/u
      .test(pathname);
}

async function jsonBody(request) {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("CONTENT_TYPE_INVALID");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^[0-9]{1,6}$/u.test(declared)
    || Number(declared) > MAX_JOB_BYTES)) throw new Error("BODY_TOO_LARGE");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 1 || bytes.length > MAX_JOB_BYTES) {
    throw new Error("BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("BODY_INVALID_JSON");
  }
}

function allowlist(env) {
  let value;
  try { value = JSON.parse(String(env.FORMATION_EXECUTOR_ALLOWLIST_JSON ?? "[]")); }
  catch { return []; }
  if (!Array.isArray(value) || value.length > 256) return [];
  const seen = new Set();
  const accepted = [];
  for (const item of value) {
    if (!exact(item, ["adapterId", "adapterVersion", "planHash"])
      || typeof item.adapterId !== "string"
      || typeof item.adapterVersion !== "string"
      || !HASH.test(String(item.planHash ?? ""))) return [];
    const key = `${item.adapterId}\0${item.adapterVersion}\0${item.planHash}`;
    if (seen.has(key)) return [];
    seen.add(key);
    accepted.push(Object.freeze({ ...item }));
  }
  return accepted;
}

function executorResolver(env) {
  const accepted = allowlist(env);
  return async (binding) => {
    const selected = accepted.find((item) =>
      item.adapterId === binding.adapterId
      && item.adapterVersion === binding.adapterVersion
      && item.planHash === binding.planHash);
    if (selected === undefined) return null;
    const service = env.DETERMINISTIC_EXECUTOR;
    if (service === null || typeof service !== "object"
      || typeof service.fetch !== "function") return null;
    return Object.freeze({
      async executeFrozenPlan(input) {
        const requestBody = {
          schema: "outsider/formation-executor-invocation/v1",
          job: input.job,
          jobHash: input.jobHash,
          jobKey: input.jobKey,
        };
        const response = await service.fetch(new Request(
          "https://deterministic-executor.internal/v1/execute-frozen-plan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: canonicalizeStrict(requestBody),
          }));
        if (response.status !== 200) throw new Error("EXECUTOR_HTTP_FAILED");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 1 || bytes.length > MAX_JOB_BYTES) {
          throw new Error("EXECUTOR_RESPONSE_TOO_LARGE");
        }
        try {
          return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        } catch {
          throw new Error("EXECUTOR_RESPONSE_INVALID");
        }
      },
    });
  };
}

async function executorReadiness(env) {
  const service = env.DETERMINISTIC_EXECUTOR;
  if (service === null || typeof service !== "object"
    || typeof service.fetch !== "function") {
    return Object.freeze({ bound: false, configurationReady: false });
  }
  try {
    const response = await service.fetch(new Request(
      "https://deterministic-executor.internal/healthz", { method: "GET" }));
    if (response.status !== 200) {
      return Object.freeze({ bound: true, configurationReady: false });
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 2 || bytes.length > MAX_JOB_BYTES) {
      return Object.freeze({ bound: true, configurationReady: false });
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true })
      .decode(bytes));
    return Object.freeze({
      bound: true,
      configurationReady: value?.configurationReady === true
        && value?.productionExecutionReady === true,
    });
  } catch {
    return Object.freeze({ bound: true, configurationReady: false });
  }
}

function errorCode(error) {
  return String(error?.outsiderCode ?? error?.message ?? error)
    .split(":", 1)[0];
}

function errorResponse(error) {
  const code = errorCode(error);
  const status = code === "CLIENT_EXECUTOR_UNAUTHORIZED" ? 401
    : code.includes("NOT_YET_VALID") || code.includes("CONFLICT")
    || code === "EXPECTED_HEAD_HASH_MISMATCH"
    || code === "EXPECTED_REGISTRY_HEAD_HASH_MISMATCH"
    || code === "OCCURRENCE_REF_DUPLICATE"
    ? 409 : code.includes("TOO_LARGE") ? 413
      : code.includes("CONTENT_TYPE") ? 415
        : code.includes("NOT_FOUND") ? 404
        : code.includes("STORED_") || code.includes("READBACK")
          || code.includes("STORE_") || code.includes("STORAGE_") ? 500 : 400;
  return json(status, { ok: false,
    error: status === 500 ? "DURABLE_STATE_INVALID"
      : status === 401 ? "UNAUTHORIZED" : code });
}

function lifecycleContractId(value) {
  if (typeof value !== "string" || !CONTRACT_ID.test(value)) {
    throw new Error("CONTRACT_ID_INVALID");
  }
  return value;
}

function parseCanonicalStoredJson(value, code) {
  if (typeof value !== "string") throw new Error(code);
  let parsed;
  try { parsed = JSON.parse(value); }
  catch { throw new Error(code); }
  if (canonicalizeStrict(parsed) !== value) throw new Error(code);
  return parsed;
}

function hashValue(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(code);
  return value;
}

function instantValue(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(code);
  }
  return value;
}

function hashEqual(left, right) {
  if (!HASH.test(String(left)) || !HASH.test(String(right))) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function contentDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function normalizeUserHeldBindingProjection(value, identity) {
  const fields = ["schema", "schemaVersion", "jobKey", "jobHash",
    "planCommitmentHash", "parameterEnvelopeCommitmentHash",
    "commitmentAlgorithm", "commitmentScope", "privatePlanHashProjected",
    "privateParameterBytesProjected", "privateParameterUnkeyedHashProjected",
    "providerExchangeBytesProjected",
    "providerExchangeUnkeyedHashesProjected", "authorityMinted",
    "capacityEstablished", "independentOutcomeTruthEstablished",
    "outcomeCommitted"];
  if (!exact(value, fields)
    || value.schema
      !== OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS
        .bindingProjection
    || value.schemaVersion !== "1.0.0"
    || value.commitmentAlgorithm !== "HMAC-SHA-256"
    || value.commitmentScope !== "ORDER_SCOPED_PRIVATE_EXECUTOR"
    || !hashEqual(value.jobKey, identity.jobKey)
    || !hashEqual(value.jobHash, identity.jobHash)
    || !hashEqual(value.planCommitmentHash, identity.job.planHash)
    || !hashEqual(value.parameterEnvelopeCommitmentHash,
      identity.job.parameterEnvelopeHash)
    || fields.slice(8).some((field) => value[field] !== false)) {
    throw new Error("CLIENT_BINDING_PROJECTION_INVALID");
  }
  return Object.freeze({ ...value });
}

function normalizeClientExecutionPublishRequest(value) {
  const request = apiEnvelope(value, API_SCHEMAS.clientExecutionPublishRequest,
    ["job", "bindingProjection", "executorCapabilityHash", "publishedAt"]);
  const identity = formationJobIdentityV1(request.job);
  if (!USER_HELD_ORDER_ID.test(identity.job.orderId)) {
    throw new Error("CLIENT_PRIVATE_ORDER_ID_INVALID");
  }
  const bindingProjection = normalizeUserHeldBindingProjection(
    request.bindingProjection, identity);
  const executorCapabilityHash = hashValue(request.executorCapabilityHash,
    "EXECUTOR_CAPABILITY_HASH_INVALID");
  const publishedAt = instantValue(request.publishedAt,
    "PUBLISHED_AT_INVALID");
  if (Date.parse(publishedAt) >= Date.parse(identity.job.expiresAt)) {
    throw new Error("JOB_EXPIRED_BEFORE_PUBLICATION");
  }
  return Object.freeze({ identity, bindingProjection, executorCapabilityHash,
    publishedAt });
}

function clientExecutionPublishResponse(result) {
  return Object.freeze({
    schema: API_SCHEMAS.clientExecutionPublishResponse,
    apiVersion: API_VERSION,
    ok: true,
    state: "PUBLISHED",
    jobKey: result.jobKey,
    jobHash: result.jobHash,
    replayed: result.replayed,
    durableStorage: "SQLITE_DURABLE_OBJECT",
    privateParameterBytesStored: false,
    privateParameterUnkeyedHashStored: false,
    authorityMinted: false,
    capacityEstablished: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });
}

function clientExecutionClaimResponse(record, state) {
  const isClaimed = state === "CLAIMED";
  const isComplete = state === "COMPLETE";
  return Object.freeze({
    schema:
      OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.claimResponse,
    state,
    jobKey: record.jobKey,
    jobHash: record.jobHash,
    leaseHash: record.leaseHash,
    leaseExpiresAt: record.leaseExpiresAt,
    invocation: isClaimed ? Object.freeze({
      schema:
        OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.invocation,
      job: record.job,
      jobHash: record.jobHash,
      jobKey: record.jobKey,
    }) : null,
    completion: isComplete ? record.completion : null,
  });
}

function clientExecutionCompletionAck(submission, receiptHash,
  leaseExpiresAt, leaseExpiredBeforeReceipt) {
  return Object.freeze({
    schema:
      OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.completionAck,
    state: "COMPLETE",
    jobKey: submission.jobKey,
    jobHash: submission.jobHash,
    leaseHash: submission.leaseHash,
    submittedAt: submission.submittedAt,
    leaseExpiredBeforeReceipt: leaseExpiredBeforeReceipt
      || Date.parse(submission.submittedAt) >= Date.parse(leaseExpiresAt),
    result: submission.result,
    receiptHash,
    authorityMinted: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitted: false,
  });
}

function clientExecutionReadResponse(record) {
  const awaitingReceipt = record.state === "CLAIMED";
  return Object.freeze({
    schema: API_SCHEMAS.clientExecutionReadResponse,
    apiVersion: API_VERSION,
    ok: record.state === "COMPLETE",
    state: record.state,
    jobKey: record.jobKey,
    jobHash: record.jobHash,
    leaseHash: record.leaseHash,
    leaseExpiresAt: record.leaseExpiresAt,
    completion: record.completion,
    executionDisposition: record.state === "PUBLISHED"
      ? "AWAITING_USER_HELD_NODE_CLAIM"
      : awaitingReceipt
        ? "EFFECT_UNKNOWN_AWAITING_HASH_ONLY_RECEIPT"
        : record.state === "EXPIRED_HOLD"
          ? "LEASE_EXPIRED_EFFECT_UNKNOWN_NEW_ATTEMPT_REQUIRED"
          : "HASH_ONLY_RECEIPT_RECORDED",
    failoverDisposition: record.state === "EXPIRED_HOLD"
      ? "PUBLISH_SUCCESSOR_JOB_WITH_NEW_ATTEMPT"
      : "NOT_APPLICABLE",
    automaticRetry: false,
    automaticReassignment: false,
    executorReceiptIsIndependentOutcomeTruth: false,
    authorityMinted: false,
    capacityEstablished: false,
    outcomeCommitted: false,
  });
}

/** Durable one-job user-held execution state, colocated with FormationJobLedger. */
export function createUserHeldFormationExecutionSqliteStoreV1(input = {}) {
  if (!exact(input, ["storage", "clock"]) || typeof input.clock !== "function") {
    throw new Error("CLIENT_EXECUTION_STORE_INPUT_INVALID");
  }
  const storage = input.storage;
  if (storage === null || typeof storage !== "object"
    || typeof storage.transactionSync !== "function"
    || storage.sql === null || typeof storage.sql !== "object"
    || typeof storage.sql.exec !== "function") {
    throw new Error("CLIENT_EXECUTION_STORAGE_INVALID");
  }
  const sql = storage.sql;
  sql.exec(`CREATE TABLE IF NOT EXISTS outsider_user_held_execution_v1 (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    job_key TEXT NOT NULL UNIQUE,
    job_hash TEXT NOT NULL UNIQUE,
    job_json TEXT NOT NULL,
    binding_projection_json TEXT NOT NULL,
    executor_capability_hash TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN
      ('PUBLISHED', 'CLAIMED', 'EXPIRED_HOLD', 'COMPLETE')),
    published_at TEXT NOT NULL,
    claimed_at TEXT,
    lease_hash TEXT,
    lease_expires_at TEXT,
    completion_json TEXT
  )`);

  function row() {
    return sql.exec(`SELECT job_key, job_hash, job_json,
        binding_projection_json, executor_capability_hash, state, published_at,
        claimed_at, lease_hash, lease_expires_at, completion_json
      FROM outsider_user_held_execution_v1 WHERE singleton = 1`)
      .toArray()[0] ?? null;
  }

  function project(stored) {
    if (stored === null) return null;
    const identity = formationJobIdentityV1(parseCanonicalStoredJson(
      stored.job_json, "STORED_CLIENT_JOB_INVALID"));
    if (!hashEqual(stored.job_key, identity.jobKey)
      || !hashEqual(stored.job_hash, identity.jobHash)) {
      throw new Error("STORED_CLIENT_JOB_IDENTITY_INVALID");
    }
    const bindingProjection = normalizeUserHeldBindingProjection(
      parseCanonicalStoredJson(stored.binding_projection_json,
        "STORED_CLIENT_BINDING_INVALID"), identity);
    hashValue(stored.executor_capability_hash,
      "STORED_EXECUTOR_CAPABILITY_HASH_INVALID");
    if (!["PUBLISHED", "CLAIMED", "EXPIRED_HOLD", "COMPLETE"]
      .includes(stored.state)) {
      throw new Error("STORED_CLIENT_STATE_INVALID");
    }
    const claimed = stored.state !== "PUBLISHED";
    const complete = stored.state === "COMPLETE";
    if (claimed !== (stored.claimed_at !== null && stored.lease_hash !== null
      && stored.lease_expires_at !== null)
      || complete !== (stored.completion_json !== null)) {
      throw new Error("STORED_CLIENT_STATE_FIELDS_INVALID");
    }
    const completion = complete ? parseCanonicalStoredJson(
      stored.completion_json, "STORED_CLIENT_COMPLETION_INVALID") : null;
    return Object.freeze({ state: stored.state, job: identity.job,
      jobKey: identity.jobKey, jobHash: identity.jobHash, bindingProjection,
      executorCapabilityHash: stored.executor_capability_hash,
      publishedAt: instantValue(stored.published_at,
        "STORED_PUBLISHED_AT_INVALID"),
      claimedAt: stored.claimed_at,
      leaseHash: stored.lease_hash,
      leaseExpiresAt: stored.lease_expires_at,
      completion });
  }

  function publish(request) {
    const jobJson = canonicalizeStrict(request.identity.job);
    const bindingJson = canonicalizeStrict(request.bindingProjection);
    let result;
    storage.transactionSync(() => {
      const existing = row();
      if (existing === null) {
        sql.exec(`INSERT INTO outsider_user_held_execution_v1
          (singleton, job_key, job_hash, job_json, binding_projection_json,
            executor_capability_hash, state, published_at, claimed_at,
            lease_hash, lease_expires_at, completion_json)
          VALUES (1, ?, ?, ?, ?, ?, 'PUBLISHED', ?, NULL, NULL, NULL, NULL)`,
        request.identity.jobKey, request.identity.jobHash, jobJson, bindingJson,
        request.executorCapabilityHash, request.publishedAt);
        result = Object.freeze({ replayed: false,
          jobKey: request.identity.jobKey, jobHash: request.identity.jobHash });
        return;
      }
      if (existing.job_key !== request.identity.jobKey
        || existing.job_hash !== request.identity.jobHash
        || existing.job_json !== jobJson
        || existing.binding_projection_json !== bindingJson
        || existing.executor_capability_hash !== request.executorCapabilityHash) {
        throw new Error("CLIENT_EXECUTION_PUBLICATION_CONFLICT");
      }
      project(existing);
      result = Object.freeze({ replayed: true,
        jobKey: request.identity.jobKey, jobHash: request.identity.jobHash });
    });
    if (result === undefined) throw new Error("CLIENT_PUBLISH_RESULT_MISSING");
    return result;
  }

  function expireClaimIfNeeded(record) {
    if (record.state !== "CLAIMED") return record;
    const observedAt = instantValue(input.clock(), "CLOCK_INVALID");
    if (Date.parse(observedAt) < Date.parse(record.leaseExpiresAt)) {
      return record;
    }
    sql.exec(`UPDATE outsider_user_held_execution_v1
      SET state = 'EXPIRED_HOLD'
      WHERE singleton = 1 AND state = 'CLAIMED'`);
    const expired = project(row());
    if (expired.state !== "EXPIRED_HOLD") {
      throw new Error("CLIENT_LEASE_EXPIRY_READBACK_MISMATCH");
    }
    return expired;
  }

  function claim(rawRequest) {
    const request = normalizeUserHeldFormationExecutionClaimRequestV1(
      rawRequest);
    let response;
    storage.transactionSync(() => {
      const stored = row();
      if (stored === null) throw new Error("CLIENT_EXECUTION_NOT_FOUND");
      let record = project(stored);
      if (!hashEqual(record.jobKey, request.jobKey)
        || !hashEqual(record.jobHash, request.jobHash)) {
        throw new Error("CLIENT_EXECUTION_NOT_FOUND");
      }
      if (!hashEqual(record.executorCapabilityHash,
        request.executorCapabilityHash)) {
        throw new Error("CLIENT_EXECUTOR_UNAUTHORIZED");
      }
      if (record.state === "COMPLETE") {
        response = clientExecutionClaimResponse(record, "COMPLETE");
        return;
      }
      record = expireClaimIfNeeded(record);
      if (record.state === "EXPIRED_HOLD") {
        response = clientExecutionClaimResponse(record, "HOLD");
        return;
      }
      if (record.state === "CLAIMED") {
        response = clientExecutionClaimResponse(record, "HOLD");
        return;
      }
      const observedAt = instantValue(input.clock(), "CLOCK_INVALID");
      if (Date.parse(observedAt) < Date.parse(record.job.issuedAt)
        || Date.parse(observedAt) >= Date.parse(record.job.expiresAt)) {
        response = clientExecutionClaimResponse(record, "HOLD");
        return;
      }
      const leaseHash = contentDigest(
        "outsider/user-held-formation-lease/v1", {
          jobKey: record.jobKey,
          jobHash: record.jobHash,
          executorCapabilityHash: request.executorCapabilityHash,
          claimedAt: observedAt,
        });
      sql.exec(`UPDATE outsider_user_held_execution_v1
        SET state = 'CLAIMED', claimed_at = ?, lease_hash = ?,
          lease_expires_at = ? WHERE singleton = 1 AND state = 'PUBLISHED'`,
      observedAt, leaseHash, record.job.expiresAt);
      const claimed = project(row());
      if (claimed.state !== "CLAIMED" || !hashEqual(claimed.leaseHash,
        leaseHash)) throw new Error("CLIENT_CLAIM_READBACK_MISMATCH");
      response = clientExecutionClaimResponse(claimed, "CLAIMED");
    });
    if (response === undefined) throw new Error("CLIENT_CLAIM_RESULT_MISSING");
    return response;
  }

  function complete(rawSubmission, rawExecutorCapabilityHash) {
    const submission
      = normalizeUserHeldFormationExecutionResultSubmissionV1(rawSubmission);
    const executorCapabilityHash = hashValue(rawExecutorCapabilityHash,
      "EXECUTOR_CAPABILITY_HASH_INVALID");
    const receiptHash = contentDigest(
      "outsider/user-held-formation-execution-completion/v1", submission);
    let result;
    storage.transactionSync(() => {
      const stored = row();
      if (stored === null) throw new Error("CLIENT_EXECUTION_NOT_FOUND");
      let record = project(stored);
      if (!hashEqual(record.jobKey, submission.jobKey)
        || !hashEqual(record.jobHash, submission.jobHash)
        || !hashEqual(record.leaseHash, submission.leaseHash)) {
        throw new Error("CLIENT_RESULT_LEASE_MISMATCH");
      }
      if (!hashEqual(record.executorCapabilityHash, executorCapabilityHash)) {
        throw new Error("CLIENT_EXECUTOR_UNAUTHORIZED");
      }
      if (record.state === "COMPLETE") {
        if (!hashEqual(record.completion.receiptHash, receiptHash)) {
          throw new Error("CLIENT_RESULT_REPLAY_CONFLICT");
        }
        result = record.completion;
        return;
      }
      record = expireClaimIfNeeded(record);
      if (!["CLAIMED", "EXPIRED_HOLD"].includes(record.state)) {
        throw new Error("CLIENT_RESULT_WITHOUT_CLAIM");
      }
      const completion = clientExecutionCompletionAck(submission, receiptHash,
        record.leaseExpiresAt, record.state === "EXPIRED_HOLD");
      const completionJson = canonicalizeStrict(completion);
      sql.exec(`UPDATE outsider_user_held_execution_v1
        SET state = 'COMPLETE', completion_json = ?
        WHERE singleton = 1 AND state IN ('CLAIMED', 'EXPIRED_HOLD')`,
      completionJson);
      const readback = row();
      const completed = project(readback);
      if (completed.state !== "COMPLETE"
        || readback?.completion_json !== completionJson
        || completed.completion?.receiptHash !== receiptHash) {
        throw new Error("CLIENT_COMPLETION_READBACK_MISMATCH");
      }
      result = completed.completion;
    });
    if (result === undefined) throw new Error("CLIENT_COMPLETION_RESULT_MISSING");
    return result;
  }

  function read(jobKey) {
    hashValue(jobKey, "JOB_KEY_INVALID");
    let record;
    storage.transactionSync(() => {
      record = project(row());
      if (record !== null && hashEqual(record.jobKey, jobKey)) {
        record = expireClaimIfNeeded(record);
      }
    });
    return record !== null && hashEqual(record.jobKey, jobKey) ? record : null;
  }

  return Object.freeze({ publish, claim, complete, read });
}

function lifecycleCreateInput(value, expectedContractId) {
  const request = apiEnvelope(value, API_SCHEMAS.lifecycleCreateRequest,
    ["contractId", "outcomeOs", "expectedOutcomeOsArtifactHash",
      "recordedAt", "idempotencyKeyHash"]);
  if (lifecycleContractId(request.contractId) !== expectedContractId) {
    throw new Error("CONTRACT_ID_PATH_MISMATCH");
  }
  return Object.freeze({
    contractId: request.contractId,
    outcomeOs: request.outcomeOs,
    expectedOutcomeOsArtifactHash: request.expectedOutcomeOsArtifactHash,
    recordedAt: request.recordedAt,
    idempotencyKeyHash: request.idempotencyKeyHash,
  });
}

function lifecycleAppendInput(value) {
  const request = apiEnvelope(value, API_SCHEMAS.lifecycleAppendRequest,
    ["eventType", "recordedAt", "idempotencyKeyHash", "expectedHeadHash",
      "payload"]);
  return Object.freeze({
    eventType: request.eventType,
    recordedAt: request.recordedAt,
    idempotencyKeyHash: request.idempotencyKeyHash,
    expectedHeadHash: request.expectedHeadHash,
    payload: request.payload,
  });
}

function lifecycleOperationResponse(result) {
  return Object.freeze({
    schema: API_SCHEMAS.lifecycleOperationResponse,
    apiVersion: API_VERSION,
    ok: true,
    durableStorage: "SQLITE_DURABLE_OBJECT",
    durableStorageIoPerformed: true,
    appendOnlyPersistence: true,
    result,
    authorityMinted: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function lifecycleReadResponse(read) {
  return Object.freeze({
    schema: API_SCHEMAS.lifecycleReadResponse,
    apiVersion: API_VERSION,
    ok: true,
    durableStorage: "SQLITE_DURABLE_OBJECT",
    fullPersistedEventChainReplayed: true,
    rawEventsProjected: false,
    read,
    authorityMinted: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function lifecycleReplayResponse(replay) {
  return Object.freeze({
    schema: API_SCHEMAS.lifecycleReplayResponse,
    apiVersion: API_VERSION,
    ok: true,
    durableStorage: "SQLITE_DURABLE_OBJECT",
    fullPersistedEventChainReplayed: true,
    rawEventsProjected: false,
    replay,
    authorityMinted: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function lifecycleEventChainResponse(contractId, events) {
  return Object.freeze({
    schema: API_SCHEMAS.internalLifecycleEventChain,
    contractId,
    events,
  });
}

function routeProposalAppendInput(value) {
  const request = apiEnvelope(value, API_SCHEMAS.routeProposalAppendRequest,
    ["recordedAt", "idempotencyKeyHash", "expectedRegistryHeadHash",
      "routeProposalRefHash", "occurrenceRefHash"]);
  return Object.freeze({
    recordedAt: request.recordedAt,
    idempotencyKeyHash: request.idempotencyKeyHash,
    expectedRegistryHeadHash: request.expectedRegistryHeadHash,
    routeProposalRefHash: request.routeProposalRefHash,
    occurrenceRefHash: request.occurrenceRefHash,
  });
}

function routeProposalResultProjection(result) {
  return Object.freeze({
    receipt: result.receipt,
    head: result.head,
    idempotentReplay: result.idempotentReplay,
    eventAppended: result.eventAppended,
    fullOutcomeLifecycleReplayed: true,
    fullProposalRegistryReplayed: true,
    rawEventsProjected: false,
    routeSelected: false,
    executableCapabilityEstablished: false,
    capacityEstablished: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });
}

function routeProposalOperationResponse(result) {
  return Object.freeze({
    schema: API_SCHEMAS.routeProposalOperationResponse,
    apiVersion: API_VERSION,
    ok: true,
    durableStorage: "SQLITE_DURABLE_OBJECT",
    durableStorageIoPerformed: true,
    appendOnlyPersistence: true,
    rawEventsProjected: false,
    result: routeProposalResultProjection(result),
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function routeProposalReadResponse(replay) {
  return Object.freeze({
    schema: API_SCHEMAS.routeProposalReadResponse,
    apiVersion: API_VERSION,
    ok: true,
    durableStorage: "SQLITE_DURABLE_OBJECT",
    fullOutcomeLifecycleReplayed: true,
    fullPersistedProposalEventChainReplayed: true,
    rawEventsProjected: false,
    registry: replay,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function createOutcomeOsLifecycleSqliteStore(storage) {
  if (storage === null || typeof storage !== "object"
    || typeof storage.transactionSync !== "function"
    || storage.sql === null || typeof storage.sql !== "object"
    || typeof storage.sql.exec !== "function") {
    throw new Error("LIFECYCLE_STORAGE_INVALID");
  }
  const sql = storage.sql;
  sql.exec(`CREATE TABLE IF NOT EXISTS outsider_outcome_os_lifecycle_events_v1 (
    revision INTEGER PRIMARY KEY CHECK (revision >= 0),
    contract_id TEXT NOT NULL,
    event_hash TEXT NOT NULL UNIQUE,
    idempotency_key_hash TEXT NOT NULL UNIQUE,
    operation_hash TEXT NOT NULL,
    event_json TEXT NOT NULL
  )`);

  function events(contractId) {
    const rows = sql.exec(`SELECT revision, contract_id, event_hash,
        idempotency_key_hash, operation_hash, event_json
      FROM outsider_outcome_os_lifecycle_events_v1
      ORDER BY revision ASC`).toArray();
    return Object.freeze(rows.map((row, index) => {
      const event = parseCanonicalStoredJson(row.event_json,
        "STORED_LIFECYCLE_EVENT_INVALID");
      if (Number(row.revision) !== index
        || row.contract_id !== contractId || event.contractId !== contractId
        || row.event_hash !== event.eventHash
        || row.idempotency_key_hash !== event.idempotencyKeyHash
        || row.operation_hash !== event.operationHash
        || event.appendOnlyLineage?.revision !== index) {
        throw new Error("STORED_LIFECYCLE_EVENT_INVALID");
      }
      return event;
    }));
  }

  function insert(event) {
    const encoded = canonicalizeStrict(event);
    sql.exec(`INSERT INTO outsider_outcome_os_lifecycle_events_v1
      (revision, contract_id, event_hash, idempotency_key_hash,
        operation_hash, event_json) VALUES (?, ?, ?, ?, ?, ?)`,
    event.appendOnlyLineage.revision, event.contractId, event.eventHash,
    event.idempotencyKeyHash, event.operationHash, encoded);
    const row = sql.exec(`SELECT event_hash, event_json
      FROM outsider_outcome_os_lifecycle_events_v1 WHERE revision = ?`,
    event.appendOnlyLineage.revision).toArray()[0] ?? null;
    if (row?.event_hash !== event.eventHash || row.event_json !== encoded) {
      throw new Error("LIFECYCLE_EVENT_READBACK_MISMATCH");
    }
  }

  function apply(contractId, operation) {
    let result;
    storage.transactionSync(() => {
      const before = events(contractId);
      const runtime = createOutcomeOsLifecycleRuntimeV1({ events: before });
      result = operation(runtime);
      const after = runtime.exportEvents();
      if (result.eventAppended === true) {
        if (after.length !== before.length + 1) {
          throw new Error("LIFECYCLE_APPEND_COUNT_INVALID");
        }
        insert(after.at(-1));
      } else if (result.idempotentReplay !== true
        || after.length !== before.length) {
        throw new Error("LIFECYCLE_REPLAY_COUNT_INVALID");
      }
      const readback = events(contractId);
      if (canonicalizeStrict(readback) !== canonicalizeStrict(after)) {
        throw new Error("LIFECYCLE_EVENT_SET_READBACK_MISMATCH");
      }
    });
    if (result === undefined) throw new Error("LIFECYCLE_RESULT_MISSING");
    return result;
  }

  function runtime(contractId) {
    return createOutcomeOsLifecycleRuntimeV1({ events: events(contractId) });
  }

  return Object.freeze({ apply, runtime, events });
}

function createRouteProposalSqliteStore(storage) {
  if (storage === null || typeof storage !== "object"
    || typeof storage.transactionSync !== "function"
    || storage.sql === null || typeof storage.sql !== "object"
    || typeof storage.sql.exec !== "function") {
    throw new Error("ROUTE_PROPOSAL_STORAGE_INVALID");
  }
  const sql = storage.sql;
  sql.exec(`CREATE TABLE IF NOT EXISTS outsider_route_proposal_events_v1 (
    revision INTEGER PRIMARY KEY CHECK (revision >= 0),
    contract_id TEXT NOT NULL,
    event_hash TEXT NOT NULL UNIQUE,
    idempotency_key_hash TEXT NOT NULL UNIQUE,
    operation_hash TEXT NOT NULL,
    occurrence_ref_hash TEXT NOT NULL UNIQUE,
    event_json TEXT NOT NULL
  )`);

  function events(contractId) {
    const rows = sql.exec(`SELECT revision, contract_id, event_hash,
        idempotency_key_hash, operation_hash, occurrence_ref_hash, event_json
      FROM outsider_route_proposal_events_v1 ORDER BY revision ASC`).toArray();
    return Object.freeze(rows.map((row, index) => {
      const event = parseCanonicalStoredJson(row.event_json,
        "STORED_ROUTE_PROPOSAL_EVENT_INVALID");
      if (Number(row.revision) !== index || row.contract_id !== contractId
        || event.contractId !== contractId || row.event_hash !== event.eventHash
        || row.idempotency_key_hash !== event.idempotencyKeyHash
        || row.operation_hash !== event.operationHash
        || row.occurrence_ref_hash !== event.occurrenceRefHash
        || event.appendOnlyLineage?.revision !== index) {
        throw new Error("STORED_ROUTE_PROPOSAL_EVENT_INVALID");
      }
      return event;
    }));
  }

  function insert(event) {
    const encoded = canonicalizeStrict(event);
    sql.exec(`INSERT INTO outsider_route_proposal_events_v1
      (revision, contract_id, event_hash, idempotency_key_hash, operation_hash,
        occurrence_ref_hash, event_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    event.appendOnlyLineage.revision, event.contractId, event.eventHash,
    event.idempotencyKeyHash, event.operationHash, event.occurrenceRefHash,
    encoded);
    const row = sql.exec(`SELECT event_hash, event_json
      FROM outsider_route_proposal_events_v1 WHERE revision = ?`,
    event.appendOnlyLineage.revision).toArray()[0] ?? null;
    if (row?.event_hash !== event.eventHash || row.event_json !== encoded) {
      throw new Error("ROUTE_PROPOSAL_EVENT_READBACK_MISMATCH");
    }
  }

  function apply(contractId, outcomeLifecycleEvents, proposal) {
    let result;
    storage.transactionSync(() => {
      const before = events(contractId);
      result = appendAgentNeutralRouteProposalV1({
        outcomeLifecycleEvents,
        registryEvents: before,
        proposal,
      });
      if (result.eventAppended === true) {
        if (result.exportedEvents.length !== before.length + 1) {
          throw new Error("ROUTE_PROPOSAL_APPEND_COUNT_INVALID");
        }
        insert(result.exportedEvents.at(-1));
      } else if (result.idempotentReplay !== true
        || result.exportedEvents.length !== before.length) {
        throw new Error("ROUTE_PROPOSAL_REPLAY_COUNT_INVALID");
      }
      const readback = events(contractId);
      if (canonicalizeStrict(readback)
        !== canonicalizeStrict(result.exportedEvents)) {
        throw new Error("ROUTE_PROPOSAL_EVENT_SET_READBACK_MISMATCH");
      }
    });
    if (result === undefined) throw new Error("ROUTE_PROPOSAL_RESULT_MISSING");
    return result;
  }

  function replay(contractId, outcomeLifecycleEvents) {
    return replayAgentNeutralRouteProposalRegistryV1({
      outcomeLifecycleEvents,
      registryEvents: events(contractId),
    });
  }

  return Object.freeze({ apply, replay });
}

export class FormationJobLedger {
  constructor(ctx, env) {
    this.store = createCloudflareSqliteDurableObjectFormationJobStoreV1({
      storage: ctx.storage,
    });
    this.worker = createFormationJobWorkerV1({
      store: this.store,
      executorResolver: executorResolver(env),
      clock: () => new Date().toISOString(),
    });
    this.clientStore = createUserHeldFormationExecutionSqliteStoreV1({
      storage: ctx.storage,
      clock: () => new Date().toISOString(),
    });
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/internal/v1/dispatch" && request.method === "POST") {
        const body = await jsonBody(request);
        const identity = formationJobIdentityV1(body);
        if (this.clientStore.read(identity.jobKey) !== null) {
          throw new Error("EXECUTION_MODE_CONFLICT");
        }
        const result = await this.worker.dispatch(identity.job);
        return json(result.statusCode, { ok: result.statusCode === 200,
          replayed: result.replayed, state: result.state,
          receipt: result.receipt });
      }
      if (url.pathname === "/internal/v1/client-executions/publish"
        && request.method === "POST") {
        const publication
          = normalizeClientExecutionPublishRequest(await jsonBody(request));
        if (await this.worker.read(publication.identity.jobKey) !== null) {
          throw new Error("EXECUTION_MODE_CONFLICT");
        }
        const result = this.clientStore.publish(publication);
        return json(result.replayed ? 200 : 201,
          clientExecutionPublishResponse(result));
      }
      if (url.pathname === "/internal/v1/client-execution-claims"
        && request.method === "POST") {
        return json(200, this.clientStore.claim(await jsonBody(request)));
      }
      const clientReceipt
        = /^\/internal\/v1\/client-executions\/(sha256:[a-f0-9]{64})\/receipt$/u
          .exec(url.pathname);
      if (clientReceipt && request.method === "POST") {
        const submission
          = normalizeUserHeldFormationExecutionResultSubmissionV1(
            await jsonBody(request));
        if (!hashEqual(clientReceipt[1], submission.jobKey)) {
          throw new Error("CLIENT_RESULT_PATH_MISMATCH");
        }
        return json(200, this.clientStore.complete(submission,
          request.headers.get("x-outsider-executor-capability-hash")));
      }
      const clientRead
        = /^\/internal\/v1\/client-executions\/(sha256:[a-f0-9]{64})$/u
          .exec(url.pathname);
      if (clientRead && request.method === "GET") {
        const record = this.clientStore.read(clientRead[1]);
        if (record === null) return json(404, { ok: false, error: "NOT_FOUND" });
        return json(record.state === "COMPLETE" ? 200 : 202,
          clientExecutionReadResponse(record));
      }
      const read = /^\/internal\/v1\/jobs\/(sha256:[a-f0-9]{64})$/u
        .exec(url.pathname);
      if (read && request.method === "GET") {
        const record = await this.worker.read(read[1]);
        if (record === null) return json(404, { ok: false, error: "NOT_FOUND" });
        return json(record.state === "COMPLETE" ? 200 : 202, {
          ok: record.state === "COMPLETE",
          state: record.state === "COMPLETE" ? record.receipt.state : "RUNNING_HOLD",
          jobKey: record.jobKey,
          jobHash: record.jobHash,
          claimedAt: record.claimedAt,
          receipt: record.receipt,
        });
      }
      return json(404, { ok: false, error: "NOT_FOUND" });
    } catch (error) {
      return errorResponse(error);
    }
  }
}

export class OutcomeOsLifecycleLedger {
  constructor(ctx) {
    this.store = createOutcomeOsLifecycleSqliteStore(ctx.storage);
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const base = /^\/internal\/v1\/outcome-os-lifecycles\/(contract_[a-f0-9]{32})$/u
        .exec(url.pathname);
      if (base && request.method === "POST") {
        const contractId = base[1];
        const input = lifecycleCreateInput(await jsonBody(request), contractId);
        const result = this.store.apply(contractId,
          (runtime) => runtime.create(input));
        return json(result.eventAppended ? 201 : 200,
          lifecycleOperationResponse(result));
      }
      if (base && request.method === "GET") {
        const contractId = base[1];
        const runtime = this.store.runtime(contractId);
        return json(200, lifecycleReadResponse(runtime.read()));
      }
      const append = /^\/internal\/v1\/outcome-os-lifecycles\/(contract_[a-f0-9]{32})\/events$/u
        .exec(url.pathname);
      if (append && request.method === "POST") {
        const contractId = append[1];
        const input = lifecycleAppendInput(await jsonBody(request));
        const result = this.store.apply(contractId,
          (runtime) => runtime.append(input));
        return json(result.eventAppended ? 201 : 200,
          lifecycleOperationResponse(result));
      }
      const replay = /^\/internal\/v1\/outcome-os-lifecycles\/(contract_[a-f0-9]{32})\/replay$/u
        .exec(url.pathname);
      if (replay && request.method === "GET") {
        const contractId = replay[1];
        const runtime = this.store.runtime(contractId);
        return json(200, lifecycleReplayResponse(runtime.replay()));
      }
      const events = /^\/internal\/v1\/outcome-os-lifecycles\/(contract_[a-f0-9]{32})\/events$/u
        .exec(url.pathname);
      if (events && request.method === "GET") {
        const contractId = events[1];
        const eventChain = this.store.events(contractId);
        if (eventChain.length === 0) {
          return json(404, { ok: false, error: "NOT_FOUND" });
        }
        createOutcomeOsLifecycleRuntimeV1({ events: eventChain }).replay();
        return json(200, lifecycleEventChainResponse(contractId, eventChain));
      }
      return json(404, { ok: false, error: "NOT_FOUND" });
    } catch (error) {
      if (errorCode(error) === "CONTRACT_NOT_CREATED") {
        return json(404, { ok: false, error: "NOT_FOUND" });
      }
      return errorResponse(error);
    }
  }
}

export class OutcomeRouteProposalLedger {
  constructor(ctx, env) {
    this.store = createRouteProposalSqliteStore(ctx.storage);
    this.env = env;
  }

  async outcomeLifecycleEvents(contractId) {
    const namespace = outcomeOsLifecycleNamespace(this.env);
    if (namespace === null) {
      throw new Error("OUTCOME_OS_LIFECYCLE_BINDING_UNAVAILABLE");
    }
    const stub = namespace.get(namespace.idFromName(contractId));
    const response = await stub.fetch(new Request(
      `https://outcome-os-lifecycle.internal/internal/v1/outcome-os-lifecycles/${contractId}/events`,
      { method: "GET" }));
    if (response.status === 404) throw new Error("OUTCOME_CONTRACT_NOT_FOUND");
    if (response.status !== 200) {
      throw new Error("OUTCOME_LIFECYCLE_INTERNAL_READ_FAILED");
    }
    let value;
    try { value = await response.json(); }
    catch { throw new Error("OUTCOME_LIFECYCLE_INTERNAL_RESPONSE_INVALID"); }
    if (!exact(value, ["schema", "contractId", "events"])
      || value.schema !== API_SCHEMAS.internalLifecycleEventChain
      || value.contractId !== contractId || !Array.isArray(value.events)) {
      throw new Error("OUTCOME_LIFECYCLE_INTERNAL_RESPONSE_INVALID");
    }
    replayOutcomeOsLifecycleV1(value.events);
    return value.events;
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const base = /^\/internal\/v1\/outcomes\/(contract_[a-f0-9]{32})\/route-proposals$/u
        .exec(url.pathname);
      if (!base) return json(404, { ok: false, error: "NOT_FOUND" });
      const contractId = base[1];
      const outcomeLifecycleEvents = await this.outcomeLifecycleEvents(contractId);
      if (request.method === "POST") {
        const proposal = routeProposalAppendInput(await jsonBody(request));
        const result = this.store.apply(contractId, outcomeLifecycleEvents,
          proposal);
        return json(result.eventAppended ? 201 : 200,
          routeProposalOperationResponse(result));
      }
      if (request.method === "GET") {
        return json(200, routeProposalReadResponse(
          this.store.replay(contractId, outcomeLifecycleEvents)));
      }
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    } catch (error) {
      return errorResponse(error);
    }
  }
}

function durableNamespace(env) {
  const namespace = env.FORMATION_JOBS;
  if (namespace === null || typeof namespace !== "object"
    || typeof namespace.idFromName !== "function"
    || typeof namespace.get !== "function") return null;
  return namespace;
}

function outcomeOsLifecycleNamespace(env) {
  const namespace = env.OUTCOME_OS_LIFECYCLES;
  if (namespace === null || typeof namespace !== "object"
    || typeof namespace.idFromName !== "function"
    || typeof namespace.get !== "function") return null;
  return namespace;
}

function outcomeRouteProposalNamespace(env) {
  const namespace = env.OUTCOME_ROUTE_PROPOSALS;
  if (namespace === null || typeof namespace !== "object"
    || typeof namespace.idFromName !== "function"
    || typeof namespace.get !== "function") return null;
  return namespace;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      if (request.method !== "GET") {
        return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
      }
      const registeredPlans = allowlist(env).length;
      const executor = await executorReadiness(env);
      const lifecycleBindingAvailable
        = outcomeOsLifecycleNamespace(env) !== null;
      const routeProposalBindingAvailable
        = outcomeRouteProposalNamespace(env) !== null;
      const outcomeApiAuthConfigured
        = bearerConfigured(env.OUTCOME_OS_API_BEARER_TOKEN);
      const formationDispatchAuthConfigured
        = bearerConfigured(env.FORMATION_DISPATCH_BEARER_TOKEN);
      return json(200, {
        ok: true,
        service: "outsider-formation-job-worker",
        version: API_VERSION,
        threeLayerApiSurfaceAvailable: true,
        commitIssuanceAvailable: false,
        outcomeApiAuthConfigured,
        formationDispatchAuthConfigured,
        productProfiles: Object.freeze({
          outcomeOs: Object.freeze({
            structuralProjectionAvailable: true,
            durableLifecycleBindingAvailable: lifecycleBindingAvailable,
            durableLifecycleAvailable: lifecycleBindingAvailable
              && outcomeApiAuthConfigured,
            durableRouteProposalRegistryBindingAvailable:
              routeProposalBindingAvailable,
            durableRouteProposalRegistryAvailable:
              routeProposalBindingAvailable && lifecycleBindingAvailable
              && outcomeApiAuthConfigured,
          }),
          formationRecoveryOptions: Object.freeze({
            structuralProjectionAvailable: true,
            typedRecoveryOptionPortfolioAvailable: true,
            externalCapacityEstablished: false,
            recoveryOptionHeld: false,
            promotionPermitted: false,
          }),
          standardCompatibility: Object.freeze({
            structuralBindingAvailable: true,
            acceptedStandardNames:
              OUTSIDER_OUTCOME_STANDARD_BINDING_V1_STANDARDS,
            compatibilityOnly: true,
            sourceReportOnly: true,
          }),
          outcomeCommit: Object.freeze({
            structuralClassificationAvailable: true,
            issuanceAvailable: false,
          }),
          userHeldExecution: Object.freeze({
            durablePublicationAvailable: durableNamespace(env) !== null
              && formationDispatchAuthConfigured,
            outboundClaimAvailable: durableNamespace(env) !== null,
            orderScopedExecutorBearerRequired: true,
            privateParametersStoredCentrally: false,
            unkeyedPrivateHashesStoredCentrally: false,
            repeatedUnclosedClaimReturnsInvocation: false,
            automaticReassignmentAfterClaim: false,
            executorReceiptIsIndependentOutcomeTruth: false,
          }),
        }),
        registeredPlans,
        executorServiceBound: executor.bound,
        executorConfigurationReady: executor.configurationReady,
        productionExecutionReady: registeredPlans > 0
          && executor.configurationReady,
        boundary: OUTSIDER_FORMATION_JOB_WORKER_V1_BOUNDARY,
      });
    }
    if (url.pathname === "/v1/outcomes/capabilities") {
      if (request.method !== "GET") {
        return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
      }
      return json(200, apiManifest());
    }
    const isOutcomeApiPath = outcomeApiPath(url.pathname);
    const isFormationDispatchPath = formationDispatchPath(url.pathname);
    const isUserHeldExecutorPath = userHeldExecutorPath(url.pathname);
    if (isOutcomeApiPath && !outcomeApiAuthorized(request, env)) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }
    if (isFormationDispatchPath
      && !formationDispatchAuthorized(request, env)) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }
    if (isUserHeldExecutorPath && presentedBearer(request) === null) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }

    if (url.pathname === "/v1/outcomes/prepare"
      && request.method === "POST") {
      try {
        return json(200, prepareOutcomeOsFromHttp(await jsonBody(request)));
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === "/v1/recovery-options/prepare"
      && request.method === "POST") {
      try {
        return json(200, prepareRecoveryOptionsFromHttp(await jsonBody(request)));
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === "/v1/recovery-option-portfolios/prepare"
      && request.method === "POST") {
      try {
        return json(200, prepareRecoveryOptionPortfolioFromHttp(
          await jsonBody(request)));
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === "/v1/standard-bindings/create"
      && request.method === "POST") {
      try {
        return json(200, createStandardBindingFromHttp(
          await jsonBody(request)));
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === "/v1/commit-readiness/evaluate"
      && request.method === "POST") {
      try {
        return json(200, classifyCommitReadinessFromHttp(
          await jsonBody(request)));
      } catch (error) {
        return errorResponse(error);
      }
    }

    const lifecycleNamespace = outcomeOsLifecycleNamespace(env);
    if (url.pathname === "/v1/outcome-os-lifecycles"
      && request.method === "POST") {
      if (lifecycleNamespace === null) {
        return json(500, { ok: false,
          error: "OUTCOME_OS_LIFECYCLE_BINDING_UNAVAILABLE" });
      }
      try {
        const body = await jsonBody(request);
        const contractId = lifecycleContractId(body?.contractId);
        lifecycleCreateInput(body, contractId);
        const stub = lifecycleNamespace.get(
          lifecycleNamespace.idFromName(contractId));
        return stub.fetch(new Request(
          `https://outcome-os-lifecycle.internal/internal/v1/outcome-os-lifecycles/${contractId}`,
          { method: "POST", headers: { "content-type": "application/json" },
            body: canonicalizeStrict(body) }));
      } catch (error) {
        return errorResponse(error);
      }
    }

    const lifecycleAppend
      = /^\/v1\/outcome-os-lifecycles\/(contract_[a-f0-9]{32})\/events$/u
        .exec(url.pathname);
    if (lifecycleAppend && request.method === "POST") {
      if (lifecycleNamespace === null) {
        return json(500, { ok: false,
          error: "OUTCOME_OS_LIFECYCLE_BINDING_UNAVAILABLE" });
      }
      try {
        const body = await jsonBody(request);
        lifecycleAppendInput(body);
        const contractId = lifecycleAppend[1];
        const stub = lifecycleNamespace.get(
          lifecycleNamespace.idFromName(contractId));
        return stub.fetch(new Request(
          `https://outcome-os-lifecycle.internal/internal/v1/outcome-os-lifecycles/${contractId}/events`,
          { method: "POST", headers: { "content-type": "application/json" },
            body: canonicalizeStrict(body) }));
      } catch (error) {
        return errorResponse(error);
      }
    }

    const lifecycleReplay
      = /^\/v1\/outcome-os-lifecycles\/(contract_[a-f0-9]{32})\/replay$/u
        .exec(url.pathname);
    if (lifecycleReplay && request.method === "GET") {
      if (lifecycleNamespace === null) {
        return json(500, { ok: false,
          error: "OUTCOME_OS_LIFECYCLE_BINDING_UNAVAILABLE" });
      }
      const contractId = lifecycleReplay[1];
      const stub = lifecycleNamespace.get(
        lifecycleNamespace.idFromName(contractId));
      return stub.fetch(new Request(
        `https://outcome-os-lifecycle.internal/internal/v1/outcome-os-lifecycles/${contractId}/replay`,
        { method: "GET" }));
    }

    const lifecycleRead
      = /^\/v1\/outcome-os-lifecycles\/(contract_[a-f0-9]{32})$/u
        .exec(url.pathname);
    if (lifecycleRead && request.method === "GET") {
      if (lifecycleNamespace === null) {
        return json(500, { ok: false,
          error: "OUTCOME_OS_LIFECYCLE_BINDING_UNAVAILABLE" });
      }
      const contractId = lifecycleRead[1];
      const stub = lifecycleNamespace.get(
        lifecycleNamespace.idFromName(contractId));
      return stub.fetch(new Request(
        `https://outcome-os-lifecycle.internal/internal/v1/outcome-os-lifecycles/${contractId}`,
        { method: "GET" }));
    }

    const routeProposal
      = /^\/v1\/outcomes\/(contract_[a-f0-9]{32})\/route-proposals$/u
        .exec(url.pathname);
    if (routeProposal && ["GET", "POST"].includes(request.method)) {
      const proposalNamespace = outcomeRouteProposalNamespace(env);
      if (lifecycleNamespace === null) {
        return json(500, { ok: false,
          error: "OUTCOME_OS_LIFECYCLE_BINDING_UNAVAILABLE" });
      }
      if (proposalNamespace === null) {
        return json(500, { ok: false,
          error: "OUTCOME_ROUTE_PROPOSAL_BINDING_UNAVAILABLE" });
      }
      try {
        const contractId = routeProposal[1];
        let body;
        if (request.method === "POST") {
          body = await jsonBody(request);
          routeProposalAppendInput(body);
        }
        const stub = proposalNamespace.get(
          proposalNamespace.idFromName(contractId));
        return stub.fetch(new Request(
          `https://route-proposal.internal/internal/v1/outcomes/${contractId}/route-proposals`,
          request.method === "POST" ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: canonicalizeStrict(body),
          } : { method: "GET" }));
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (!isFormationDispatchPath && !isUserHeldExecutorPath) {
      return json(404, { ok: false, error: "NOT_FOUND" });
    }

    const namespace = durableNamespace(env);
    if (namespace === null) {
      return json(500, { ok: false, error: "DURABLE_BINDING_UNAVAILABLE" });
    }

    if (url.pathname === "/v1/client-executions"
      && request.method === "POST") {
      try {
        const body = await jsonBody(request);
        const publication = normalizeClientExecutionPublishRequest(body);
        const stub = namespace.get(namespace.idFromName(
          publication.identity.jobKey));
        return stub.fetch(new Request(
          "https://formation-job.internal/internal/v1/client-executions/publish", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: canonicalizeStrict(body),
          }));
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === "/v1/client-execution-claims"
      && request.method === "POST") {
      try {
        const body = normalizeUserHeldFormationExecutionClaimRequestV1(
          await jsonBody(request));
        const executorCapabilityHash
          = deriveUserHeldFormationExecutorCapabilityHashV1({
            bearerToken: presentedBearer(request),
            jobHash: body.jobHash,
          });
        if (!hashEqual(executorCapabilityHash,
          body.executorCapabilityHash)) {
          return json(401, { ok: false, error: "UNAUTHORIZED" });
        }
        const stub = namespace.get(namespace.idFromName(body.jobKey));
        return stub.fetch(new Request(
          "https://formation-job.internal/internal/v1/client-execution-claims", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: canonicalizeStrict(body),
          }));
      } catch (error) {
        return errorResponse(error);
      }
    }

    const clientReceipt
      = /^\/v1\/client-executions\/(sha256:[a-f0-9]{64})\/receipt$/u
        .exec(url.pathname);
    if (clientReceipt && request.method === "POST") {
      try {
        const body = normalizeUserHeldFormationExecutionResultSubmissionV1(
          await jsonBody(request));
        if (!hashEqual(clientReceipt[1], body.jobKey)) {
          throw new Error("CLIENT_RESULT_PATH_MISMATCH");
        }
        const executorCapabilityHash
          = deriveUserHeldFormationExecutorCapabilityHashV1({
            bearerToken: presentedBearer(request),
            jobHash: body.jobHash,
          });
        const stub = namespace.get(namespace.idFromName(body.jobKey));
        return stub.fetch(new Request(
          `https://formation-job.internal/internal/v1/client-executions/${body.jobKey}/receipt`, {
            method: "POST",
            headers: { "content-type": "application/json",
              "x-outsider-executor-capability-hash": executorCapabilityHash },
            body: canonicalizeStrict(body),
          }));
      } catch (error) {
        return errorResponse(error);
      }
    }

    const clientRead
      = /^\/v1\/client-executions\/(sha256:[a-f0-9]{64})$/u
        .exec(url.pathname);
    if (clientRead && request.method === "GET") {
      const stub = namespace.get(namespace.idFromName(clientRead[1]));
      return stub.fetch(new Request(
        `https://formation-job.internal/internal/v1/client-executions/${clientRead[1]}`,
        { method: "GET" }));
    }

    if (url.pathname === "/v1/formation-jobs" && request.method === "POST") {
      try {
        const identity = formationJobIdentityV1(await jsonBody(request));
        const stub = namespace.get(namespace.idFromName(identity.jobKey));
        return stub.fetch(new Request(
          "https://formation-job.internal/internal/v1/dispatch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: canonicalizeStrict(identity.job),
          }));
      } catch (error) {
        return errorResponse(error);
      }
    }

    const read = /^\/v1\/formation-jobs\/(sha256:[a-f0-9]{64})$/u
      .exec(url.pathname);
    if (read && request.method === "GET") {
      const stub = namespace.get(namespace.idFromName(read[1]));
      return stub.fetch(new Request(
        `https://formation-job.internal/internal/v1/jobs/${read[1]}`, {
          method: "GET",
        }));
    }

    const outcomeStatus = /^\/v1\/outcomes\/(sha256:[a-f0-9]{64})\/status$/u
      .exec(url.pathname);
    if (outcomeStatus && request.method === "GET") {
      const jobKey = outcomeStatus[1];
      const stub = namespace.get(namespace.idFromName(jobKey));
      const response = await stub.fetch(new Request(
        `https://formation-job.internal/internal/v1/jobs/${jobKey}`, {
          method: "GET",
        }));
      if (response.status === 404) return response;
      if (response.status !== 200 && response.status !== 202) {
        return json(500, { ok: false, error: "DURABLE_STATE_INVALID" });
      }
      let formationJob;
      try { formationJob = await response.json(); }
      catch { return json(500, { ok: false, error: "DURABLE_STATE_INVALID" }); }
      return json(response.status, {
        schema: API_SCHEMAS.legacyStatus,
        apiVersion: API_VERSION,
        ok: response.status === 200,
        jobKey,
        outcomeOs: Object.freeze({
          state: "LEGACY_JOB_REFERENCE_ONLY",
          sourceProgramReplayPerformed: false,
        }),
        formationRecoveryOptions: Object.freeze({
          state: "NOT_CLASSIFIED",
          declaredRecoveryOptionReferenceCurrent: false,
          reservationsVerified: false,
          layerTwoPromotionPermitted: false,
          attainedServiceProfile: "OUTCOME_OS",
        }),
        outcomeCommit: Object.freeze({
          state: "NOT_COMMITTED",
          reasonCode: "THREE_LAYER_COMMIT_PROOFS_NOT_EVALUATED",
          authorityMinted: false,
          outcomePromiseIssued: false,
        }),
        formationJob,
      });
    }
    return json(404, { ok: false, error: "NOT_FOUND" });
  },
};
