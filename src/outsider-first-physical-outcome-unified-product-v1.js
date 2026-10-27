/*
 * First physical Outcome Product unified composition v1.
 *
 * This is the narrow production seam joining the existing model/compute,
 * typed Work Order/Episode data, and buyer-native execution foundations. It
 * creates no provider registry and performs no payment or order submission.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, readdirSync, statSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { verifyAutonomousWorkOrderProjection }
  from "./outsider-autonomous-work-order.js";
import { pinAtomicBuyerNativeFrozenArtifactV1 }
  from "./outsider-atomic-buyer-native-temporary-network-coordinator-v1.js";
import {
  createFirstPhysicalOutcomeProductionCompositionV1,
  validateFirstPhysicalOutcomeFoundationCompilationV1,
} from "./outsider-first-physical-outcome-production-composition-v1.js";
import {
  createOutcomeProductEpisodeDataBridgeV1,
} from "./outsider-outcome-product-episode-data-bridge-v1.js";
import {
  createOutcomeProductFoundationCompilerV1,
  verifyOutcomeProductFoundationCompilationV1,
} from "./outsider-outcome-product-foundation-composition-v1.js";

const PREFIX = "OUTSIDER_FIRST_PHYSICAL_OUTCOME_UNIFIED_PRODUCT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const BINDING_SCHEMA
  = "outsider/private-first-physical-unified-episode-binding/v1";

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_UNIFIED_PRODUCT_V1_SCHEMA
  = "outsider/first-physical-outcome-unified-product/v1";

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_UNIFIED_PRODUCT_V1_BOUNDARY
  = Object.freeze({
    modelComputeFoundationInProductPath: true,
    existingTypedWorkOrderGraphInProductPath: true,
    productAndBuyerNativeOccurrencesInEpisodeDataPath: true,
    providerRegistryRequired: false,
    fixedMilestoneRoutesAreOrderScoped: true,
    paymentImplemented: false,
    orderSubmissionImplemented: false,
    modelOutputEstablishesAuthority: false,
    sourceReceiptEstablishesIndependentOutcome: false,
    externalOutcomeEstablished: false,
    humanQueuePermitted: false,
    outsiderStaffTouchLimit: 0,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function requestId(value) {
  if (typeof value !== "string" || !REQUEST_ID.test(value)) {
    fail("REQUEST_ID_INVALID");
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = statSync(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    fail("PRIVATE_DIRECTORY_INVALID");
  }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(directory, file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  if (existsSync(file)) {
    if (!readFileSync(file).equals(bytes)) fail("BINDING_REPLAY_MISMATCH");
    return;
  }
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  let directoryDescriptor;
  try {
    directoryDescriptor = openSync(directory, "r");
    fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
  }
}

function readRecord(file) {
  const info = statSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) {
    fail("BINDING_NOT_PRIVATE");
  }
  const bytes = readFileSync(file);
  if (bytes.length < 3 || bytes.at(-1) !== 0x0a) fail("BINDING_PARTIAL");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("BINDING_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("BINDING_NOT_CANONICAL");
  }
  return value;
}

function bindingFile(directory, id) {
  return path.join(directory, `${createHash("sha256")
    .update(requestId(id), "utf8").digest("hex")}.json`);
}

function tenderTypedGraphInput(value) {
  return {
    principalEpoch: value.principalEpoch,
    accountableDeployment: value.accountableDeployment,
    runtime: value.runtime,
    embodiment: value.embodiment,
    delegation: value.delegation,
    episode: value.episode,
    attempt: value.attempt,
  };
}

function validateFoundationContext(value, resolverInput) {
  exact(value, ["foundationBindings", "workOrderProjection",
    "expectedWorkOrderHash", "prospectiveCensusProjectionHash"],
  "FOUNDATION_CONTEXT");
  const workOrder = value.workOrderProjection;
  const expectedWorkOrderHash = hash(value.expectedWorkOrderHash,
    "EXPECTED_WORK_ORDER_HASH");
  const checked = verifyAutonomousWorkOrderProjection(workOrder, {
    expectedWorkOrderHash,
  });
  if (!checked.ok || workOrder.workOrderHash !== expectedWorkOrderHash) {
    fail("WORK_ORDER_REPLAY_INVALID");
  }
  hash(value.prospectiveCensusProjectionHash,
    "PROSPECTIVE_CENSUS_PROJECTION_HASH");
  const bindings = value.foundationBindings;
  const typedGraph = tenderTypedGraphInput(workOrder.typedGraph);
  if (bindings === null || typeof bindings !== "object"
    || bindings.workOrderHash !== workOrder.workOrderHash
    || bindings.typedGraph === null
    || typeof bindings.typedGraph !== "object"
    || canonicalizeStrict(tenderTypedGraphInput(bindings.typedGraph))
      !== canonicalizeStrict(typedGraph)) {
    fail("FOUNDATION_WORK_ORDER_GRAPH_MISMATCH");
  }
  const outcomeIntentRefHash = pinAtomicBuyerNativeFrozenArtifactV1(
    "OUTCOME", resolverInput.frozenOutcome);
  if (workOrder.promisedOutcome.promisedOutcomeRefHash
    !== outcomeIntentRefHash) {
    fail("WORK_ORDER_FROZEN_OUTCOME_MISMATCH");
  }
  return Object.freeze({ ...value,
    foundationBindings: Object.freeze({ ...bindings, typedGraph }),
    outcomeIntentRefHash });
}

function validateBinding(value) {
  exact(value, ["schema", "schemaVersion", "requestId", "programHash",
    "outcomeIntentRefHash", "expectedWorkOrderHash",
    "prospectiveCensusProjectionHash", "workOrderProjection",
    "foundationCompilation", "bindingHash"], "BINDING");
  if (value.schema !== BINDING_SCHEMA || value.schemaVersion !== "1.0.0") {
    fail("BINDING_SCHEMA_INVALID");
  }
  requestId(value.requestId);
  ["programHash", "outcomeIntentRefHash", "expectedWorkOrderHash",
    "prospectiveCensusProjectionHash"].forEach((field) =>
    hash(value[field], field.toUpperCase()));
  const checked = verifyAutonomousWorkOrderProjection(
    value.workOrderProjection, {
      expectedWorkOrderHash: value.expectedWorkOrderHash,
    });
  const compilation = verifyOutcomeProductFoundationCompilationV1(
    value.foundationCompilation);
  validateFirstPhysicalOutcomeFoundationCompilationV1(compilation, {
    requestId: value.requestId,
    goal: compilation.frozenOutcome.statement,
    budget: compilation.frozenOutcome.budget,
    completionDeadline: compilation.frozenOutcome.completionDeadline,
  });
  const { bindingHash, ...body } = value;
  if (!checked.ok
    || compilation.requestId !== value.requestId
    || compilation.program.programHash !== value.programHash
    || pinAtomicBuyerNativeFrozenArtifactV1("OUTCOME",
      compilation.frozenOutcome) !== value.outcomeIntentRefHash
    || value.workOrderProjection.promisedOutcome.promisedOutcomeRefHash
      !== value.outcomeIntentRefHash
    || bindingHash !== digest(BINDING_SCHEMA, body)) {
    fail("BINDING_REPLAY_INVALID");
  }
  return Object.freeze({ ...value, foundationCompilation: compilation });
}

/**
 * Compose model/compute, typed Episode data, and the no-payment production
 * execution path. The caller supplies an already-authoritative Work Order
 * context; this module never invents identity or delegation.
 */
export function createFirstPhysicalOutcomeUnifiedProductV1(input = {},
  dependencies = {}) {
  exact(input, ["directory", "formationWindowMs", "cleanupWindowMs"],
    "INPUT");
  exact(dependencies, ["clock", "fetchImpl", "modelInference",
    "resolveFoundationContext", "resolveRouteRequests",
    "resolveTargetCandidateBinding",
    "resolveBestBuyCandidateBinding", "bestBuyCandidateSourceRead",
    "revalidateTransactionAuthority", "witnessReadinessImpl",
    "selectShippingRate"], "DEPENDENCIES");
  if (typeof input.directory !== "string" || input.directory.length < 1
    || typeof dependencies.clock !== "function"
    || typeof dependencies.fetchImpl !== "function"
    || typeof dependencies.modelInference !== "function"
    || typeof dependencies.resolveFoundationContext !== "function"
    || (dependencies.resolveRouteRequests !== null
      && typeof dependencies.resolveRouteRequests !== "function")
    || (dependencies.resolveTargetCandidateBinding !== null
      && typeof dependencies.resolveTargetCandidateBinding !== "function")
    || (dependencies.resolveBestBuyCandidateBinding !== null
      && typeof dependencies.resolveBestBuyCandidateBinding !== "function")
    || (dependencies.bestBuyCandidateSourceRead !== null
      && typeof dependencies.bestBuyCandidateSourceRead !== "function")
    || ((dependencies.resolveBestBuyCandidateBinding === null)
      !== (dependencies.bestBuyCandidateSourceRead === null))
    || typeof dependencies.revalidateTransactionAuthority !== "function"
    || typeof dependencies.witnessReadinessImpl !== "function"
    || (dependencies.selectShippingRate !== null
      && typeof dependencies.selectShippingRate !== "function")) {
    fail("CONFIG_INVALID");
  }
  const directory = path.resolve(input.directory);
  const bindingDirectory = path.join(directory, "episode-bindings");
  const episodeDirectory = path.join(directory, "episode-data");
  ensurePrivateDirectory(directory);
  ensurePrivateDirectory(bindingDirectory);
  ensurePrivateDirectory(episodeDirectory);
  const pendingContexts = new Map();
  const bridgesByProgram = new Map();
  const bridgesByOutcome = new Map();
  const bindingsByRequest = new Map();

  function registerBinding(rawBinding) {
    const binding = validateBinding(rawBinding);
    const existingProgram = bridgesByProgram.get(binding.programHash);
    const existingOutcome = bridgesByOutcome.get(binding.outcomeIntentRefHash);
    if (existingProgram !== undefined || existingOutcome !== undefined) {
      if (bindingsByRequest.get(binding.requestId)?.bindingHash
        !== binding.bindingHash) fail("BRIDGE_BINDING_COLLISION");
      return existingProgram;
    }
    const bridge = createOutcomeProductEpisodeDataBridgeV1({
      privateDirectory: path.join(episodeDirectory,
        createHash("sha256").update(binding.requestId, "utf8").digest("hex")),
      workOrderProjection: binding.workOrderProjection,
      expectedWorkOrderHash: binding.expectedWorkOrderHash,
      expectedProgramHash: binding.programHash,
      prospectiveCensusProjectionHash:
        binding.prospectiveCensusProjectionHash,
    }, { clock: dependencies.clock });
    bridgesByProgram.set(binding.programHash, bridge);
    bridgesByOutcome.set(binding.outcomeIntentRefHash, bridge);
    bindingsByRequest.set(binding.requestId, binding);
    return bridge;
  }

  for (const name of readdirSync(bindingDirectory).filter((entry) =>
    /^[a-f0-9]{64}\.json$/u.test(entry)).sort()) {
    registerBinding(readRecord(path.join(bindingDirectory, name)));
  }

  const compiler = createOutcomeProductFoundationCompilerV1({
    modelInference: dependencies.modelInference,
    formationWindowMs: input.formationWindowMs,
    async resolveFoundationBindings(resolverInput) {
      const context = validateFoundationContext(
        await dependencies.resolveFoundationContext(resolverInput),
        resolverInput);
      pendingContexts.set(resolverInput.requestId, context);
      return context.foundationBindings;
    },
  });

  async function compileFoundation(request) {
    const existing = bindingsByRequest.get(request.requestId);
    if (existing !== undefined) {
      const expectedScopeHash = digest(
        "outsider/outcome-product-foundation-scope/v1", {
          requestId: request.requestId,
          goal: request.goal,
          budget: request.budget,
          completionDeadline: request.completionDeadline,
          context: request.context,
        });
      if (existing.foundationCompilation.requestScopeHash
          !== expectedScopeHash) fail("BINDING_REPLAY_MISMATCH");
      return existing.foundationCompilation;
    }
    const compilation = verifyOutcomeProductFoundationCompilationV1(
      await compiler.compile(request));
    validateFirstPhysicalOutcomeFoundationCompilationV1(compilation, request);
    const context = pendingContexts.get(request.requestId);
    if (context === undefined) fail("FOUNDATION_CONTEXT_NOT_RESOLVED");
    const body = {
      schema: BINDING_SCHEMA,
      schemaVersion: "1.0.0",
      requestId: request.requestId,
      programHash: compilation.program.programHash,
      outcomeIntentRefHash: context.outcomeIntentRefHash,
      expectedWorkOrderHash: context.expectedWorkOrderHash,
      prospectiveCensusProjectionHash:
        context.prospectiveCensusProjectionHash,
      workOrderProjection: context.workOrderProjection,
      foundationCompilation: compilation,
    };
    const binding = Object.freeze({ ...body,
      bindingHash: digest(BINDING_SCHEMA, body) });
    writeOnce(bindingDirectory,
      bindingFile(bindingDirectory, request.requestId), binding);
    registerBinding(binding);
    pendingContexts.delete(request.requestId);
    return compilation;
  }

  async function routeFormationEvent(event) {
    const bridge = bridgesByProgram.get(event?.programHash);
    if (bridge === undefined) fail("FORMATION_BRIDGE_NOT_FOUND");
    return bridge.formationEventSink(event);
  }

  async function routeSourceOccurrence(result) {
    const bridge = bridgesByOutcome.get(
      result?.publicProjection?.outcomeIntentRefHash);
    if (bridge === undefined) fail("SOURCE_OCCURRENCE_BRIDGE_NOT_FOUND");
    return bridge.buyerNativeSourceOccurrenceSink(result);
  }

  const product = createFirstPhysicalOutcomeProductionCompositionV1({
    directory: path.join(directory, "physical-product"),
    formationWindowMs: input.formationWindowMs,
    cleanupWindowMs: input.cleanupWindowMs,
  }, {
    clock: dependencies.clock,
    fetchImpl: dependencies.fetchImpl,
    compileFoundation,
    resolveRouteRequests: dependencies.resolveRouteRequests,
    resolveTargetCandidateBinding:
      dependencies.resolveTargetCandidateBinding,
    resolveBestBuyCandidateBinding:
      dependencies.resolveBestBuyCandidateBinding,
    bestBuyCandidateSourceRead:
      dependencies.bestBuyCandidateSourceRead,
    revalidateTransactionAuthority:
      dependencies.revalidateTransactionAuthority,
    witnessReadinessImpl: dependencies.witnessReadinessImpl,
    selectShippingRate: dependencies.selectShippingRate,
    formationEventSink: routeFormationEvent,
    buyerNativeSourceOccurrenceSink: routeSourceOccurrence,
  });

  async function combined(productResult) {
    const binding = bindingsByRequest.get(productResult.requestId);
    if (binding === undefined) fail("RESULT_BINDING_NOT_FOUND");
    const episodeData = await bridgesByProgram.get(binding.programHash).inspect();
    const body = {
      schema: OUTSIDER_FIRST_PHYSICAL_OUTCOME_UNIFIED_PRODUCT_V1_SCHEMA,
      schemaVersion: "1.0.0",
      requestId: productResult.requestId,
      programHash: productResult.programHash,
      product: productResult,
      episodeData,
      modelComputeFoundationConnected: true,
      existingTypedGraphConnected: true,
      buyerNativeExecutionConnected: true,
      paymentAttempted: false,
      orderSubmitted: false,
      outcomePromiseIssued: false,
      boundary: OUTSIDER_FIRST_PHYSICAL_OUTCOME_UNIFIED_PRODUCT_V1_BOUNDARY,
    };
    return Object.freeze({ ...body, unifiedResultHash: digest(body.schema, body) });
  }

  return Object.freeze({
    async requestOutcome(request, injected) {
      return combined(await product.requestOutcome(request, injected));
    },
    async resumeOutcome(id, injected) {
      requestId(id);
      if (!bindingsByRequest.has(id)) fail("EPISODE_BINDING_NOT_FOUND");
      return combined(await product.resumeOutcome(id, injected));
    },
    async inspect(id) {
      requestId(id);
      if (!bindingsByRequest.has(id)) fail("EPISODE_BINDING_NOT_FOUND");
      return combined(product.inspect(id));
    },
  });
}
