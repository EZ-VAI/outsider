import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  ANCHOR_OPERATOR_RELATIONSHIPS,
  EXTERNAL_ANCHOR_ASSURANCE,
  captureExternalAnchorEvidence,
  createExternalAnchorRequest,
  createExternalAnchorTrustPolicy,
  EXTERNAL_ANCHOR_PROFILES,
  verifyExternalAnchorEvidence,
} from "../src/outsider-external-anchor.js";
import {
  censusPaths,
  importCensusExternalAnchorEvidence,
  settleCensusRun,
  verifyRunCensus,
} from "../src/outsider-run-census.js";
import {
  PHYSICAL_SIMULATION_COHORT_SCHEMAS,
  PHYSICAL_SIMULATION_PERTURBATION_CLASSES,
  freezePhysicalSimulationCohortManifest,
  freezePhysicalSimulationCohortReport,
  physicalSimulationCohortCommitment,
} from "../src/outsider-physical-simulation-cohort.js";
import {
  createPhysicalCohortCensusJoin,
  physicalCohortCensusSelection,
  registerPhysicalCohortCensus,
  verifyPhysicalCohortCensusEnrollment,
  verifyPhysicalCohortCensusJoin,
} from "../src/outsider-physical-cohort-census.js";

const H = (value) => physicalSimulationCohortCommitment("phase3-test", value);

function expectedPins() {
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.expectedPins,
    sourceProfileHash: H("source-profile"),
    plannerReleaseHash: H("planner"),
    vlaReleaseHash: H("vla"),
    controllerReleaseHash: H("controller"),
    capabilityRegistryReleaseHash: H("capability-registry"),
    primitiveJudgeReleaseHash: H("primitive-judge"),
    finalJudgeReleaseHash: H("final-judge"),
    memoryReleaseHash: H("memory"),
    coordinateFrameReleaseHash: H("coordinate-frame"),
    calibrationReleaseHash: H("calibration"),
  };
}

function manifest() {
  const seeds = [0, 1, 2, 3, 4];
  return freezePhysicalSimulationCohortManifest({
    cohortRefHash: H("phase3-census-cohort"),
    seeds,
    slots: PHYSICAL_SIMULATION_PERTURBATION_CLASSES.flatMap((perturbationClass) =>
      seeds.map((seed) => ({
        perturbationClass,
        seed,
        taskRefHash: H(`task-${perturbationClass}`),
        expectedPins: expectedPins(),
      }))),
  });
}

function stateFixture(t) {
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-physical-census-"));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  return stateRoot;
}

function rejectedObservation(slot) {
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.observation,
    slotId: slot.slotId,
    perturbationClass: slot.perturbationClass,
    seed: slot.seed,
    taskRefHash: slot.taskRefHash,
    source: { privateMarker: "must-not-enter-census-bridge-artifacts" },
    projection: {},
  };
}

function hash(value) {
  const bytes = typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("registers exactly one real outer census intake for each of 20 frozen slots", (t) => {
  const stateRoot = stateFixture(t);
  const frozen = manifest();
  const enrollment = registerPhysicalCohortCensus({ stateRoot, manifest: frozen });
  const census = verifyRunCensus(stateRoot);

  assert.equal(census.ok, true, census.error);
  assert.equal(census.startedCount, 20);
  assert.equal(census.openCount, 20);
  assert.equal(census.terminalCount, 0);
  assert.equal(enrollment.registrations.length, 20);
  assert.equal(new Set(enrollment.registrations.map((row) =>
    row.censusRegistration.runCommitment)).size, 20);
  assert.equal(new Set(enrollment.registrations.map((row) =>
    row.selectionCommitment)).size, 20);
  enrollment.registrations.forEach((row, index) => {
    const expected = physicalCohortCensusSelection(frozen, frozen.slots[index]);
    assert.equal(row.manifestHash, frozen.manifestHash);
    assert.equal(row.slotId, frozen.slots[index].slotId);
    assert.equal(row.selectionCommitment, expected.selectionCommitment);
    assert.equal(row.censusRegistration.runOrdinal, index + 1);
  });
  assert.equal(enrollment.startAnchor.startedCount, 0);
  assert.equal(enrollment.endAnchor.startedCount, 20);
  assert.deepEqual(verifyPhysicalCohortCensusEnrollment({ stateRoot,
    manifest: frozen, enrollment }), {
    ok: true,
    enrollmentHash: enrollment.enrollmentHash,
    manifestHash: frozen.manifestHash,
    registeredSlots: 20,
    censusStartedCountAtEndBoundary: 20,
    completeRelativeToFrozenManifest: true,
    externalAnchorVerificationDecisionAccepted: false,
    externalAnchorBuiltInCryptographicVerification: false,
    externalAnchorCryptographicArtifactVerified: false,
    externalAnchorOperatorRelationshipClaimed: null,
    externalAnchorOperatorIndependenceEstablished: false,
    externalPreselectionEstablished: false,
    externalAnchorAssurance: "NO_INDEPENDENT_EXTERNAL_ANCHOR_SUPPLIED",
    externalTemporalOrderRelativeToTraceEstablished: false,
    globalCensusCompletenessEstablished: false,
    rawTracePayloadStored: false,
  });

  const replay = registerPhysicalCohortCensus({ stateRoot, manifest: frozen });
  assert.equal(canonicalizeStrict(replay), canonicalizeStrict(enrollment));
  assert.equal(verifyRunCensus(stateRoot).startedCount, 20,
    "an exact retry must not add another cohort");
});

test("rejects 19, 21, and duplicate slot sets before creating a census", (t) => {
  const frozen = manifest();
  const variants = [];
  const nineteen = structuredClone(frozen);
  nineteen.slots.pop();
  variants.push(nineteen);
  const twentyOne = structuredClone(frozen);
  twentyOne.slots.push({ ...structuredClone(twentyOne.slots.at(-1)), ordinal: 21,
    slotId: H("extra-slot") });
  variants.push(twentyOne);
  const duplicate = structuredClone(frozen);
  duplicate.slots[1] = structuredClone(duplicate.slots[0]);
  variants.push(duplicate);

  variants.forEach((candidate, index) => {
    const parent = stateFixture(t);
    const stateRoot = path.join(parent, `not-created-${index}`);
    assert.throws(() => registerPhysicalCohortCensus({ stateRoot,
      manifest: candidate }), /PHYSICAL_COHORT_CENSUS_MANIFEST_INVALID/);
    assert.equal(existsSync(stateRoot), false,
      "manifest validation must precede every census mutation");
  });
});

test("a total parse failure and an explicit parse rejection cannot erase intakes", (t) => {
  const stateRoot = stateFixture(t);
  const frozen = manifest();
  const enrollment = registerPhysicalCohortCensus({ stateRoot, manifest: frozen });
  const extra = rejectedObservation(frozen.slots[0]);
  extra.slotId = H("not-in-frozen-manifest");

  assert.throws(() => freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [extra],
  }), /OBSERVATION_EXTRA_SLOT/);
  assert.equal(verifyRunCensus(stateRoot).startedCount, 20);
  assert.equal(verifyRunCensus(stateRoot).openCount, 20);

  const observations = [rejectedObservation(frozen.slots[0])];
  const report = freezePhysicalSimulationCohortReport({ manifest: frozen, observations });
  assert.equal(report.summary.rejected, 1);
  assert.equal(report.summary.missing, 19);
  const joined = createPhysicalCohortCensusJoin({ stateRoot, manifest: frozen,
    enrollment, report, observations });
  assert.equal(joined.summary.joinedRows, 20);
  assert.equal(joined.summary.reportRejected, 1);
  assert.equal(joined.summary.reportMissing, 19);
  assert.equal(joined.summary.censusOpen, 20);
  assert.equal(joined.summary.omittedFrozenSlots, 0);
  assert.equal(joined.rows[0].reportDisposition, "REJECTED");
  assert.equal(joined.rows[0].censusTerminalStatus, "OPEN");
});

test("terminal join retains OPEN, ABANDONED, and BLOCKED beside all missing rows", (t) => {
  const stateRoot = stateFixture(t);
  const frozen = manifest();
  const enrollment = registerPhysicalCohortCensus({ stateRoot, manifest: frozen });
  settleCensusRun({ stateRoot,
    registration: enrollment.registrations[0].censusRegistration,
    terminalStatus: "ABANDONED",
    evidenceCommitment: H("operator-abandoned-slot-1"),
    reasonCode: "SIMULATION_SLOT_ABANDONED",
  });
  settleCensusRun({ stateRoot,
    registration: enrollment.registrations[1].censusRegistration,
    terminalStatus: "BLOCKED",
    evidenceCommitment: H("parse-blocked-slot-2"),
    reasonCode: "SIMULATION_TRACE_PARSE_BLOCKED",
  });
  const observations = [];
  const report = freezePhysicalSimulationCohortReport({ manifest: frozen, observations });
  const joined = createPhysicalCohortCensusJoin({ stateRoot, manifest: frozen,
    enrollment, report, observations });

  assert.equal(joined.summary.reportMissing, 20);
  assert.equal(joined.summary.censusAbandoned, 1);
  assert.equal(joined.summary.censusBlocked, 1);
  assert.equal(joined.summary.censusOpen, 18);
  assert.equal(joined.summary.censusSafe, 0);
  assert.deepEqual(verifyPhysicalCohortCensusJoin(joined, { stateRoot,
    manifest: frozen, enrollment, report, observations }), {
    ok: true,
    joinHash: joined.joinHash,
    joinedRows: 20,
    omittedFrozenSlots: 0,
    externalPreselectionEstablished: false,
    externalAnchorVerificationDecisionAccepted: false,
    externalAnchorBuiltInCryptographicVerification: false,
    externalAnchorCryptographicArtifactVerified: false,
    externalAnchorOperatorRelationshipClaimed: null,
    externalAnchorOperatorIndependenceEstablished: false,
    globalCensusCompletenessEstablished: false,
    physicalSafetyEstablished: false,
    rawTracePayloadStored: false,
  });
});

test("enrollment, selection, join, and underlying census tamper fail closed", (t) => {
  const stateRoot = stateFixture(t);
  const frozen = manifest();
  const enrollment = registerPhysicalCohortCensus({ stateRoot, manifest: frozen });
  const observations = [];
  const report = freezePhysicalSimulationCohortReport({ manifest: frozen, observations });
  const joined = createPhysicalCohortCensusJoin({ stateRoot, manifest: frozen,
    enrollment, report, observations });

  const changedSelection = structuredClone(enrollment);
  changedSelection.registrations[0].selectionCommitment = H("forged-selection");
  assert.equal(verifyPhysicalCohortCensusEnrollment({ stateRoot,
    manifest: frozen, enrollment: changedSelection }).ok, false);

  const duplicatedRegistration = structuredClone(enrollment);
  duplicatedRegistration.registrations[1] = structuredClone(
    duplicatedRegistration.registrations[0]);
  assert.equal(verifyPhysicalCohortCensusEnrollment({ stateRoot,
    manifest: frozen, enrollment: duplicatedRegistration }).ok, false);

  const changedJoin = structuredClone(joined);
  changedJoin.rows[0].censusTerminalStatus = "SAFE";
  assert.equal(verifyPhysicalCohortCensusJoin(changedJoin, { stateRoot,
    manifest: frozen, enrollment, report, observations }).ok, false);

  const entries = censusPaths(stateRoot).entries;
  const firstEntry = path.join(entries, readdirSync(entries).sort()[0]);
  const changedLedgerEntry = JSON.parse(readFileSync(firstEntry, "utf8"));
  changedLedgerEntry.reasonCode = "FORGED_AFTER_APPEND";
  writeFileSync(firstEntry, JSON.stringify(changedLedgerEntry), { mode: 0o600 });
  assert.equal(verifyPhysicalCohortCensusEnrollment({ stateRoot,
    manifest: frozen, enrollment }).ok, false);
});

test("bridge artifacts contain commitments but never trace source payloads", (t) => {
  const stateRoot = stateFixture(t);
  const frozen = manifest();
  const enrollment = registerPhysicalCohortCensus({ stateRoot, manifest: frozen });
  const observations = [rejectedObservation(frozen.slots[0])];
  const report = freezePhysicalSimulationCohortReport({ manifest: frozen, observations });
  const joined = createPhysicalCohortCensusJoin({ stateRoot, manifest: frozen,
    enrollment, report, observations });
  const artifacts = canonicalizeStrict({ enrollment, joined });

  assert.doesNotMatch(artifacts, /must-not-enter-census-bridge-artifacts/);
  assert.doesNotMatch(artifacts, /"(?:source|projection|attempts|taskRefHash)":/);
  assert.match(artifacts, /selectionCommitment/);
  assert.match(artifacts, /censusRegistrationHash/);
});

test("a caller-pinned verifier decision can be retained but never becomes preselection", (t) => {
  const stateRoot = stateFixture(t);
  const frozen = manifest();
  const enrollment = registerPhysicalCohortCensus({ stateRoot, manifest: frozen });
  const request = createExternalAnchorRequest({ commitment: enrollment.endAnchor,
    profile: EXTERNAL_ANCHOR_PROFILES.SCITT });
  const evidence = captureExternalAnchorEvidence({ request,
    providerId: "phase3-independent.fixture",
    artifact: Buffer.from([0xd2, 0x84, 0x40, 0xa0]),
    receivedAtLocal: "2026-08-25T01:02:03.000Z" });
  const trustMaterial = {
    kind: "SCITT_RFC9943_VERIFIER",
    transparencyServiceIssuer: "https://phase3-independent.fixture",
    trustedKeysHash: hash("independently stored phase3 SCITT keys"),
    verifierPin: hash("reviewed phase3 SCITT verifier"),
    witnessPolicyHash: null,
  };
  const trustPolicy = createExternalAnchorTrustPolicy({
    providerId: "phase3-independent.fixture",
    operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
    profile: EXTERNAL_ANCHOR_PROFILES.SCITT,
    endpointOrigin: "https://phase3-independent.fixture",
    relationshipEvidenceHash: hash("independence review"),
    trustMaterial,
  });
  const scittVerifier = ({ subjectDigest, transparencyServiceIssuer, verifierPin }) => ({
    ok: true,
    verifierPin,
    subjectDigest,
    transparencyServiceIssuer,
    inclusionVerified: true,
    consistencyVerified: false,
    existenceTimeVerified: false,
    providerProofTime: null,
    providerProofTimeVerified: false,
    independentWitnessesVerified: 0,
  });
  const artifact = verifyExternalAnchorEvidence({ request, evidence, trustPolicy,
    scittVerifier });
  assert.equal(artifact.ok, true, artifact.error);
  assert.equal(artifact.verificationDecisionAccepted, true);
  assert.equal(artifact.builtInCryptographicVerification, false);
  assert.equal(artifact.cryptographicArtifactVerified, false);
  assert.equal(artifact.operatorRelationshipClaimed,
    ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER);
  assert.equal(artifact.operatorIndependenceEstablished, false);
  assert.equal(artifact.independent, false);

  const imported = importCensusExternalAnchorEvidence({ stateRoot,
    commitment: enrollment.endAnchor, request, evidence, trustPolicy,
    trustedPolicyHash: trustPolicy.policyHash, scittVerifier });
  assert.equal(imported.externalAnchorBundleVerified, true);
  assert.equal(imported.verificationDecisionAccepted, true);
  assert.equal(imported.builtInCryptographicVerification, false);
  assert.equal(imported.cryptographicArtifactVerified, false);
  assert.equal(imported.operatorIndependenceEstablished, false);
  assert.equal(imported.externalPreselectionEstablished, false);
  const checked = verifyPhysicalCohortCensusEnrollment({ stateRoot,
    manifest: frozen, enrollment,
    independentAnchor: {
      bundle: imported.bundle,
      trustPolicy,
      trustedPolicyHash: trustPolicy.policyHash,
      scittVerifier,
    } });

  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.externalAnchorVerificationDecisionAccepted, true);
  assert.equal(checked.externalAnchorBuiltInCryptographicVerification, false);
  assert.equal(checked.externalAnchorCryptographicArtifactVerified, false);
  assert.equal(checked.externalAnchorOperatorRelationshipClaimed,
    ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER);
  assert.equal(checked.externalAnchorOperatorIndependenceEstablished, false);
  assert.equal(checked.externalPreselectionEstablished, false);
  assert.equal(checked.externalAnchorAssurance,
    EXTERNAL_ANCHOR_ASSURANCE.VERIFICATION_DECISION_ONLY);
  assert.equal(checked.externalTemporalOrderRelativeToTraceEstablished, false);
});
