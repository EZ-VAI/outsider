import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_LAYOUT,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_PROOF_MATRIX,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_REQUIRED_STATE_MACHINE,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_SCHEMAS,
  beginAutonomousWorkOrderGithubDiscoveryPurgeV3,
  createAutonomousWorkOrderGithubDiscoveryLifecycleSyntheticHarnessV3,
  initializeAutonomousWorkOrderGithubDiscoveryLifecycleRegistryV3,
  inspectAutonomousWorkOrderGithubDiscoveryLifecycleRegistryV3,
  readAutonomousWorkOrderGithubDiscoveryRegisteredRawFileV3,
  recordAutonomousWorkOrderGithubDiscoveryPurgeEligibilityV3,
  registerAutonomousWorkOrderGithubDiscoveryCaptureV3,
  registerAutonomousWorkOrderGithubDiscoveryDescendantV3,
  resumeAutonomousWorkOrderGithubDiscoveryPurgeV3,
  sealAutonomousWorkOrderGithubDiscoveryDescendantCensusV3,
} from "../src/outsider-autonomous-work-order-github-discovery-lifecycle-registry-v3.js";

const HOLD_CODE =
  "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_AUDITED_DRAFT_NOT_INTEGRATED_HOLD";

const CALLABLE_ENTRY_POINTS = [
  createAutonomousWorkOrderGithubDiscoveryLifecycleSyntheticHarnessV3,
  initializeAutonomousWorkOrderGithubDiscoveryLifecycleRegistryV3,
  inspectAutonomousWorkOrderGithubDiscoveryLifecycleRegistryV3,
  registerAutonomousWorkOrderGithubDiscoveryCaptureV3,
  registerAutonomousWorkOrderGithubDiscoveryDescendantV3,
  sealAutonomousWorkOrderGithubDiscoveryDescendantCensusV3,
  recordAutonomousWorkOrderGithubDiscoveryPurgeEligibilityV3,
  beginAutonomousWorkOrderGithubDiscoveryPurgeV3,
  readAutonomousWorkOrderGithubDiscoveryRegisteredRawFileV3,
  resumeAutonomousWorkOrderGithubDiscoveryPurgeV3,
];

const SOURCE_URL = new URL(
  "../src/outsider-autonomous-work-order-github-discovery-lifecycle-registry-v3.js",
  import.meta.url,
);

test("all ten callable exports are zero-argument typed HOLDs with zero input touch",
  () => {
    let touches = 0;
    const poison = new Proxy({}, {
      get() { touches += 1; throw new Error("get trap touched"); },
      getPrototypeOf() {
        touches += 1;
        throw new Error("prototype trap touched");
      },
      ownKeys() { touches += 1; throw new Error("keys trap touched"); },
      getOwnPropertyDescriptor() {
        touches += 1;
        throw new Error("descriptor trap touched");
      },
    });
    const accessor = {};
    Object.defineProperty(accessor, "workspaceRoot", {
      enumerable: true,
      get() { touches += 1; throw new Error("accessor touched"); },
    });
    assert.equal(CALLABLE_ENTRY_POINTS.length, 10);
    for (const operation of CALLABLE_ENTRY_POINTS) {
      assert.equal(operation.length, 0);
      assert.throws(() => operation(poison, accessor), (error) =>
        error instanceof TypeError && error.message === HOLD_CODE);
    }
    assert.equal(touches, 0);
  });

test("source is import-free and contains no filesystem, process, or network calls",
  () => {
    const source = readFileSync(SOURCE_URL, "utf8");
    assert.doesNotMatch(source, /^\s*import\s/imu);
    assert.doesNotMatch(source,
      /["']node:(?:fs|fs\/promises|path|os|child_process|net|tls|http|https|dns|dgram|cluster|worker_threads)["']/u);
    assert.doesNotMatch(source,
      /\b(?:unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|mkdir|mkdirSync|open|openSync|readFile|readFileSync|writeFile|writeFileSync|lstat|lstatSync|stat|statSync|realpath|realpathSync|mkdtemp|mkdtempSync|rename|renameSync|link|linkSync|symlink|symlinkSync|opendir|opendirSync|readdir|readdirSync|chmod|chmodSync|fsync|fsyncSync|spawn|spawnSync|exec|execFile|fork|fetch)\s*\(/u);
    assert.doesNotMatch(source, /\bprocess\s*\./u);
    const fixedBodies = source.match(
      /export function [A-Za-z0-9_]+\(\) \{\n  throw new TypeErrorConstructor\(HOLD_CODE\);\n\}/gu,
    ) ?? [];
    assert.equal(fixedBodies.length, 10);
  });

test("boundary fixes production and synthetic capabilities to false and HOLD", () => {
  const boundary =
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_BOUNDARY;
  assert.equal(boundary.status, "AUDITED_DRAFT_NOT_INTEGRATED");
  assert.equal(boundary.decisionState, "HOLD");
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.actionReady, false);
  assert.equal(boundary.enabledConsequenceUnits, 0);
  assert.equal(boundary.consequenceReach, "NONE");
  assert.equal(boundary.callableEntryPointCount, 10);
  assert.equal(boundary.callableEntryPointsInspectInput, false);
  assert.equal(boundary.productionEntryPointsFixedHold, true);
  assert.equal(boundary.syntheticEntryPointsFixedHold, true);
  assert.equal(boundary.localFilesystemCapabilityPresent, false);
  assert.equal(boundary.productionFilesystemCapabilityPresent, false);
  assert.equal(boundary.syntheticFilesystemCapabilityPresent, false);
  assert.equal(boundary.networkCapabilityPresent, false);
  assert.equal(boundary.processExecutionCapabilityPresent, false);
  assert.equal(boundary.productionLifecycleRegistryExecutable, false);
  assert.equal(boundary.syntheticLifecycleRegistryExecutable, false);
  assert.equal(boundary.productionLocalPurgeExecutable, false);
  assert.equal(boundary.syntheticLocalPurgeExecutable, false);
  assert.equal(boundary.productionLocalDeleteEnabled, false);
  assert.equal(boundary.syntheticLocalDeleteEnabled, false);
  assert.equal(boundary.recursiveDeleteCapabilityPresent, false);
  assert.equal(boundary.existingAcquisitionAndPublicationKillGatesLifted,
    false);
  assert.equal(boundary.stage1EngineeringGateSatisfied, false);
  assert.equal(boundary.stage1ExternalFactGateSatisfied, false);
  assert.equal(boundary.stage1EngineeringGatePassed, false);
  assert.equal(boundary.stage1ExternalFactGatePassed, false);
  assert.equal(boundary.stage1Complete, false);
  assert.equal(boundary.stage2Permitted, false);
  assert.equal(boundary.sourceReplayVerified, false);
  assert.equal(boundary.rightsPrivacyAdjudicationEstablished, false);
  assert.equal(boundary.directParticipantConfirmationEstablished, false);
  assert.equal(boundary.networkOrderEstablished, false);
  assert.equal(boundary.actionAuthorized, false);
  assert.equal(boundary.executable, false);
  assert.equal(boundary.actionUnits, 0);
  assert.equal(boundary.automaticTraining, false);
  assert.equal(boundary.productionTrainingAuthorized, false);
  assert.equal(boundary.trainingRows, 0);
  assert.equal(boundary.causalExperienceUnits, 0);
  assert.equal(boundary.CEU, 0);
  assert.equal(boundary.pricingAuthorized, false);
  assert.equal(boundary.pricingUnits, 0);
  assert.equal(boundary.guaranteeEstablished, false);
  assert.equal(boundary.guaranteeUnits, 0);
  assert.equal(boundary.insuranceEstablished, false);
  assert.equal(boundary.insuranceUnits, 0);
  assert.equal(boundary.settlementAuthorized, false);
  assert.equal(boundary.settlementUnits, 0);
  assert.equal(boundary.custodyEstablished, false);
  assert.equal(boundary.custodyUnits, 0);
  assert.equal(boundary.moneyMovementEnabled, false);
  assert.equal(boundary.moneyMovementUnits, 0);
});

test("required future state machine preserves drain-to-intent-to-cascade order",
  () => {
    const machine =
      AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_REQUIRED_STATE_MACHINE;
    assert.equal(machine.status, "AUDITED_DRAFT_NOT_INTEGRATED");
    assert.equal(machine.implemented, false);
    assert.deepEqual(machine.orderedStates, [
      "REGISTER_CAPTURE_BEFORE_CAPTURE_DIRECTORY_OR_FIRST_GET",
      "DRAIN_BARRIER_DURABLE",
      "ZERO_DURABLE_LEASES_VERIFIED",
      "PURGE_ELIGIBILITY_FROM_VERIFIED_CONTROL_SOURCE",
      "PURGE_INTENT_DURABLE",
      "FINITE_DESCENDANT_CASCADE_DURABLE",
      "EXACT_NONRECURSIVE_DELETE",
      "PURGE_RECEIPT_DURABLE",
    ]);
    assert.equal(machine.requiredTransitions.length, 7);
    assert.equal(machine.requiredTransitions.every((row) =>
      row.implemented === false), true);
    assert.deepEqual(machine.requiredTransitions.slice(1, 7).map((row) =>
      `${row.from}->${row.to}`), [
      "DRAIN_BARRIER_DURABLE->ZERO_DURABLE_LEASES_VERIFIED",
      "ZERO_DURABLE_LEASES_VERIFIED->PURGE_ELIGIBILITY_FROM_VERIFIED_CONTROL_SOURCE",
      "PURGE_ELIGIBILITY_FROM_VERIFIED_CONTROL_SOURCE->PURGE_INTENT_DURABLE",
      "PURGE_INTENT_DURABLE->FINITE_DESCENDANT_CASCADE_DURABLE",
      "FINITE_DESCENDANT_CASCADE_DURABLE->EXACT_NONRECURSIVE_DELETE",
      "EXACT_NONRECURSIVE_DELETE->PURGE_RECEIPT_DURABLE",
    ]);
  });

test("proof matrix is finite, explicit, and entirely unestablished", () => {
  const matrix =
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_PROOF_MATRIX;
  assert.equal(matrix.length, 10);
  assert.equal(matrix.every((row) => row.required === true
    && row.established === false && row.evidence === null), true);
  assert.deepEqual(matrix.map((row) => row.proofId), [
    "CAPTURE_REGISTRATION_BEFORE_SIDE_EFFECT",
    "SHARED_EXTERNAL_LIFECYCLE_HEAD",
    "ACQUISITION_AND_PUBLICATION_DRAIN_BARRIER",
    "ZERO_DURABLE_READER_LEASES",
    "VERIFIED_SOURCE_SPECIFIC_PURGE_ELIGIBILITY",
    "FINITE_GLOBAL_DESCENDANT_CENSUS",
    "INTENT_AND_ALL_TOMBSTONES_BEFORE_RAW_ACCESS",
    "STABLE_ANCESTOR_HANDLE_AND_NOFOLLOW_RELATIVE_DELETE",
    "CRASH_RESUMABLE_COMMIT_LAST_JOURNAL",
    "INCOMPLETE_ZERO_THROUGH_FIVE_RAW_CENSUS",
  ]);
});

test("schemas and layout are inert frozen contract data", () => {
  assert.equal(Object.isFrozen(
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_SCHEMAS),
  true);
  assert.equal(Object.isFrozen(
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_LAYOUT),
  true);
  assert.equal(
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_SCHEMAS
      .registryEntry,
    "outsider/autonomous-work-order-github-discovery-lifecycle-registry-entry/v3",
  );
  assert.equal(
    AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_LIFECYCLE_REGISTRY_V3_LAYOUT
      .registryRootRelative,
    "artifacts/private-source-captures/lifecycle/registry-v3",
  );
});

test("legacy acquisition, purge, and snapshot gates remain physically unchanged",
  () => {
    const acquisition = readFileSync(new URL(
      "../scripts/acquire-autonomous-work-order-github-discovery-snapshot.mjs",
      import.meta.url), "utf8");
    const purge = readFileSync(new URL(
      "../scripts/purge-autonomous-work-order-github-discovery-snapshot.mjs",
      import.meta.url), "utf8");
    const snapshot = readFileSync(new URL(
      "../src/outsider-autonomous-work-order-github-discovery-snapshot.js",
      import.meta.url), "utf8");
    assert.match(acquisition, /const LIVE_ACQUISITION_ENABLED = false;/u);
    assert.match(purge, /const PURGE_LIFECYCLE_INTEGRATED = false;/u);
    assert.match(snapshot, /PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED/u);
  });
