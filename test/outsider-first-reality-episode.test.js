import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  FIRST_REALITY_EPISODE_PROFILES,
  FIRST_REALITY_EPISODE_SCHEMAS,
  createFirstRealityEpisodePlan,
  preflightFirstRealityEpisode,
  verifyFirstRealityEpisodePlan,
} from "../src/outsider-first-reality-episode.js";
import {
  TRACE_SCHEMA,
  WORLD_KINDS,
  makeExecutionTrace,
  normalizeExecution,
  registerAdapter,
} from "../src/outsider-execution-trace.js";
import {
  DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
  DEVICE_STREAM_PHYSICS_SCHEMAS,
  futureDeviceAdapterContract,
} from "../src/outsider-device-stream-physics-frontier.js";
import {
  PHYSICAL_DELEGATION_ENVELOPE_SCHEMA,
  PRIMITIVE_ATTEMPT_SCHEMA,
  createPhysicalDelegationEnvelope,
  createPrimitiveAttempt,
} from "../src/outsider-physical-delegation.js";
import {
  PHYSICAL_TELEMETRY_SCHEMAS,
  createPhysicalTelemetryAssessment,
} from "../src/outsider-physical-telemetry.js";
import {
  REALITY_STEWARDSHIP_SCHEMAS,
} from "../src/outsider-reality-stewardship.js";
import {
  STAGE1_LIFECYCLE_SCHEMAS,
} from "../src/outsider-stage1-lifecycle-frontier.js";
import {
  CURATE_SCHEMAS,
} from "../src/outsider-curate-core.js";
import {
  STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
} from "../src/outsider-stage2-quote-frontier.js";
import {
  defaultAnchorPolicy as defaultRunCensusAnchorPolicy,
} from "../src/outsider-run-census.js";

const ROOT = path.resolve(".");
const TOOL = path.join(ROOT, "tools/outsider-first-reality-episode.mjs");
const REMOTE_EXAMPLE = path.join(ROOT, "examples/first-reality-episode",
  "remote-action.example.json");
const PHYSICAL_EPISODE_TEMPLATE = path.join(ROOT, "examples/first-reality-episode",
  "physical-action.episode-join.template.json");
const HASH_A = `sha256:${"a".repeat(64)}`;

const HORIZONS = Object.freeze([
  Object.freeze({ horizonId: "RECOVERY_30D", closesAfterMs: 2_592_000_000,
    mandatory: true }),
  Object.freeze({ horizonId: "IMMEDIATE", closesAfterMs: 0, mandatory: true }),
  Object.freeze({ horizonId: "DELAYED_24H", closesAfterMs: 86_400_000,
    mandatory: true }),
]);

function makePlan(profile = FIRST_REALITY_EPISODE_PROFILES.REMOTE_ACTION,
  attemptCensusSlotCommitmentHash = null) {
  return createFirstRealityEpisodePlan({
    planId: `first-${profile.toLowerCase().replaceAll("_", "-")}`,
    profile,
    attemptCensusSlotCommitmentHash,
    observationHorizons: HORIZONS,
  });
}

function assertNoAuthority(authority) {
  for (const [key, value] of Object.entries(authority)) {
    if (key.endsWith("Authority") || key === "callerBooleanCanElevate"
      || key === "productionAuthority") assert.equal(value, false, key);
  }
  assert.equal(authority.causalExperienceUnits, 0);
  for (const key of ["price", "premium", "capital", "coverage", "guarantee",
    "settlement"]) assert.equal(authority[key], null, key);
}

test("First Reality Episode profiles are closed and a remote plan stays null-authority", () => {
  assert.deepEqual(Object.values(FIRST_REALITY_EPISODE_PROFILES), [
    "REMOTE_ACTION", "PHYSICAL_ACTION",
  ]);
  const plan = makePlan();
  assert.equal(plan.schema, FIRST_REALITY_EPISODE_SCHEMAS.plan);
  assert.match(plan.planHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(plan.profile, "REMOTE_ACTION");
  assert.equal(plan.profileContract.adapterRoute.outputSchema, TRACE_SCHEMA);
  assert.deepEqual(plan.profileContract.adapterRoute.requiredCallOrder,
    ["registerAdapter", "normalizeExecution"]);
  assert.equal(plan.profileContract.adapterRoute.worksheetMayPreShapeMakeExecutionTraceInput,
    false);
  assert.equal(plan.profileContract.adapterRoute.directMakeExecutionTraceEntrypointPermitted,
    false);
  assert.equal(plan.profileContract.adapterRoute.defaultWorldKindUntilAdapterEvidence,
    "unknown");
  assert.deepEqual(WORLD_KINDS.unknown, { reversible: false, externality: true });
  assert.equal(plan.profileContract.routingBoundary.logsAuthorizeAction, false);
  assert.equal(plan.profileContract.routingBoundary.remoteSuccessMayBePromotedByThisPlan,
    false);
  assert.equal(plan.attemptCensus.attemptCensusSlotCommitmentHash, null);
  assert.equal(plan.attemptCensus.primitiveStatus,
    "LOCAL_CENSUS_PRIMITIVE_AND_PRODUCT_KERNEL_PATH_PRESENT");
  assert.equal(plan.attemptCensus.productKernelIntegrationEstablishedByThisPlan, false);
  assert.equal(plan.attemptCensus.realPreActionSlotEstablished, false);
  assert.equal(plan.attemptCensus.ledgerHash, null);
  assert.equal(plan.attemptCensus.verifierRequirement.status,
    "PRODUCT_KERNEL_CENSUS_PATH_PRESENT_REAL_EPISODE_PREACTION_SLOT_AND_PROMOTION_JOIN_UNPROVEN");
  assert.equal(plan.attemptCensus.verifierRequirement
    .mustPreserveRejectedAbortedTimedOutAndMissingAttempts, true);
  assert.equal(plan.claimWayWorld.claimHash, null);
  assert.equal(plan.sourceAcquisition.acquisitionRootHash, null);
  assert.equal(plan.measurement.clock.sourceClockId, null);
  assert.equal(plan.monitorRegime.monitorDisclosure, null);
  assert.equal(plan.independentOutcome.outcomeHash, null);
  assert.equal(plan.independentOutcome.sourceNativeOutcomeAcceptedAsIndependent, false);
  assert.equal(plan.delayedConsequence.observationHorizons[0].horizonId, "IMMEDIATE");
  assert.equal(plan.delayedConsequence.immediateSuccessClosesEpisode, false);
  assert.equal(plan.curate.causalExperienceUnits, 0);
  assert.equal(plan.curate.automaticTraining, false);
  assert.equal(plan.composition.runCensus.primitiveStatus,
    "LOCAL_TAMPER_EVIDENT_CENSUS_PRIMITIVE_PRODUCT_KERNEL_PATH_PRESENT");
  assert.equal(plan.composition.runCensus.defaultAnchorPolicySchema,
    defaultRunCensusAnchorPolicy().schema);
  assert.match(plan.composition.runCensus.defaultAnchorPolicyHash,
    /^sha256:[a-f0-9]{64}$/);
  assert.equal(plan.composition.runCensus.realPreActionRegistrationEstablished, false);
  assert.equal(plan.composition.runCensus.realPreActionContractBindingEstablished, false);
  assert.equal(plan.composition.runCensus.productKernelIntegrationEstablishedByThisPlan,
    false);
  assert.equal(plan.adapterJoin.promotionVerifierStatus,
    "CENSUS_PRIMITIVE_PRESENT_CROSS_PROTOCOL_PROMOTION_VERIFIER_UNPROVEN");
  assert.equal(plan.adapterJoin.bindingStatus, "WAITING_FOR_EXTERNAL_ARTIFACTS");
  assert.equal(plan.adapterJoin.allRequiredBindingsSatisfied, false);
  assert.equal(plan.adapterJoin.readyForPromotion, false);
  const remoteIngress = plan.adapterJoin.requiredBindings.protocolArtifacts
    .find((binding) => binding.bindingId === "REMOTE_RAW_SOURCE_ADAPTER_NORMALIZATION");
  assert.deepEqual(remoteIngress.orderedEntrypoints,
    ["registerAdapter", "normalizeExecution"]);
  assert.equal(remoteIngress.worksheetMaySupplyMakeExecutionTraceInput, false);
  assert.equal(remoteIngress.directMakeExecutionTraceEntrypointPermitted, false);
  assertNoAuthority(plan.authority);

  const checked = verifyFirstRealityEpisodePlan(plan);
  assert.equal(checked.ok, true);
  assert.equal(checked.externalFactsReverified, false);
  assert.equal(checked.sourceArtifactsReplayed, false);
  assert.equal(checked.readyForRealAction, false);
  assertNoAuthority(checked.authority);
});

test("remote worksheet is a raw source reference, never makeExecutionTrace input", () => {
  const worksheet = JSON.parse(readFileSync(REMOTE_EXAMPLE, "utf8"));
  assert.equal(typeof registerAdapter, "function");
  assert.equal(typeof normalizeExecution, "function");
  assert.equal(Object.hasOwn(worksheet, "executionTraceProjectionInput"), false);
  assert.equal(Object.hasOwn(worksheet, "makeExecutionTraceInput"), false);
  const ingress = worksheet.remoteSourceIngress;
  assert.equal(ingress.rawSourceReference.rawBytesEmbedded, false);
  assert.equal(ingress.rawSourceReference.immutableObjectReferenceHash, null);
  assert.equal(ingress.adapter.adapterNameHint, null);
  assert.equal(ingress.adapter.adapterImplementationCommitmentHash, null);
  assert.equal(ingress.adapter.adapterSourceSchemaCommitmentHash, null);
  assert.deepEqual(ingress.adapter.requiredCallOrder,
    ["registerAdapter", "normalizeExecution"]);
  assert.equal(ingress.adapter.directWorksheetToMakeExecutionTraceAllowed, false);
  for (const field of ["executor", "world", "claim", "steps", "resources", "outcome",
    "extractorId"]) assert.equal(Object.hasOwn(ingress, field), false, field);
  assert.throws(() => makeExecutionTrace(ingress), /TRACE_NO_EXECUTOR/);
});

test("physical profile composes the existing device contract without implementing a parser", () => {
  const plan = makePlan(FIRST_REALITY_EPISODE_PROFILES.PHYSICAL_ACTION);
  const route = plan.profileContract.adapterRoute;
  assert.equal(route.adapterDescriptorSchema,
    DEVICE_STREAM_PHYSICS_SCHEMAS.adapterDescriptor);
  assert.equal(route.platformParameterManifestSchema,
    DEVICE_STREAM_PHYSICS_SCHEMAS.platformManifest);
  assert.equal(route.requiredAdapterOutputSchemaHash,
    DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH);
  assert.equal(route.defaultWorldKind, "physical");
  assert.equal(plan.profileContract.routingBoundary
    .sourceNativeOutcomeIsIndependentConsequence, false);
  assert.equal(plan.profileContract.routingBoundary
    .physicsTruthExternallyVerifiedByLocalReplay, false);
  assert.deepEqual(plan.profileContract.knownUnimplementedFormatContracts,
    [futureDeviceAdapterContract("MCAP"), futureDeviceAdapterContract("ROSBAG2")]
      .map((contract) => ({ formatFamily: contract.formatFamily,
        contractHash: contract.contractHash, parserStatus: contract.parserStatus })));
  assert.equal(plan.composition.deviceStream.adapterOutputSchemaHash,
    DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH);
  assert.equal(plan.stewardship.boundarySchema,
    REALITY_STEWARDSHIP_SCHEMAS.boundary);

  const bindings = new Map(plan.adapterJoin.requiredBindings.protocolArtifacts
    .map((binding) => [binding.bindingId, binding]));
  assert.equal(typeof createPhysicalDelegationEnvelope, "function");
  assert.equal(typeof createPrimitiveAttempt, "function");
  assert.equal(typeof createPhysicalTelemetryAssessment, "function");
  const sourceReplay = bindings.get("DEVICE_STREAM_ADAPTER_SOURCE_REPLAY");
  assert.deepEqual(sourceReplay.entrypoints,
    ["DeviceStreamAdapterRegistry.register", "DeviceStreamAdapterRegistry.replay"]);
  assert.deepEqual(sourceReplay.artifactSchemas, [
    DEVICE_STREAM_PHYSICS_SCHEMAS.adapterDescriptor,
    DEVICE_STREAM_PHYSICS_SCHEMAS.sourceManifest,
    DEVICE_STREAM_PHYSICS_SCHEMAS.platformManifest,
    DEVICE_STREAM_PHYSICS_SCHEMAS.adapterOutput,
  ]);
  assert.equal(sourceReplay.requiredAdapterOutputSchemaHash,
    DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH);
  assert.deepEqual(bindings.get("PHYSICAL_DELEGATION_ENVELOPE"), {
    bindingId: "PHYSICAL_DELEGATION_ENVELOPE",
    module: "outsider-physical-delegation.js",
    entrypoint: "createPhysicalDelegationEnvelope",
    artifactSchema: PHYSICAL_DELEGATION_ENVELOPE_SCHEMA,
    temporalRequirement: "PRE_ACTION",
    authorityGranted: false,
  });
  assert.equal(bindings.get("PHYSICAL_PRIMITIVE_ATTEMPT").entrypoint,
    "createPrimitiveAttempt");
  assert.equal(bindings.get("PHYSICAL_PRIMITIVE_ATTEMPT").artifactSchema,
    PRIMITIVE_ATTEMPT_SCHEMA);
  assert.equal(bindings.get("PHYSICAL_TELEMETRY_ASSESSMENT").entrypoint,
    "createPhysicalTelemetryAssessment");
  assert.equal(bindings.get("PHYSICAL_TELEMETRY_ASSESSMENT").artifactSchema,
    PHYSICAL_TELEMETRY_SCHEMAS.assessment);
  assert.equal(bindings.get("PHYSICAL_TELEMETRY_ASSESSMENT")
    .missingTelemetryImputedAsZero, false);
  assert.equal(bindings.get("MONITOR_REGIME").source.planSlot, "monitorRegime");
  assert.equal(bindings.get("MONITOR_REGIME").requiredFields
    .includes("evaluationTriggerFactorsHash"), true);

  const stewardship = bindings.get("REALITY_STEWARDSHIP_RIGHTS_BUDGET_RESPONSIBILITY");
  assert.equal(stewardship.entrypoints.includes("createRealityBoundary"), true);
  assert.equal(stewardship.entrypoints.includes("createStewardshipClaim"), true);
  assert.equal(stewardship.entrypoints.includes("createRealityBudgetCommitment"), true);
  assert.equal(stewardship.entrypoints.includes("createRealityExecutionReceipt"), true);
  assert.equal(stewardship.requiredPlanSlots.includes("experienceRightsHash"), true);
  assert.equal(stewardship.requiredPlanSlots.includes("responsibilityRootHash"), true);
  assert.equal(stewardship.requiredPlanSlots.includes("cumulativeRealityBudgetLedgerHash"),
    true);

  const attest = bindings.get("ATTEST_SOURCE_REPLAY_AND_LIFECYCLE");
  assert.equal(attest.artifactSchemas.includes(STAGE1_LIFECYCLE_SCHEMAS.state), true);
  const curate = bindings.get("CURATE_CLEARANCE_AND_LEARNING_DECISION");
  assert.equal(curate.artifactSchemas.includes(CURATE_SCHEMAS.fitToLearnDecision), true);
  const delayed = bindings.get("DELAYED_CONSEQUENCE_OBLIGATIONS");
  assert.equal(delayed.artifactSchemas.includes(
    REALITY_STEWARDSHIP_SCHEMAS.consequenceState), true);
  assert.equal(delayed.immediateSuccessClosesObligation, false);
  const stage2 = bindings.get("STAGE2_PRE_ACTION_TARGET_CONTRACT");
  assert.equal(stage2.factorPolicyHash, STAGE2_PRE_ACTION_FACTOR_POLICY_HASH);
  assert.equal(stage2.source.planSlot, "stage2TargetContract");
  for (const binding of bindings.values()) assert.equal(binding.authorityGranted, false);
  assert.equal(plan.adapterJoin.allRequiredBindingsSatisfied, false);
  assert.equal(plan.adapterJoin.readyForPromotion, false);
});

test("physical episode worksheet contains only OOB artifact slots and no authority", () => {
  const worksheet = JSON.parse(readFileSync(PHYSICAL_EPISODE_TEMPLATE, "utf8"));
  assert.equal(worksheet.templateStatus, "NON_PROTOCOL_UNEXECUTED_TEMPLATE");
  assert.equal(worksheet.profile, "PHYSICAL_ACTION");
  assert.equal(worksheet.isExecuted, false);
  for (const slot of ["delegationEnvelope", "primitiveAttempt", "telemetryAssessment"]) {
    const artifact = worksheet.outOfBandArtifactSlots[slot];
    assert.equal(artifact.artifactStoredOutOfBand, true);
    assert.equal(artifact.immutableObjectReferenceHash, null);
    assert.equal(artifact.byteLength, null);
    assert.equal(artifact.sha256, null);
    assert.equal(artifact.artifactHash, null);
  }
  assert.equal(worksheet.outOfBandArtifactSlots.deviceStreamSourceReplay
    .adapterOutputHash, null);
  assert.equal(worksheet.attemptCensusSlotCommitmentHash, null);
  assert.equal(worksheet.disposition, "HOLD_UNEXECUTED_MISSING_PHYSICAL_ARTIFACTS");
  assert.equal(worksheet.boundary.authority, "none");
  assert.equal(worksheet.boundary.causalExperienceUnits, 0);
  assert.equal(worksheet.boundary.readyForRealAction, false);
  assert.equal(worksheet.boundary.readyForPromotion, false);
  for (const permitted of Object.values(worksheet.boundary.permits)) {
    assert.equal(permitted, false);
  }
});

test("Stage 1/1.5/Reality/Stage 2 are slots and fixed abstention boundaries", () => {
  const plan = makePlan();
  assert.equal(plan.attest.sourceReplayReceiptHash, null);
  assert.equal(plan.attest.timestampProviderReceiptHash, null);
  assert.equal(plan.attest.membershipProviderReceiptHash, null);
  assert.equal(plan.attest.revocationProviderReceiptHash, null);
  assert.equal(plan.attest.retentionProviderReceiptHash, null);
  assert.equal(plan.attest.rightsEstablished, false);
  assert.equal(plan.curate.clearanceHash, null);
  assert.equal(plan.curate.fitToLearnDecisionHash, null);
  assert.equal(plan.stewardship.resourceOwnerRootHash, null);
  assert.equal(plan.stewardship.affectedPartyRegisterRootHash, null);
  assert.equal(plan.stewardship.consequenceStateHash, null);

  const target = plan.stage2TargetContract;
  assert.equal(target.factorPolicyHash, STAGE2_PRE_ACTION_FACTOR_POLICY_HASH);
  assert.equal(target.preAction.factorReceiptHash, null);
  assert.equal(target.validityDomain.transportabilityEstimandHash, null);
  assert.equal(target.exposureAndLoss.exposureUnit, null);
  assert.equal(target.exposureAndLoss.occurrenceClockPolicyHash, null);
  assert.equal(target.exposureAndLoss.reportClockPolicyHash, null);
  assert.equal(target.exposureAndLoss.adjudicationClockPolicyHash, null);
  assert.equal(target.exposureAndLoss.recoveryClockPolicyHash, null);
  assert.equal(target.exposureAndLoss.reopenClockPolicyHash, null);
  assert.equal(target.exposureAndLoss.censoringAndMaturityPolicyHash, null);
  assert.equal(target.exposureAndLoss.dependenceRootPolicyHash, null);
  assert.equal(target.admission.targetPreActionRowsAdmitted, 0);
  assert.equal(target.admission.targetModelComponentsFitted, 0);
  assert.equal(target.admission.targetDomainTransferEstablished, false);
  assert.equal(target.admission.decision, "NON_BINDING_ABSTAIN");
  assert.deepEqual(target.outputs, {
    frequency: null, severity: null, tail: null, price: null, premium: null,
    capital: null, coverage: null,
  });
});

test("missing census slot waits and v1 refuses caller-supplied commitment hashes", () => {
  const missing = makePlan();
  const missingPreflight = preflightFirstRealityEpisode(missing);
  assert.equal(missingPreflight.ok, true);
  assert.equal(missingPreflight.status, "WAITING_FOR_EXTERNAL_EVIDENCE");
  assert.equal(missingPreflight.readyForAdapterIntegration, true);
  assert.equal(missingPreflight.readyForRealAction, false);
  assert.equal(missingPreflight.missingRequirements.includes(
    "EXTERNALLY_PRODUCED_ATTEMPT_CENSUS_SLOT_COMMITMENT"), true);
  assert.equal(missingPreflight.causalExperienceUnits, 0);
  assertNoAuthority(missingPreflight.authority);

  assert.throws(() => makePlan("REMOTE_ACTION", HASH_A),
    /REAL_PREACTION_CENSUS_SLOT_NOT_ESTABLISHED_MUST_REMAIN_NULL/);
});

test("caller booleans, bad horizons, unknown profiles, and tampering cannot promote", () => {
  assert.throws(() => createFirstRealityEpisodePlan({
    planId: "bad", profile: "REMOTE_ACTION", attemptCensusSlotCommitmentHash: null,
    observationHorizons: HORIZONS, verified: true,
  }), /PLAN_INPUT_SHAPE_INVALID/);
  assert.throws(() => createFirstRealityEpisodePlan({
    planId: "bad", profile: "REMOTE_ACTION", attemptCensusSlotCommitmentHash: true,
    observationHorizons: HORIZONS,
  }), /REAL_PREACTION_CENSUS_SLOT_NOT_ESTABLISHED_MUST_REMAIN_NULL/);
  assert.throws(() => createFirstRealityEpisodePlan({
    planId: "bad", profile: "DRONE_ACTION", attemptCensusSlotCommitmentHash: null,
    observationHorizons: HORIZONS,
  }), /PROFILE_INVALID/);
  assert.throws(() => createFirstRealityEpisodePlan({
    planId: "bad", profile: "REMOTE_ACTION", attemptCensusSlotCommitmentHash: null,
    observationHorizons: [
      { horizonId: "IMMEDIATE", closesAfterMs: 0, mandatory: true },
      { horizonId: "ALSO_IMMEDIATE", closesAfterMs: 0, mandatory: true },
    ],
  }), /IMMEDIATE_AND_DELAYED_REQUIRED/);
  assert.throws(() => createFirstRealityEpisodePlan({
    planId: "bad", profile: "REMOTE_ACTION", attemptCensusSlotCommitmentHash: null,
    observationHorizons: [
      { horizonId: "IMMEDIATE", closesAfterMs: 0, mandatory: true },
      { horizonId: "DELAYED", closesAfterMs: 1, mandatory: false },
    ],
  }), /HORIZON_MUST_BE_MANDATORY/);

  const sparseHorizons = [...HORIZONS];
  sparseHorizons.length += 1;
  assert.equal(Object.hasOwn(sparseHorizons, sparseHorizons.length - 1), false);
  assert.throws(() => createFirstRealityEpisodePlan({
    planId: "bad", profile: "REMOTE_ACTION", attemptCensusSlotCommitmentHash: null,
    observationHorizons: sparseHorizons,
  }), /OBSERVATION_HORIZONS_MUST_BE_DENSE/);

  const tampered = structuredClone(makePlan());
  tampered.authority.actionAuthority = true;
  const checked = verifyFirstRealityEpisodePlan(tampered);
  assert.equal(checked.ok, false);
  assert.equal(checked.readyForRealAction, false);
  assertNoAuthority(checked.authority);
  const preflight = preflightFirstRealityEpisode(tampered);
  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, "INVALID_PLAN");
  assert.equal(preflight.readyForRealAction, false);
  assertNoAuthority(preflight.authority);
});

test("offline CLI plans, verifies, and preflights through stdin", () => {
  const planned = spawnSync(process.execPath, [TOOL, "plan", "--plan-id", "cli-physical",
    "--profile", "PHYSICAL_ACTION"], { cwd: ROOT, encoding: "utf8", timeout: 10_000 });
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.profile, "PHYSICAL_ACTION");
  assert.equal(plan.attemptCensus.attemptCensusSlotCommitmentHash, null);

  const verified = spawnSync(process.execPath, [TOOL, "verify", "--input", "-"], {
    cwd: ROOT, encoding: "utf8", timeout: 10_000, input: planned.stdout,
  });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).ok, true);

  const preflight = spawnSync(process.execPath, [TOOL, "preflight", "--input", "-"], {
    cwd: ROOT, encoding: "utf8", timeout: 10_000, input: planned.stdout,
  });
  assert.equal(preflight.status, 0, preflight.stderr);
  const result = JSON.parse(preflight.stdout);
  assert.equal(result.status, "WAITING_FOR_EXTERNAL_EVIDENCE");
  assert.equal(result.readyForRealAction, false);
  assert.equal(result.missingRequirements.includes(
    "EXTERNALLY_PRODUCED_ATTEMPT_CENSUS_SLOT_COMMITMENT"), true);
});
