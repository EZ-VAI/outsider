/*
 * Minimal production product composition for Outsider outcomes.
 *
 * The runner deliberately keeps provider credentials outside this module.
 * Callers construct adapters (whose credentials remain in closures), then
 * inject them here.  The only persisted provider values are the redacted
 * receipts/adapterState accepted by the durable orchestrator.
 *
 * Product flow:
 *   goal or frozen OutcomeProgram -> proposal -> exact hash confirmation
 *   -> dynamic three-role formation -> durable execution/recovery/closure
 */

import { mkdirSync } from "node:fs";
import path from "node:path";

import { createDurableOutcomeProgramOrchestratorV1 }
  from "./outsider-durable-outcome-program-orchestrator-v1.js";
import { createOutsiderOutcomeProductRuntimeV1 }
  from "./outsider-outcome-product-runtime-v1.js";
import { verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";
import { mapProviderResourceCapabilities }
  from "./outsider-provider-resource-capabilities.js";

const PREFIX = "OUTSIDER_PRODUCTION_OUTCOME_RUNNER_V1_";
const ROLES = Object.freeze([
  "PRIMARY",
  "RECOVERY",
  "INDEPENDENT_WITNESS",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function checkedAdapter(adapter, role) {
  if (adapter === null || typeof adapter !== "object"
    || typeof adapter.adapterId !== "string" || adapter.adapterId.length < 1
    || typeof adapter.reserve !== "function"
    || typeof adapter.release !== "function"
    || typeof adapter.closeObligation !== "function"
    || ((role === "PRIMARY" || role === "RECOVERY")
      && typeof adapter.execute !== "function")
    || (role === "INDEPENDENT_WITNESS"
      && typeof adapter.observe !== "function")) {
    fail(`${role}_ADAPTER_INVALID`);
  }
  return adapter;
}

function adapterEntries(input) {
  if (Array.isArray(input)) return input;
  if (input instanceof Map) return [...input.values()];
  if (input !== null && typeof input === "object") {
    return Object.values(input);
  }
  fail("ADAPTER_FEDERATION_INVALID");
}

function candidateDescriptor(value) {
  const descriptor = value?.adapter === undefined
    ? { adapter: value, roles: value?.roles, priority: value?.priority }
    : value;
  const adapter = descriptor.adapter;
  if (adapter === null || typeof adapter !== "object"
    || typeof adapter.adapterId !== "string" || adapter.adapterId.length < 1
    || typeof adapter.reserve !== "function"
    || typeof adapter.release !== "function"
    || typeof adapter.closeObligation !== "function") {
    fail("FEDERATED_ADAPTER_INVALID");
  }
  const rawRoles = descriptor.roles ?? adapter.roles
    ?? (adapter.role === undefined ? null : [adapter.role]);
  const roles = rawRoles === null
    ? [
      ...(typeof adapter.execute === "function"
        ? ["PRIMARY", "RECOVERY"] : []),
      ...(typeof adapter.observe === "function"
        ? ["INDEPENDENT_WITNESS"] : []),
    ] : rawRoles;
  if (!Array.isArray(roles) || roles.length < 1
    || roles.some((role) => !ROLES.includes(role))) {
    fail("FEDERATED_ADAPTER_ROLES_INVALID");
  }
  const priority = descriptor.priority ?? adapter.priority ?? 100;
  if (!Number.isSafeInteger(priority) || priority < 0) {
    fail("FEDERATED_ADAPTER_PRIORITY_INVALID");
  }
  return Object.freeze({ adapter, roles: Object.freeze([...new Set(roles)]),
    priority });
}

/**
 * Build a per-order discovery federation over every injected candidate.
 * Candidates are filtered by declared role and supports(requirement), then
 * selected deterministically by priority and adapterId. No binding is stored
 * outside the orchestrator's order journal.
 */
export function createProductionAdapterFederationV1(input = {}) {
  const candidates = adapterEntries(input.adapters ?? input)
    .map(candidateDescriptor)
    .sort((left, right) => left.priority - right.priority
      || left.adapter.adapterId.localeCompare(right.adapter.adapterId));
  const ids = candidates.map((candidate) => candidate.adapter.adapterId);
  if (new Set(ids).size !== ids.length) fail("FEDERATED_ADAPTER_ID_DUPLICATE");
  const adapters = Object.freeze(Object.fromEntries(candidates.map(
    (candidate) => [candidate.adapter.adapterId, candidate.adapter])));

  return Object.freeze({
    adapters,
    listResourceCapabilities(input) {
      return mapProviderResourceCapabilities({ ...input, adapters });
    },
    async discover({ requirement }) {
      const roleCandidates = candidates.filter((candidate) =>
        candidate.roles.includes(requirement?.role));
      const support = await Promise.all(roleCandidates.map(async (candidate) =>
        typeof candidate.adapter.supports !== "function"
          || await candidate.adapter.supports(requirement)));
      const index = support.findIndex(Boolean);
      if (index < 0) return null;
      const selected = roleCandidates[index].adapter;
      return {
        adapterId: selected.adapterId,
        providerRef: selected.providerRef ?? null,
      };
    },
  });
}

/**
 * Bind one already-created provider adapter to each formation role.
 *
 * For the first production milestone these are the Cloudflare primary,
 * GitHub Pages recovery, and route-aware independent witness adapters.  The
 * function is capability/domain neutral: selection is by OutcomeProgram role
 * plus each adapter's own supports(requirement) decision.
 */
export function createPrimaryRecoveryWitnessCompositionV1(input = {}) {
  const byRole = Object.freeze({
    PRIMARY: checkedAdapter(input.primaryAdapter, "PRIMARY"),
    RECOVERY: checkedAdapter(input.recoveryAdapter, "RECOVERY"),
    INDEPENDENT_WITNESS: checkedAdapter(
      input.witnessAdapter, "INDEPENDENT_WITNESS"),
  });
  if (new Set(ROLES.map((role) => byRole[role].adapterId)).size
    !== ROLES.length) fail("ADAPTER_IDS_NOT_DISTINCT");
  const failureDomains = ROLES.map((role) =>
    byRole[role].failureDomainRef ?? byRole[role].providerRef
      ?? byRole[role].adapterId);
  if (new Set(failureDomains).size !== ROLES.length) {
    fail("PROVIDER_FAILURE_DOMAINS_NOT_DISTINCT");
  }
  return createProductionAdapterFederationV1({
    adapters: ROLES.map((role) => ({
      adapter: byRole[role],
      roles: [role],
      priority: 0,
    })),
  });
}

function checkedComposition(value) {
  if (value === null || typeof value !== "object"
    || value.adapters === null || typeof value.adapters !== "object") {
    fail("COMPOSITION_INVALID");
  }
  if (value.discover !== undefined && typeof value.discover !== "function") {
    fail("DISCOVER_INVALID");
  }
  if (value.compileGoal !== undefined
    && typeof value.compileGoal !== "function") fail("COMPILER_INVALID");
  return value;
}

function withDefaultDiscovery(value) {
  if (typeof value.discover === "function") return value;
  const federation = createProductionAdapterFederationV1({
    adapters: value.candidates ?? value.adapters,
  });
  return Object.freeze({ ...value, adapters: federation.adapters,
    discover: federation.discover });
}

function statusOf(value) {
  return value && typeof value === "object"
    && typeof value.status === "string" ? value.status : null;
}

/** A terminal-safe view: adapter continuation state and receipts stay private. */
export function publicOutcomeRunViewV1(projection) {
  if (projection === null || typeof projection !== "object"
    || typeof projection.programId !== "string"
    || typeof projection.programHash !== "string"
    || typeof projection.state !== "string") fail("PROJECTION_INVALID");
  const formation = Object.fromEntries(Object.keys(projection.bindings ?? {})
    .sort().map((requirementId) => [requirementId, {
      bound: projection.bindings?.[requirementId] !== null,
      reserved: projection.reservations?.[requirementId] !== null,
      released: projection.releases?.[requirementId] !== null,
    }]));
  const nodes = Object.fromEntries(Object.entries(projection.nodes ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, node]) => [nodeId, {
      primary: statusOf(node?.primary),
      recovery: statusOf(node?.recovery),
      witness: statusOf(node?.witness),
    }]));
  const obligations = Object.fromEntries(
    Object.entries(projection.obligations ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([obligationId, value]) => [obligationId, statusOf(value)]));
  const retry = projection.retry === null || projection.retry === undefined
    ? null : {
      phase: projection.retry.phase ?? null,
      subjectId: projection.retry.subjectId ?? null,
      operationId: projection.retry.operationId ?? null,
      observationOccurrence: projection.retry.observationOccurrence ?? null,
      observationStatus: projection.retry.observationStatus ?? null,
      reason: projection.retry.reason ?? null,
      retryAfter: projection.retry.retryAfter ?? null,
    };
  return Object.freeze({
    schema: "outsider/public-production-outcome-run/v1",
    schemaVersion: "1.0.0",
    programId: projection.programId,
    programHash: projection.programHash,
    state: projection.state,
    committed: projection.committed === true,
    userOutcomePromiseIssued: projection.userOutcomePromiseIssued === true,
    formation,
    nodes,
    obligations,
    zeroInternalOpsObserved:
      projection.telemetry?.zeroInternalOpsObserved ?? null,
    humanQueueCreated: projection.humanQueueCreated ?? null,
    retry,
    eventCount: projection.eventCount,
    journalHeadHash: projection.journalHeadHash,
  });
}

export function createProductionOutcomeRunnerV1(options = {}) {
  if (typeof options.directory !== "string" || options.directory.length < 1) {
    fail("DIRECTORY_INVALID");
  }
  const composition = withDefaultDiscovery(checkedComposition(
    options.composition ?? { adapters: Object.freeze({}) }));
  const directory = path.resolve(options.directory);
  const requestDirectory = path.join(directory, "requests");
  const executionDirectory = path.join(directory, "executions");
  mkdirSync(requestDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(executionDirectory, { recursive: true, mode: 0o700 });
  const frozenPrograms = new Map();
  const externalCompiler = options.compileGoal ?? composition.compileGoal;
  const clock = options.clock ?? composition.clock;
  const orchestrator = createDurableOutcomeProgramOrchestratorV1({
    directory: executionDirectory,
    adapters: composition.adapters,
    discover: composition.discover,
    measureOperations:
      options.measureOperations ?? composition.measureOperations,
    ...(clock === undefined ? {} : { clock }),
  });
  const product = createOutsiderOutcomeProductRuntimeV1({
    directory: requestDirectory,
    orchestrator,
    ...(clock === undefined ? {} : { clock }),
    async compileGoal(request) {
      const frozen = frozenPrograms.get(request.requestId);
      if (frozen !== undefined) return frozen;
      if (typeof externalCompiler !== "function") fail("COMPILER_REQUIRED");
      return externalCompiler(request);
    },
  });

  return Object.freeze({
    requestOutcome(request) {
      return product.requestOutcome(request);
    },
    async proposeProgram(programInput) {
      const program = verifyOutcomeProgramV1(programInput);
      if (frozenPrograms.has(program.orderId)) {
        fail("FROZEN_PROGRAM_IMPORT_ACTIVE");
      }
      frozenPrograms.set(program.orderId, program);
      try {
        const proposal = await product.requestOutcome({
          requestId: program.orderId,
          goal: program.outcome.statement,
          completionDeadline: program.completionDeadline,
          budget: program.outcome.budget,
          context: { importedProgramHash: program.programHash },
        });
        if (proposal.programHash !== program.programHash) {
          fail("FROZEN_PROGRAM_REPLAY_MISMATCH");
        }
        return proposal;
      } finally {
        frozenPrograms.delete(program.orderId);
      }
    },
    confirmOutcome(confirmation, runOptions = {}) {
      return product.confirmOutcome(confirmation, runOptions);
    },
    resumeConfirmed(requestId, runOptions = {}) {
      return product.resumeConfirmed(requestId, runOptions);
    },
    proposal(requestId) {
      return product.proposal(requestId);
    },
    inspectProgram(programId) {
      return orchestrator.inspect(programId);
    },
  });
}
