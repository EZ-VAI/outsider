import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildStage2CurrentChainAdmission,
  buildStage2CurrentChainAdmissionContract,
  buildStage2CurrentChainAdmissionContractCandidate,
  describeStage2CurrentChainAdmission,
  STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL,
  STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA,
  STAGE2_CURRENT_CHAIN_ADMISSION_FROZEN_AT,
  STAGE2_CURRENT_CHAIN_ADMISSION_SCHEMA,
  STAGE2_CURRENT_CHAIN_PINS,
  STAGE2_CURRENT_CHAIN_PIN_SET_HASH,
  verifyStage2CurrentChainAdmissionAgainstSources,
  verifyStage2CurrentChainAdmissionCanonicalAgainstSources,
  verifyStage2CurrentChainAdmissionCanonicalStructure,
  verifyStage2CurrentChainAdmissionContractAgainstSources,
  verifyStage2CurrentChainAdmissionContractStructure,
  verifyStage2CurrentChainAdmissionStructure,
} from "../src/outsider-stage2-current-chain-admission.js";
import {
  buildStage3GateFullSourceFixture,
} from "./fixtures/stage3-gate-full-source-fixture.mjs";

const ARCHITECTURE = path.resolve(
  STAGE2_CURRENT_CHAIN_PINS.architecture.repositoryRelativePath);
const MATH = path.resolve(STAGE2_CURRENT_CHAIN_PINS.math.repositoryRelativePath);
const MATH_SOURCE_PROFILE = path.resolve(
  "artifacts/actuarial-model-evolution-20260828/source-profile-v11.json");
const STALE_ARCHITECTURE = path.resolve(
  "artifacts/actuarial-model-evolution-20260822/final-v4/architecture.json");
const STALE_MATH = path.resolve(
  "artifacts/real-responsibility-math-diagnostics-20260821/final-v9/diagnostics.json");
const CONTRACT = path.resolve(
  STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.repositoryRelativePath);
const PREVIOUS_CONTRACT = path.resolve(
  "artifacts/stage2-current-chain-admission-20260828/final-v3/contract.json");
const PREVIOUS_CONTRACT_MARKER = path.resolve(
  "artifacts/stage2-current-chain-admission-20260828/final-v3/superseded-by.json");
const HAS_FULL_CHAIN = [
  ARCHITECTURE, MATH, MATH_SOURCE_PROFILE, STALE_ARCHITECTURE, STALE_MATH, CONTRACT,
]
  .every(existsSync);

let fixture;
let input;
let chainInput;
let contract;
let admission;

function reseal(receipt) {
  const body = structuredClone(receipt);
  delete body.receiptHash;
  return { ...body, receiptHash: `sha256:${createHash("sha256")
    .update(`${STAGE2_CURRENT_CHAIN_ADMISSION_SCHEMA}\0${canonicalizeStrict(body)}`,
      "utf8")
    .digest("hex")}` };
}

before(async () => {
  if (!HAS_FULL_CHAIN) return;
  fixture = await buildStage3GateFullSourceFixture();
  const mathSources = JSON.parse(readFileSync(MATH_SOURCE_PROFILE, "utf8"));
  input = {
    frontier: fixture.stage34Context.stage2Frontier,
    frontierSources: fixture.stage34Context.stage2Sources,
    mathArtifactPath: MATH,
    architectureArtifactPath: ARCHITECTURE,
    mathSources,
  };
  chainInput = {
    mathArtifactPath: MATH,
    architectureArtifactPath: ARCHITECTURE,
    mathSources,
  };
}, { timeout: 180_000 });

after(() => fixture?.cleanup());

test("one updateable pin contract distinguishes quarantined Clinical from ordered Wave5",
  () => {
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.clinicalTrials.canonicalRelease, "final-v3");
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.wave5Intake.canonicalRelease, "final-v3");
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.temporalAudit.canonicalRelease, "final-v2");
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.catalog.canonicalRelease, "final-v18");
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.flywheel.canonicalRelease, "final-v16");
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.math.canonicalRelease, "final-v14");
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.architecture.canonicalRelease, "final-v11");
  assert.match(STAGE2_CURRENT_CHAIN_PIN_SET_HASH, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(STAGE2_CURRENT_CHAIN_PINS
    .selectedTemporallyAuditedWaveSubgraph.nodes, [
    "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
    "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
    "STAGE0_SOURCE_TEMPORAL_AUDIT",
    "REAL_CASE_GAP_EVIDENCE_CATALOG",
    "REAL_CASE_RESPONSIBILITY_FLYWHEEL",
    "REAL_RESPONSIBILITY_MATH_DIAGNOSTICS",
    "ACTUARIAL_MODEL_EVOLUTION",
  ]);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS
    .selectedTemporallyAuditedWaveSubgraph.edges.length, 11);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.flywheel.requiredArtifactReceiptCount, 16);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.flywheel.requiredArtifactReceiptSetHash,
    "sha256:ff9dd2cdf4a48d84d6667f606a0b28608920738c6d269ea99dd064bb5ee16d7a");
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.clinicalTrials.currentRoutingEligible, false);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.clinicalTrials.currentCoverage, false);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.clinicalTrials.currentTruth, false);
  assert.doesNotMatch(STAGE2_CURRENT_CHAIN_PINS.clinicalTrials.artifactPathRole,
    /CURRENT/u);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.wave5Intake.currentRoutingEligible, true);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.wave5Intake.trainingAdmission, false);
  assert.equal(STAGE2_CURRENT_CHAIN_PINS.wave5Intake.operationalAuthorityGranted,
    false);
});

test("canonicalizable contract has no synthetic Claim, Way, World, or quote", {
  skip: !HAS_FULL_CHAIN,
  timeout: 600_000,
}, async () => {
  const mutableInput = { ...chainInput };
  const building = buildStage2CurrentChainAdmissionContract(mutableInput);
  setTimeout(() => { mutableInput.mathSources = {}; }, 0);
  contract = await building;
  const checked = verifyStage2CurrentChainAdmissionContractStructure(contract);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(contract.schema, STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA);
  assert.equal(checked.verificationLevel,
    "FIXED_ADMISSION_CONTRACT_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(Object.hasOwn(contract, "stage2FrontierBinding"), false);
  assert.equal(Object.hasOwn(contract, "claimHash"), false);
  assert.equal(Object.hasOwn(contract, "wayHash"), false);
  assert.equal(Object.hasOwn(contract, "worldHash"), false);
  assert.equal(contract.verificationRequirements.sourceReplayClaimedByPersistedObject,
    false);
  assert.equal(contract.verificationRequirements
    .structureVerifierCanEstablishSourceReplay, false);
  assert.equal(contract.admissionBoundary.targetPreActionRowsAdmitted, 0);
  assert.equal(contract.admissionBoundary.status,
    "HOLD_TEMPORAL_QUARANTINE_FROZEN_REFERENCE_DIAGNOSTIC_ONLY");
  assert.equal(contract.admissionBoundary.temporalQuarantineReceiptCount, 7);
  assert.equal(contract.admissionBoundary.currentFactorCoverageAdmission, 0);
  assert.equal(contract.outputs.PRICE, null);
  assert.equal(contract.outputs.capital, null);
  assert.equal(contract.readiness.readyToBearResponsibility, false);
  assert.equal(contract.authority.operationalAuthorityGranted, false);
});

test("canonical contract is exact-byte stable-read, private, and no-clobber", {
  skip: !HAS_FULL_CHAIN,
}, () => {
  const bytes = readFileSync(CONTRACT);
  const parsed = JSON.parse(bytes.toString("utf8"));
  assert.equal(parsed.contractHash,
    STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.contractHash);
  assert.equal(bytes.length,
    STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.artifactFileBytes);
  assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.artifactFileHash);
  assert.equal(statSync(CONTRACT).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(CONTRACT)).mode & 0o777, 0o700);
  assert.equal(parsed.artifactLifecycle.canonicalRelease, "final-v4");
  assert.equal(parsed.artifactLifecycle.evidenceTemporalCurrent, false);
  assert.equal(parsed.generatedAt, STAGE2_CURRENT_CHAIN_ADMISSION_FROZEN_AT);
  assert.ok(BigInt(Date.parse(parsed.generatedAt)) * 1_000_000n
    <= statSync(CONTRACT, { bigint: true }).mtimeNs);
  assert.equal(parsed.artifactLifecycle.canonicalRepositoryRelativePath,
    STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.repositoryRelativePath);
  const checked = verifyStage2CurrentChainAdmissionCanonicalStructure(CONTRACT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.contractCanonicalStableRead, true);
  assert.equal(checked.contractCanonicalExactFileHashVerified, true);

  const before = Buffer.from(bytes);
  const cli = spawnSync(process.execPath,
    [path.resolve("scripts/stage2-current-chain-admission.mjs"), "freeze-contract"],
    { encoding: "utf8" });
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /CANONICAL_RELEASE_ALREADY_EXISTS_NO_CLOBBER/u);
  assert.deepEqual(readFileSync(CONTRACT), before);

  const previousBytes = readFileSync(PREVIOUS_CONTRACT);
  const markerBytes = readFileSync(PREVIOUS_CONTRACT_MARKER);
  const marker = JSON.parse(markerBytes.toString("utf8"));
  assert.equal(`sha256:${createHash("sha256").update(previousBytes).digest("hex")}`,
    "sha256:dc7e63e27d02353242e12cb2bfb114c52ac5b5541b40bf0f634bfebb3c73b066");
  assert.equal(previousBytes.length, 13_184);
  assert.equal(marker.superseded.fileSha256,
    "sha256:dc7e63e27d02353242e12cb2bfb114c52ac5b5541b40bf0f634bfebb3c73b066");
  assert.equal(marker.canonical.fileSha256,
    STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.artifactFileHash);
  assert.equal(marker.oldArtifactBytesPreserved, true);
  assert.equal(statSync(PREVIOUS_CONTRACT_MARKER).mode & 0o777, 0o600);
});

test("candidate time fails before source replay when it precedes model or is future",
  async () => {
  await assert.rejects(buildStage2CurrentChainAdmissionContractCandidate({}, {
    generatedAt: "2026-08-28T09:23:48.581Z",
  }), /CONTRACT_GENERATED_AT_PRECEDES_FROZEN_ARCHITECTURE/u);
  const future = new Date(Date.now() + 86_400_000).toISOString();
  await assert.rejects(buildStage2CurrentChainAdmissionContractCandidate({}, {
    generatedAt: future,
  }), /CONTRACT_CANDIDATE_GENERATED_AT_IN_FUTURE/u);
});

test("canonical contract full verifier replays the exact temporally audited chain", {
  skip: !HAS_FULL_CHAIN,
  timeout: 600_000,
}, async () => {
  const mutableInput = { contractArtifactPath: CONTRACT, ...chainInput };
  const verifying = verifyStage2CurrentChainAdmissionCanonicalAgainstSources(
    mutableInput,
  );
  setTimeout(() => {
    mutableInput.contractArtifactPath = STALE_ARCHITECTURE;
    mutableInput.mathSources = {};
  }, 0);
  const checked = await verifying;
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_PINNED_CANONICAL_CONTRACT_AND_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_HOLD");
  assert.equal(checked.contractCanonicalStableRead, true);
  assert.equal(checked.contractCanonicalExactFileHashVerified, true);
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.currentChainSourcesReplayed, true);
  assert.equal(checked.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(checked.temporallyOrderedCurrentReceiptCount, 9);
  assert.equal(checked.temporalQuarantineReceiptCount, 7);
  assert.equal(checked.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(checked.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(checked.targetPreActionRowsAdmitted, 0);
  assert.equal(checked.PRICE, null);
  assert.equal(checked.capital, null);
  assert.equal(checked.readyToBearResponsibility, false);
  assert.equal(checked.operationalAuthorityGranted, false);
});

test("full admission replays Stage 2 and the temporally audited source chain", {
  skip: !HAS_FULL_CHAIN,
  timeout: 600_000,
}, async () => {
  const mutableInput = { ...input };
  const originalFrontierHash = mutableInput.frontier.frontierHash;
  const building = buildStage2CurrentChainAdmission(mutableInput);
  setTimeout(() => { mutableInput.frontier = {}; mutableInput.mathSources = {}; }, 0);
  admission = await building;
  const checked = verifyStage2CurrentChainAdmissionStructure(admission);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "SELF_SEALED_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(admission.artifactLifecycle.canonicalEligible, false);
  assert.equal(admission.artifactLifecycle.durableStage2SourceBundleManifestHash,
    null);
  assert.equal(admission.verificationRequirements.stage2FrontierFullSourceReplayRequired,
    true);
  assert.equal(admission.verificationRequirements.mathCanonicalStableReadRequired,
    true);
  assert.equal(admission.verificationRequirements
    .architectureCanonicalStableReadRequired, true);
  assert.equal(admission.verificationRequirements
    .exactFlywheelSourceRebuildThroughMathRequired, true);
  assert.equal(admission.verificationRequirements
    .clinicalTrialsArtifactAndSixApiObjectReplayRequired, true);
  assert.equal(admission.verificationRequirements
    .clinicalTrialsRightsTermsExpectedReplayed, false);
  assert.equal(admission.verificationRequirements
    .wave5IntakeArtifactAndFiftySevenSourceObjectReplayRequired, true);
  assert.equal(admission.verificationRequirements
    .wave5UniformTrainingRightsExpectedEstablished, false);
  assert.equal(admission.verificationRequirements.sourceReplayClaimedByPersistedObject,
    false);
  assert.equal(admission.verificationRequirements
    .structureVerifierCanEstablishSourceReplay, false);
  assert.equal(admission.currentChainBinding.pinSetHash,
    STAGE2_CURRENT_CHAIN_PIN_SET_HASH);
  assert.equal(admission.currentChainBinding.status,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(admission.currentChainBinding.temporalQuarantineReceiptCount, 7);
  assert.equal(admission.currentChainBinding.factorsAdmittedForCurrentRouting, 0);
  assert.equal(admission.admissionContractHash,
    STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.contractHash);
  assert.equal(admission.stage2FrontierBinding.frontierHash,
    originalFrontierHash);
});

test("persisted admission is fully replayable against source paths", {
  skip: !HAS_FULL_CHAIN,
  timeout: 600_000,
}, async () => {
  const mutableReceipt = structuredClone(admission);
  const mutableInput = { ...input };
  const verifying = verifyStage2CurrentChainAdmissionAgainstSources(
    mutableReceipt, mutableInput);
  setTimeout(() => {
    mutableReceipt.stage2FrontierBinding.frontierHash =
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    mutableInput.frontier = {};
    mutableInput.mathSources = {};
  }, 0);
  const checked = await verifying;
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_STAGE2_AND_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_HOLD");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.currentChainSourcesReplayed, true);
  assert.equal(checked.staleOrSupersededCanonicalAccepted, false);
  assert.equal(checked.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(checked.temporalQuarantineReceiptCount, 7);
  assert.equal(checked.factorsAdmittedForCurrentRouting, 0);
  assert.equal(checked.targetPreActionRowsAdmitted, 0);
  assert.equal(checked.targetModelComponentsFitted, 0);
  assert.equal(checked.price, null);
  assert.equal(checked.PRICE, null);
  assert.equal(checked.capital, null);
  assert.equal(checked.readyToBearResponsibility, false);
  assert.equal(checked.operationalAuthorityGranted, false);
});

test("stale, wrong, reserialized, and caller-promoted inputs fail closed", {
  skip: !HAS_FULL_CHAIN,
  timeout: 30_000,
}, async () => {
  await assert.rejects(buildStage2CurrentChainAdmission({
    ...input, architectureArtifactPath: STALE_ARCHITECTURE,
  }), /PINNED_CANONICAL_PATH_MISMATCH:ARCHITECTURE/u);
  await assert.rejects(buildStage2CurrentChainAdmission({
    ...input, mathArtifactPath: ARCHITECTURE,
  }), /PINNED_CANONICAL_PATH_MISMATCH:MATH/u);
  await assert.rejects(buildStage2CurrentChainAdmission({
    ...input, mathArtifactPath: STALE_MATH,
  }), /PINNED_CANONICAL_PATH_MISMATCH:MATH/u);
  await assert.rejects(buildStage2CurrentChainAdmission({
    ...input, callerClaimsFullSource: true,
  }), /INPUT_SCHEMA_INVALID/u);
  await assert.rejects(buildStage2CurrentChainAdmissionContract({
    ...chainInput, callerClaimsFullSource: true,
  }), /CURRENT_CHAIN_INPUT_SCHEMA_INVALID/u);
  let getterInvoked = false;
  const accessorSwap = { ...input };
  Object.defineProperty(accessorSwap, "frontierSources", {
    enumerable: true,
    get() {
      getterInvoked = true;
      accessorSwap.frontier = {};
      return input.frontierSources;
    },
  });
  await assert.rejects(buildStage2CurrentChainAdmission(accessorSwap),
    /INPUT_ACCESSOR_OR_HIDDEN_FIELD_INVALID:ADMISSION/u);
  assert.equal(getterInvoked, false);
  let proxyTrapInvoked = false;
  const proxySwap = new Proxy(input, {
    ownKeys() {
      proxyTrapInvoked = true;
      return Reflect.ownKeys(input);
    },
  });
  await assert.rejects(buildStage2CurrentChainAdmission(proxySwap),
    /INPUT_PROXY_INVALID:ADMISSION/u);
  assert.equal(proxyTrapInvoked, false);

  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-stage2-chain-reseal-"));
  try {
    const reserialized = path.join(temporary, "architecture.json");
    writeFileSync(reserialized,
      JSON.stringify(JSON.parse(readFileSync(ARCHITECTURE, "utf8"))), "utf8");
    await assert.rejects(buildStage2CurrentChainAdmission({
      ...input, architectureArtifactPath: reserialized,
    }), /PINNED_CANONICAL_PATH_MISMATCH:ARCHITECTURE/u);
    const exactCopy = path.join(temporary, "architecture-exact-copy.json");
    writeFileSync(exactCopy, readFileSync(ARCHITECTURE));
    await assert.rejects(buildStage2CurrentChainAdmission({
      ...input, architectureArtifactPath: exactCopy,
    }), /PINNED_CANONICAL_PATH_MISMATCH:ARCHITECTURE/u);
    const contractCopy = path.join(temporary, "contract-exact-copy.json");
    writeFileSync(contractCopy, readFileSync(CONTRACT));
    const copiedContractCheck =
      verifyStage2CurrentChainAdmissionCanonicalStructure(contractCopy);
    assert.equal(copiedContractCheck.ok, false);
    assert.match(copiedContractCheck.error,
      /PINNED_CANONICAL_PATH_MISMATCH:ADMISSION_CONTRACT/u);
    const symlink = path.join(temporary, "architecture-link.json");
    symlinkSync(ARCHITECTURE, symlink);
    await assert.rejects(buildStage2CurrentChainAdmission({
      ...input, architectureArtifactPath: symlink,
    }), /PINNED_CANONICAL_PATH_MISMATCH:ARCHITECTURE/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("a coherent outer reseal cannot promote rows, PRICE, readiness, or authority", {
  skip: !HAS_FULL_CHAIN,
}, async () => {
  const attacks = [
    (value) => { value.admissionBoundary.targetPreActionRowsAdmitted = 1; },
    (value) => { value.outputs.PRICE = "1.00"; },
    (value) => { value.outputs.capital = "1000"; },
    (value) => { value.permissions.PRICE = true; },
    (value) => { value.readiness.readyToPrice = true; },
    (value) => { value.readiness.readyToBearResponsibility = true; },
    (value) => { value.authority.operationalAuthorityGranted = true; },
    (value) => {
      value.pinSet.clinicalTrials.artifactHash =
        "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      value.currentChainBinding.clinicalTrialsArtifactHash =
        value.pinSet.clinicalTrials.artifactHash;
    },
  ];
  for (const attack of attacks) {
    const forged = structuredClone(admission);
    attack(forged);
    const checked = verifyStage2CurrentChainAdmissionStructure(reseal(forged));
    assert.equal(checked.ok, false);
    assert.equal(checked.price, null);
    assert.equal(checked.PRICE, null);
    assert.equal(checked.capital, null);
    assert.equal(checked.readyToBearResponsibility, false);
    assert.equal(checked.operationalAuthorityGranted, false);
  }

  const forgedContract = structuredClone(contract);
  forgedContract.outputs.PRICE = "1.00";
  const contractBody = structuredClone(forgedContract);
  delete contractBody.contractHash;
  forgedContract.contractHash = `sha256:${createHash("sha256")
    .update(`${STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA}\0${
      canonicalizeStrict(contractBody)}`, "utf8").digest("hex")}`;
  const contractCheck = verifyStage2CurrentChainAdmissionContractStructure(
    forgedContract);
  assert.equal(contractCheck.ok, false);
  assert.equal(contractCheck.PRICE, null);
  assert.equal(contractCheck.operationalAuthorityGranted, false);

  const fullContractCheck = await verifyStage2CurrentChainAdmissionContractAgainstSources(
    forgedContract, chainInput,
  );
  assert.equal(fullContractCheck.ok, false);
  assert.equal(fullContractCheck.sourceArtifactsReverified, false);
});

test("the admission boundary remains entirely non-operational", () => {
  const description = describeStage2CurrentChainAdmission();
  assert.equal(description.canonicalizableContractSchema,
    STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA);
  assert.equal(description.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(description.temporallyOrderedCurrentReceiptCount, 9);
  assert.equal(description.temporalQuarantineReceiptCount, 7);
  assert.equal(description.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(description.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(description.targetPreActionRowsAdmitted, 0);
  assert.equal(description.targetModelComponentsFitted, 0);
  assert.equal(description.price, null);
  assert.equal(description.PRICE, null);
  assert.equal(description.capital, null);
  assert.equal(description.readyToPrice, false);
  assert.equal(description.readyToBearResponsibility, false);
  assert.equal(description.operationalAuthorityGranted, false);
});
