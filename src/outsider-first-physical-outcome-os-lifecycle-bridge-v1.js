import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { verifyAutonomousWorkOrderProjection }
  from "./outsider-autonomous-work-order.js";
import { verifyOutcomeProductFoundationCompilationV1 }
  from "./outsider-outcome-product-foundation-composition-v1.js";
import { importOutcomeProgramToOutcomeOsV1 }
  from "./outsider-three-layer-outcome-product-contract-v1.js";
import { createOutcomeOsLifecycleRuntimeV1 }
  from "./outsider-outcome-os-lifecycle-v1.js";

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_OS_LIFECYCLE_BRIDGE_V1_SCHEMA =
  "outsider/first-physical-outcome-os-lifecycle-bridge/v1";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const UNIFIED_SCHEMA = "outsider/first-physical-outcome-unified-product/v1";
const PRODUCT_STATE_SCHEMA = "outsider/first-physical-formation-product-state/v2";

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}
function validHash(value) { return typeof value === "string" && HASH.test(value); }
function validUtc(value) {
  return typeof value === "string" && UTC.test(value)
    && new Date(value).toISOString() === value;
}
function hold(gaps, refs = {}) {
  const body = { schema: OUTSIDER_FIRST_PHYSICAL_OUTCOME_OS_LIFECYCLE_BRIDGE_V1_SCHEMA,
    schemaVersion: "1.0.0", decision: "HOLD", gaps: [...new Set(gaps)].sort(),
    sourceRefs: refs, requests: null, finalHeadHash: null,
    sellerObservationEstablishesCapacity: false,
    sellerObservationEstablishesOutcomeTruth: false,
    sellerObservationEstablishesCommit: false, authority: "NONE",
    paymentAttempted: false, networkIoPerformed: false, directPiiProjected: false };
  return Object.freeze({ ...body, bridgeHash: digest(body.schema, body) });
}
function graphRefs(graph) {
  return {
    principalEpochRefHash: graph.principalEpoch?.principalEpochProjectionHash,
    accountableDeploymentRefHash:
      graph.accountableDeployment?.accountableDeploymentSubjectHash,
    runtimeRefHash: graph.runtime?.runtimeInstanceHash,
    embodimentRefHash: graph.embodiment?.present
      ? graph.embodiment.embodimentRevisionHash : null,
    delegationRefHash: graph.delegation?.delegationEdgeHash,
    episodeRefHash: graph.episode?.episodeHash,
    attemptRefHash: graph.attempt?.attemptHash,
  };
}

/** Offline-only compiler. It performs no filesystem, network, seller or payment I/O. */
export function compileFirstPhysicalOutcomeOsLifecycleBridgeV1(input = {}) {
  const gaps = [];
  if (!validUtc(input.recordedAt)) gaps.push("CREATE_RECORDED_AT_UTC_MISSING");
  if (!validUtc(input.openedAt)) gaps.push("OPEN_RECORDED_AT_UTC_MISSING");
  if (!validUtc(input.attemptRecordedAt)) gaps.push("ATTEMPT_RECORDED_AT_UTC_MISSING");
  let compilation;
  try { compilation = verifyOutcomeProductFoundationCompilationV1(input.foundationCompilation); }
  catch { gaps.push("FOUNDATION_COMPILATION_SOURCE_REPLAY_FAILED"); }
  const workOrder = input.workOrderProjection;
  let checked = { ok: false };
  try {
    checked = verifyAutonomousWorkOrderProjection(workOrder, {
      expectedWorkOrderHash: workOrder?.workOrderHash,
    });
  } catch { /* represented as a deterministic gap below */ }
  if (!checked.ok) gaps.push("WORK_ORDER_SOURCE_REPLAY_FAILED");
  const unified = input.unifiedResult;
  if (!unified || unified.schema !== UNIFIED_SCHEMA || !validHash(unified.unifiedResultHash)) {
    gaps.push("UNIFIED_RESULT_MISSING_OR_UNTYPED");
  } else {
    const { unifiedResultHash, ...body } = unified;
    if (digest(UNIFIED_SCHEMA, body) !== unifiedResultHash)
      gaps.push("UNIFIED_RESULT_SOURCE_REPLAY_FAILED");
    if (unified.externalOutcomeEstablished === true || unified.outcomePromiseIssued === true
      || unified.paymentAttempted !== false || unified.orderSubmitted !== false)
      gaps.push("UNIFIED_RESULT_BOUNDARY_INVALID");
  }
  const evidence = input.sellerObservation;
  const productState = input.productState;
  let productStateHash = null;
  if (!productState || productState.schema !== PRODUCT_STATE_SCHEMA
    || !validHash(productState.productStateHash)) {
    gaps.push("PRODUCT_STATE_MISSING_OR_UNTYPED");
  } else {
    const { productStateHash: claimed, ...body } = productState;
    productStateHash = claimed;
    if (digest(PRODUCT_STATE_SCHEMA, body) !== claimed)
      gaps.push("PRODUCT_STATE_SOURCE_REPLAY_FAILED");
    if (productState.outcomePromiseState !== "NOT_COMMITTED"
      || productState.boundary?.rankingProvesCapacity !== false
      || productState.boundary?.rankingProvesOutcomeTruth !== false
      || productState.boundary?.paymentAttempted !== false)
      gaps.push("PRODUCT_STATE_BOUNDARY_INVALID");
  }
  for (const field of ["attemptSetCompositionRefHash", "occurrenceRefHash"]) {
    if (!validHash(evidence?.[field])) gaps.push(`SELLER_OBSERVATION_${field.toUpperCase()}_MISSING`);
  }
  const graph = graphRefs(workOrder?.typedGraph ?? {});
  for (const [key, value] of Object.entries(graph)) {
    if (key === "embodimentRefHash" && value === null) continue;
    if (!validHash(value)) gaps.push(`TYPED_GRAPH_${key.toUpperCase()}_MISSING`);
  }
  if (compilation && workOrder
    && compilation.program.programHash !== unified?.programHash)
    gaps.push("PROGRAM_UNIFIED_BINDING_MISMATCH");
  if (gaps.length) return hold(gaps, {
    unifiedResultHash: validHash(unified?.unifiedResultHash) ? unified.unifiedResultHash : null,
    compilationHash: validHash(compilation?.compilationHash) ? compilation.compilationHash : null,
    workOrderHash: validHash(workOrder?.workOrderHash) ? workOrder.workOrderHash : null,
    productStateHash: validHash(productStateHash) ? productStateHash : null,
  });

  const requestIdHash = digest("outsider/request-id/private-to-public/v1",
    compilation.requestId);
  const outcomeOs = importOutcomeProgramToOutcomeOsV1({
    requestIdHash, outcomeProgram: compilation.program,
    maximumLossConstraintHash: digest("outsider/maximum-loss-constraint/v1",
      compilation.frozenOutcome.budget), typedGraphRefs: graph,
  });
  const contractId = `contract_${outcomeOs.artifactHash.slice(7, 39)}`;
  const createRequest = { contractId, outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: input.recordedAt,
    idempotencyKeyHash: digest("outsider/outcome-os/create-idempotency/v1",
      { contractId, recordedAt: input.recordedAt }) };
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = runtime.create(createRequest);
  const openRequest = { eventType: "CONTRACT_OPENED", recordedAt: input.openedAt,
    idempotencyKeyHash: digest("outsider/outcome-os/open-idempotency/v1", contractId),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: digest("outsider/outcome-os/open-instruction/v1",
      { outcomeOsArtifactHash: outcomeOs.artifactHash }) } };
  const opened = runtime.append(openRequest);
  const attemptRequest = { eventType: "ATTEMPT_EVIDENCE_APPENDED",
    recordedAt: input.attemptRecordedAt,
    idempotencyKeyHash: digest("outsider/outcome-os/attempt-idempotency/v1", evidence),
    expectedHeadHash: opened.head.headHash,
    payload: { episodeRefHash: graph.episodeRefHash, attemptRefHash: graph.attemptRefHash,
      attemptSetCompositionRefHash: evidence.attemptSetCompositionRefHash,
      attemptEvidenceRefHash: productStateHash,
      occurrenceRefHash: evidence.occurrenceRefHash,
      executionDisposition: "UNKNOWN", outcomeObservationStatus: "MISSING",
      reportedOutcomeEvidenceRefHash: null,
      attemptMembershipSourceReplayVerified: false } };
  const appended = runtime.append(attemptRequest);
  const body = { schema: OUTSIDER_FIRST_PHYSICAL_OUTCOME_OS_LIFECYCLE_BRIDGE_V1_SCHEMA,
    schemaVersion: "1.0.0", decision: "READY_FOR_OFFLINE_LIFECYCLE_IMPORT",
    gaps: [], sourceRefs: { unifiedResultHash: unified.unifiedResultHash,
      compilationHash: compilation.compilationHash, workOrderHash: workOrder.workOrderHash,
      productStateHash },
    requests: { create: createRequest, open: openRequest,
      attemptEvidence: attemptRequest }, finalHeadHash: appended.head.headHash,
    sellerObservationEstablishesCapacity: false,
    sellerObservationEstablishesOutcomeTruth: false,
    sellerObservationEstablishesCommit: false, authority: "NONE",
    paymentAttempted: false, networkIoPerformed: false, directPiiProjected: false };
  return Object.freeze({ ...body, bridgeHash: digest(body.schema, body) });
}
