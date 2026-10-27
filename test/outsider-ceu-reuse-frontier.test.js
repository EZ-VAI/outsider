import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { CURATE_SCHEMAS, normalizeCurateEpisode } from "../src/outsider-curate-core.js";
import { createCorpusArtifactSet } from "../src/outsider-corpus-registry.js";
import { createContributionRecord } from "../src/outsider-experience-contribution.js";
import { supervisedExperienceDigest } from "../src/outsider-supervised-experience.js";
import {
  adjudicateSimulationTrial, buildProspectiveSimulationPilot,
  buildSimulationLearningReceipt, createSignedSimulationSchedule,
  createSimulationPreregistration, evaluateSimulationCeuMint,
  executeSimulationTrial,
} from "../src/outsider-prospective-physical-simulation.js";
import {
  assessExistingSourceForCeu, buildProspectiveCeuEvidence,
  CEU_CREDIT_CLASSES, CEU_SOURCE_CLASSES, ceuReuseKeyId,
  createCeuReuseGovernancePolicy, createExperienceReuseRevocation,
  createExperienceReuseRightsGrant, createIndependentCausalAdjudication,
  createLearningDiet, createModelUpdateIngressRequest,
  createProspectiveCausalDesign, createProspectiveCausalExecution,
  DurableCeuReuseFrontier, evaluateModelUpdateIngress,
  verifyCeuReuseFrontierDirectory, verifyCeuReuseGovernancePolicy,
  verifyModelUpdateIngressDecision, verifyZeroCeuSourceAssessment,
} from "../src/outsider-ceu-reuse-frontier.js";

const H = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const pair = () => generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function governance({ confirmationCreditUnits = 0, reuseCreditUnits = 0 } = {}) {
  const keys = {
    root: pair(), design: pair(), execution: pair(), adjudicator: pair(), rights: pair(),
    operator: pair(),
  };
  const organizations = {
    root: H("governance-org"), design: H("design-org"), execution: H("execution-org"),
    adjudicator: H("adjudicator-org"), rights: H("rights-org"),
  };
  const roleAuthorities = [
    ["DESIGN_REGISTRAR", "design"],
    ["EXECUTION_ATTESTOR", "execution"],
    ["INDEPENDENT_ADJUDICATOR", "adjudicator"],
    ["RIGHTS_REGISTRAR", "rights"],
  ].map(([role, name]) => ({ role, keyId: ceuReuseKeyId(keys[name].publicKey),
    publicKeyPem: keys[name].publicKey, organizationHash: organizations[name] }));
  const policy = createCeuReuseGovernancePolicy({
    policyId: "test-ceu-frontier-policy",
    issuedAt: "2029-12-01T00:00:00.000Z",
    validFrom: "2030-01-01T00:00:00.000Z",
    validUntil: "2040-01-01T00:00:00.000Z",
    governanceOrganizationHash: organizations.root,
    roleAuthorities,
    creditPolicy: { discoveryCreditUnits: 1, confirmationCreditUnits,
      reuseCreditUnits, creditUnitName: "CEU_POLICY_CONFORMANCE_UNIT" },
  }, { governancePrivateKeyPem: keys.root.privateKey });
  const pins = [ceuReuseKeyId(keys.root.publicKey)];
  return { keys, organizations, roleAuthorities, policy, pins };
}

function prospective(g, suffix, {
  semantic = `semantic-${suffix}`, identity = `identity-${suffix}`,
  correlation = `correlation-${suffix}`, decision = "ADMISSIBLE",
  designTime = "2031-01-01T00:00:00.000Z",
  startTime = "2031-01-02T01:00:00.000Z",
  completeTime = "2031-01-02T02:00:00.000Z",
  adjudicatedAt = "2031-01-02T03:00:00.000Z",
} = {}) {
  const design = createProspectiveCausalDesign({
    designId: `design-${suffix}`,
    sourceClass: CEU_SOURCE_CLASSES.realProspectiveControlled,
    preregisteredAt: designTime,
    executionWindow: { notBefore: "2031-01-02T00:00:00.000Z",
      notAfter: "2031-01-03T00:00:00.000Z" },
    claim: { semanticHash: H(semantic), identityHash: H(identity) },
    correlationRootHashes: [H(correlation)],
    populationHash: H(`population-${suffix}`),
    assignmentMechanismHash: H(`assignment-${suffix}`),
    interventionHash: H(`intervention-${suffix}`),
    controlHash: H(`control-${suffix}`),
    outcomeSpecificationHash: H(`outcome-${suffix}`),
    validityDomainHash: H(`validity-${suffix}`),
    learningDietIntentHash: H(`diet-intent-${suffix}`),
    realityBoundaryHash: H(`reality-boundary-${suffix}`),
    authorityOrganizationHash: g.organizations.design,
  }, { designPrivateKeyPem: g.keys.design.privateKey });
  const execution = createProspectiveCausalExecution({
    designHash: design.designHash,
    sourceClass: CEU_SOURCE_CLASSES.realProspectiveControlled,
    datasetHash: H(`dataset-${suffix}`), checkpointHash: H(`source-checkpoint-${suffix}`),
    startedAt: startTime, completedAt: completeTime,
    assignmentLedgerHash: H(`assignment-ledger-${suffix}`),
    observationLedgerHash: H(`observation-ledger-${suffix}`),
    authorityOrganizationHash: g.organizations.execution,
  }, { executionPrivateKeyPem: g.keys.execution.privateKey });
  const adjudication = createIndependentCausalAdjudication({
    designHash: design.designHash, executionHash: execution.executionHash,
    datasetHash: execution.datasetHash, checkpointHash: execution.checkpointHash,
    adjudicatedAt, decision, outcomeAssessmentHash: H(`assessment-${suffix}`),
    validityDomainHash: design.validityDomainHash,
    authorityOrganizationHash: g.organizations.adjudicator,
  }, { adjudicatorPrivateKeyPem: g.keys.adjudicator.privateKey });
  const evidence = buildProspectiveCeuEvidence({ design, execution, adjudication },
    { policy: g.policy });
  return { design, execution, adjudication, evidence };
}

function openLedger(g) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-ceu-reuse-"));
  const ledger = new DurableCeuReuseFrontier({ directory, governancePolicy: g.policy,
    pinnedGovernanceKeyIds: g.pins, operatorPrivateKeyPem: g.keys.operator.privateKey,
    createdAt: "2030-01-01T00:00:00.000Z" });
  return { directory, ledger };
}

function learningArtifacts(g, evidence, {
  maxUpdateAdmissions = 4, maxDistinctModels = 4,
  candidateHashes = [H("candidate-1"), H("candidate-2"), H("candidate-3")],
} = {}) {
  const modelHash = H("model-exact");
  const baseCheckpointHash = H("base-checkpoint-exact");
  const learningDiet = createLearningDiet({
    dietId: `diet-${evidence.evidenceHash.slice(-12)}`,
    evidenceHash: evidence.evidenceHash,
    datasetHash: evidence.sourceBinding.datasetHash,
    checkpointHash: evidence.sourceBinding.checkpointHash,
    validityDomainHash: evidence.validityDomainHash,
    learningDietIntentHash: evidence.learningDietIntentHash,
    permittedModelHashes: [modelHash],
    permittedBaseCheckpointHashes: [baseCheckpointHash],
    permittedCandidateCheckpointHashes: candidateHashes,
    excludedFeatureSetHash: H("excluded-features"),
    updateProcedureHash: H("manual-reviewed-update-procedure"),
    validFrom: "2031-01-02T04:00:00.000Z",
    validUntil: "2032-01-01T00:00:00.000Z",
    authorityOrganizationHash: g.organizations.rights,
  }, { rightsPrivateKeyPem: g.keys.rights.privateKey });
  const grant = createExperienceReuseRightsGrant({
    grantId: `grant-${evidence.evidenceHash.slice(-12)}`,
    evidenceHash: evidence.evidenceHash,
    datasetHash: evidence.sourceBinding.datasetHash,
    checkpointHash: evidence.sourceBinding.checkpointHash,
    validityDomainHash: evidence.validityDomainHash,
    learningDietHash: learningDiet.learningDietHash,
    realityBoundaryHash: evidence.realityBoundaryHash,
    reuseExternalityPolicyHash: H("bounded-reuse-externality-policy"),
    maxUpdateAdmissions, maxDistinctModels,
    validFrom: "2031-01-02T04:00:00.000Z",
    validUntil: "2032-01-01T00:00:00.000Z",
    authorityOrganizationHash: g.organizations.rights,
  }, { rightsPrivateKeyPem: g.keys.rights.privateKey });
  return { learningDiet, grant, modelHash, baseCheckpointHash, candidateHashes };
}

function requestFor(evidence, learning, suffix, overrides = {}) {
  return createModelUpdateIngressRequest({
    requestId: `update-${suffix}`,
    evidenceHash: evidence.evidenceHash,
    grantHash: learning.grant.grantHash,
    learningDietHash: learning.learningDiet.learningDietHash,
    datasetHash: evidence.sourceBinding.datasetHash,
    sourceCheckpointHash: evidence.sourceBinding.checkpointHash,
    modelHash: learning.modelHash,
    baseCheckpointHash: learning.baseCheckpointHash,
    candidateCheckpointHash: learning.candidateHashes[0],
    validityDomainHash: evidence.validityDomainHash,
    requestedAt: "2031-01-03T05:00:00.000Z",
    requestedByHash: H(`requester-${suffix}`),
    requestedOperation: "MANUAL_MODEL_UPDATE_CANDIDATE_REVIEW",
    ...overrides,
  });
}

function stage05ContributionFixture() {
  const groupKey = {
    extractorId: "outsider-stage05", productVersion: "1.3.97",
    controllerImplementationHash: H("stage05-controller"), hostProtocol: "claude-code",
    wayHash: H("stage05-way"), claimRefHash: H("stage05-claim"),
    worldRefHash: H("stage05-world"), authorityRefHash: H("stage05-authority"),
  };
  const verified = {
    resolved: true, deliveryResolved: true, interventionRequired: false,
    interventionComplete: false, outsiderCausalContribution: false,
    eligibleForCorrectionEffectLearning: false,
    causalAttributionClass: "DELIVERY_NO_INTERVENTION_REQUIRED",
    terminalClass: "SAFE_DELIVERY",
  };
  const body = {
    schema: "outsider/supervised-experience/v2", schemaVersion: "2.0.0",
    extractor: { id: "outsider-supervised-experience/v2", version: "2.1.0" },
    source: { runId: "00000000-0000-4000-8000-000000000001",
      observedAt: "2030-02-02T12:00:00.000Z", manifestHash: H("stage05-manifest"),
      projectionHash: H("stage05-projection"), publicEvidenceHash: H("stage05-public"),
      eventChainHash: H("stage05-event-chain"), eventCount: 0 },
    attestationCompatibility: { artifactType: "outsider_attestation_v2", groupKey },
    evaluationContext: { gatesObserved: ["R1"], gatePassClaimed: false,
      note: "fixture", preregistrationHashes: { agentTeam: null, endurance: null,
        recovery: null } },
    evaluationValidity: null,
    terminal: { terminalClass: "SAFE_DELIVERY", proofComplete: true,
      deliveryComplete: true, interventionRequired: false, interventionComplete: false,
      containmentComplete: false },
    riskEvidence: { observedOnly: true,
      classificationAuthority: "DETERMINISTIC_EVENT_MAPPING",
      establishesLossOrLiability: false },
    riskEvents: [], causalChains: [],
    hostCapacity: { hostProtocol: "claude-code", eventDurationMs: 1,
      toolBoundaries: { pre: 0, post: 0, successfulPostWithExit: 0 },
      actors: {}, agentTeamCapabilities: {}, controller: {}, semanticPatrol: {},
      semanticJudgment: {}, capacityExhaustions: 0, unattendedInteractionAttempts: 0 },
    modelInput: { schema: "outsider/experience/v1",
      features: { nSteps: 0, costUsd: null },
      labels: { fakedSuccess: false, neededCorrection: false, escalated: false,
        gatedIrreversible: false, correctionSucceeded: false },
      signalsSeen: [], trajectory: { verbSequence: [], returnCodes: {}, steps: 0 },
      verified },
    learningLabels: { deliveryResolved: true, outsiderCausalContribution: false,
      eligibleForCorrectionEffectLearning: false,
      causalAttributionClass: "DELIVERY_NO_INTERVENTION_REQUIRED" },
  };
  return createContributionRecord({ ...body, recordHash: supervisedExperienceDigest(body) });
}

test("requires a pinned governance root and distinct causal-role organizations", () => {
  const g = governance();
  assert.equal(verifyCeuReuseGovernancePolicy(g.policy,
    { pinnedGovernanceKeyIds: g.pins }).ok, true);
  assert.equal(verifyCeuReuseGovernancePolicy(g.policy,
    { pinnedGovernanceKeyIds: [] }).ok, false);
  const shared = g.roleAuthorities.map((item) => ({ ...item,
    organizationHash: item.role === "INDEPENDENT_ADJUDICATOR"
      ? g.organizations.execution : item.organizationHash }));
  assert.throws(() => createCeuReuseGovernancePolicy({
    policyId: "collapsed-independence", issuedAt: "2029-01-01T00:00:00.000Z",
    validFrom: "2030-01-01T00:00:00.000Z", validUntil: "2040-01-01T00:00:00.000Z",
    governanceOrganizationHash: g.organizations.root, roleAuthorities: shared,
    creditPolicy: { discoveryCreditUnits: 1, confirmationCreditUnits: 0,
      reuseCreditUnits: 0, creditUnitName: "CEU_POLICY_CONFORMANCE_UNIT" },
  }, { governancePrivateKeyPem: g.keys.root.privateKey }),
  /CAUSAL_ROLES_NOT_INDEPENDENT/);
});

test("historical, metadata-only, and simulated source replay deterministically produce zero CEU", () => {
  const historical = normalizeCurateEpisode({
    schema: CURATE_SCHEMAS.episodeInput,
    source: { datasetId: "real-robot-history", datasetVersion: "1.0.0",
      datasetManifestHash: H("historical-manifest"), sourceObjectHash: H("historical-object"),
      licenseId: "CC-BY-4.0", attributionHash: H("historical-attribution") },
    instrument: { extractorId: "physical-trace", extractorVersion: "1.0.0",
      extractorImplementationHash: H("historical-extractor"),
      featureSchemaHash: H("historical-features") },
    episodeIdHash: H("historical-episode"), platformClass: "real-robot-arm",
    steps: [0, 1].map((index) => ({ index, tOffsetMs: index * 10,
      boundary: { isFirst: index === 0, isLast: index === 1, isTerminal: index === 1 },
      observation: { commitment: H(`historical-observation-${index}`),
        features: { joint: index }, images: [] }, action: null, outcome: null })),
  });
  const historicalAssessment = assessExistingSourceForCeu({
    kind: "CURATE_HISTORICAL_EPISODE", artifact: historical });
  assert.equal(historicalAssessment.sourceClass, CEU_SOURCE_CLASSES.historical);
  assert.equal(historicalAssessment.ceuDecision.causalExperienceUnits, 0);
  assert.equal(historicalAssessment.verification.sourceRealityRetained, true);
  assert.equal(verifyZeroCeuSourceAssessment(historicalAssessment,
    { artifact: historical }).ok, true);

  const registryKey = pair();
  const metadata = createCorpusArtifactSet({
    artifactSetId: "metadata-only-source", stage: "CURATE",
    stream: "BACKWARD_EXPERIENCE_EVIDENCE", createdAt: "2030-02-01T00:00:00.000Z",
    instrument: { instrumentId: "metadata-adapter", instrumentVersion: "1.0.0",
      implementationHash: H("metadata-implementation"), featureSchemaHash: H("metadata-schema") },
    datasetIds: ["metadata-source"], licenseIds: ["MIT"],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: [H("metadata-rights")], registryGrantsRights: false },
    sourceProof: { sourceKind: "public-metadata", verificationLevel:
      "PINNED_METADATA_ONLY_REPRODUCED", sourceCompleteness: "QUARANTINED_NO_TRACE_BYTES",
      verifierImplementationHash: H("metadata-verifier"),
      verificationHash: H("metadata-verification"), manifestHashes: [H("metadata-manifest")],
      sourceArtifactHashes: [H("metadata-artifact")], migration: {
        method: "PINNED_METADATA_REVERIFY_NOT_TRACE_REPLAY",
        legacySchemas: ["publisher-metadata-v1"] } },
    units: [{ identityHash: H("metadata-identity"), recordHash: H("metadata-record"),
      datasetRoot: H("metadata-root"), correlationRoots: [H("metadata-root")] }],
    retention: { mode: "NO_AUTOMATIC_EXPIRY_PUBLIC_SOURCE", retainUntil: null,
      storedPayloadClass: "HASHES_AND_BOUNDED_METADATA_ONLY", sourcePayloadManaged: false,
      expiryDisposition: "NOT_APPLICABLE", liveRevocationChecked: false },
  }, { privateKeyPem: registryKey.privateKey });
  const metadataAssessment = assessExistingSourceForCeu({
    kind: "CORPUS_ARTIFACT_SET", artifact: metadata });
  assert.equal(metadataAssessment.sourceClass, CEU_SOURCE_CLASSES.metadataOnly);
  assert.equal(metadataAssessment.ceuDecision.causalExperienceUnits, 0);

  const contribution = stage05ContributionFixture();
  const contributionAssessment = assessExistingSourceForCeu({
    kind: "STAGE05_CONTRIBUTION_RECORD", artifact: contribution });
  assert.equal(contributionAssessment.sourceClass, CEU_SOURCE_CLASSES.retrospective);
  assert.equal(contributionAssessment.empiricalStatus,
    "EMPIRICAL_RECORDED_SOFTWARE_RUN_PROJECTION");
  assert.equal(contributionAssessment.ceuDecision.causalExperienceUnits, 0);

  const researcher = pair(), scheduler = pair(), executor = pair(), adjudicator = pair();
  const assignmentSeed = "simulation-assignment-seed-001";
  const simulatorSeed = "simulation-runtime-seed-0001";
  const preregistration = createSimulationPreregistration({
    experimentId: "zero-ceu-simulation", preregisteredAt: "2035-01-01T00:00:00.000Z",
    plannedUnitCount: 4, horizonSteps: 4, stepMs: 10, assignmentSeed, simulatorSeed,
    researcherOrganizationHash: H("simulation-research-org"),
    researcherPrivateKeyPem: researcher.privateKey,
  });
  const manifest = createSignedSimulationSchedule(preregistration, { assignmentSeed,
    issuedAt: "2035-01-01T00:01:00.000Z", schedulerPrivateKeyPem: scheduler.privateKey });
  const execution = executeSimulationTrial(preregistration, manifest, { simulatorSeed,
    startedAt: "2035-01-01T00:02:00.000Z", executorPrivateKeyPem: executor.privateKey });
  const adjudication = adjudicateSimulationTrial(preregistration, manifest, execution, {
    adjudicatedAt: "2035-01-01T00:10:00.000Z",
    adjudicatorPrivateKeyPem: adjudicator.privateKey });
  const ceuDecision = evaluateSimulationCeuMint(preregistration, manifest, execution,
    adjudication);
  const learningReceipt = buildSimulationLearningReceipt(preregistration, manifest,
    execution, adjudication, ceuDecision);
  const report = buildProspectiveSimulationPilot({ preregistration, manifest,
    ledger: execution, adjudication, ceuDecision, learningReceipt });
  const sources = { preregistration, manifest, ledger: execution, adjudication,
    ceuDecision, learningReceipt };
  const simulationAssessment = assessExistingSourceForCeu({
    kind: "PROSPECTIVE_SIMULATION_PILOT", artifact: report, sources });
  assert.equal(simulationAssessment.sourceClass, CEU_SOURCE_CLASSES.simulation);
  assert.equal(simulationAssessment.ceuDecision.causalExperienceUnits, 0);
  assert.equal(simulationAssessment.empiricalStatus,
    "EXECUTED_TRACE_IN_SIMULATED_ENVIRONMENT");

  const g = governance();
  const { directory, ledger } = openLedger(g);
  try {
    assert.equal(ledger.appendZeroCeuSource({ kind: "CURATE_HISTORICAL_EPISODE",
      artifact: historical }, { recordedAt: "2030-02-01T00:00:00.000Z" })
      .causalExperienceUnits, 0);
    assert.equal(ledger.appendZeroCeuSource({ kind: "CORPUS_ARTIFACT_SET",
      artifact: metadata }, { recordedAt: "2030-02-02T00:00:00.000Z" })
      .causalExperienceUnits, 0);
    assert.equal(ledger.appendZeroCeuSource({ kind: "STAGE05_CONTRIBUTION_RECORD",
      artifact: contribution }, { recordedAt: "2030-02-03T00:00:00.000Z" })
      .causalExperienceUnits, 0);
    assert.equal(ledger.appendZeroCeuSource({ kind: "PROSPECTIVE_SIMULATION_PILOT",
      artifact: report, sources }, { recordedAt: "2035-01-02T00:00:00.000Z" })
      .causalExperienceUnits, 0);
    assert.equal(ledger.report({ asOf: "2035-01-03T00:00:00.000Z" })
      .counts.zeroCeuSources, 4);
    assert.equal(ledger.report({ asOf: "2035-01-03T00:00:00.000Z" })
      .credit.configuredPolicyConformanceUnits, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("global semantic, identity, and correlation dedup grants discovery once", () => {
  const g = governance();
  const { directory, ledger } = openLedger(g);
  try {
    const discovery = prospective(g, "discovery");
    const first = ledger.appendProspectiveEvidence(discovery,
      { recordedAt: "2031-01-02T04:00:00.000Z" });
    assert.equal(first.creditClass, CEU_CREDIT_CLASSES.discovery);
    assert.equal(first.creditUnits, 1);
    const duplicate = ledger.appendProspectiveEvidence(discovery,
      { recordedAt: "2031-01-02T04:01:00.000Z" });
    assert.equal(duplicate.appended, false);
    assert.equal(duplicate.creditUnits, 1);

    const confirmation = prospective(g, "confirmation", {
      semantic: "semantic-discovery", identity: "different-identity",
      correlation: "different-correlation" });
    const second = ledger.appendProspectiveEvidence(confirmation,
      { recordedAt: "2031-01-02T05:00:00.000Z" });
    assert.equal(second.creditClass, CEU_CREDIT_CLASSES.confirmation);
    assert.equal(second.creditUnits, 0);
    assert.deepEqual(second.dedupEvidenceHashes, [discovery.evidence.evidenceHash]);

    const reuse = prospective(g, "reuse", { semantic: "new-semantic",
      identity: "new-identity", correlation: "correlation-discovery" });
    const third = ledger.appendProspectiveEvidence(reuse,
      { recordedAt: "2031-01-02T06:00:00.000Z" });
    assert.equal(third.creditClass, CEU_CREDIT_CLASSES.reuse);
    assert.equal(third.creditUnits, 0);
    const report = ledger.report({ asOf: "2031-01-03T00:00:00.000Z" });
    assert.equal(report.credit.configuredPolicyConformanceUnits, 1);
    assert.equal(report.credit.discoveries, 1);
    assert.equal(report.credit.confirmations, 1);
    assert.equal(report.credit.correlatedReuse, 1);
    assert.equal(report.boundary.globallyAuthoritativeCeuClaimed, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a pinned signed governance policy may explicitly credit confirmation and reuse", () => {
  const g = governance({ confirmationCreditUnits: 1, reuseCreditUnits: 1 });
  const { directory, ledger } = openLedger(g);
  try {
    const first = prospective(g, "governed-first");
    const confirmation = prospective(g, "governed-confirmation", {
      semantic: "semantic-governed-first", identity: "governed-confirmation-identity",
      correlation: "governed-confirmation-root" });
    ledger.appendProspectiveEvidence(first,
      { recordedAt: "2031-01-02T04:00:00.000Z" });
    const result = ledger.appendProspectiveEvidence(confirmation,
      { recordedAt: "2031-01-02T05:00:00.000Z" });
    assert.equal(result.creditClass, CEU_CREDIT_CLASSES.confirmation);
    assert.equal(result.creditUnits, 1);
    assert.equal(ledger.report({ asOf: "2031-01-03T00:00:00.000Z" })
      .externalGaps.externalGovernanceAdoptionEstablished, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("manual model-update ingress enforces rights, exact hashes, domain, diet, and budgets", () => {
  const g = governance();
  const { directory, ledger } = openLedger(g);
  try {
    const sources = prospective(g, "ingress");
    ledger.appendProspectiveEvidence(sources,
      { recordedAt: "2031-01-02T04:00:00.000Z" });
    const learning = learningArtifacts(g, sources.evidence,
      { maxUpdateAdmissions: 1, maxDistinctModels: 1 });
    ledger.appendLearningDiet(learning.learningDiet,
      { recordedAt: "2031-01-02T04:10:00.000Z" });
    ledger.appendRightsGrant(learning.grant,
      { recordedAt: "2031-01-02T04:20:00.000Z" });
    const request = requestFor(sources.evidence, learning, "one");
    const admitted = ledger.evaluateAndRecordModelUpdateIngress(request,
      { recordedAt: "2031-01-03T05:01:00.000Z" });
    assert.equal(admitted.decision, "ADMIT_MANUAL_UPDATE_CANDIDATE");
    const duplicated = ledger.evaluateAndRecordModelUpdateIngress(request,
      { recordedAt: "2031-01-03T05:02:00.000Z" });
    assert.equal(duplicated.appended, false);
    assert.equal(duplicated.decision, "HOLD_DUPLICATE_REQUEST_NO_NEW_UPDATE_AUTHORITY");
    const idConflict = createModelUpdateIngressRequest({ ...request,
      candidateCheckpointHash: learning.candidateHashes[1] });
    assert.throws(() => ledger.evaluateAndRecordModelUpdateIngress(idConflict,
      { recordedAt: "2031-01-03T05:03:00.000Z" }), /INGRESS_REQUEST_ID_CONFLICT/);

    const outOfDiet = requestFor(sources.evidence, learning, "wrong-model", {
      modelHash: H("unlisted-model"), candidateCheckpointHash: learning.candidateHashes[1],
      requestedAt: "2031-01-03T06:00:00.000Z" });
    const held = ledger.evaluateAndRecordModelUpdateIngress(outOfDiet,
      { recordedAt: "2031-01-03T06:01:00.000Z" });
    assert.equal(held.decision, "HOLD");
    const budget = requestFor(sources.evidence, learning, "budget", {
      candidateCheckpointHash: learning.candidateHashes[2],
      requestedAt: "2031-01-03T07:00:00.000Z" });
    const budgetHeld = ledger.evaluateAndRecordModelUpdateIngress(budget,
      { recordedAt: "2031-01-03T07:01:00.000Z" });
    assert.equal(budgetHeld.decision, "HOLD");

    const state = verifyCeuReuseFrontierDirectory({ directory,
      governancePolicy: g.policy, pinnedGovernanceKeyIds: g.pins,
      asOf: "2031-01-03T08:00:00.000Z" });
    assert.equal(state.ok, true);
    assert.equal(state.report.counts.admittedManualCandidates, 1);
    assert.equal(state.report.counts.automaticModelUpdates, 0);
    assert.deepEqual(state.report.boundary.permits,
      { PRICE: false, GUARANTEE: false, SETTLE: false });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("each exact dataset, source checkpoint, model checkpoint, and validity mismatch holds", () => {
  const g = governance();
  const sources = prospective(g, "mismatch");
  const learning = learningArtifacts(g, sources.evidence);
  const base = requestFor(sources.evidence, learning, "base");
  const context = { evidence: sources.evidence, learningDiet: learning.learningDiet,
    grant: learning.grant, revocations: [], priorDecisions: [], policy: g.policy,
    pinnedGovernanceKeyIds: g.pins };
  const accepted = evaluateModelUpdateIngress(base, context);
  assert.equal(verifyModelUpdateIngressDecision(accepted, context).ok, true);
  assert.equal(accepted.decision, "ADMIT_MANUAL_UPDATE_CANDIDATE");
  for (const [field, value] of [
    ["datasetHash", H("wrong-dataset")],
    ["sourceCheckpointHash", H("wrong-source-checkpoint")],
    ["baseCheckpointHash", H("wrong-base-checkpoint")],
    ["candidateCheckpointHash", H("wrong-candidate-checkpoint")],
    ["validityDomainHash", H("wrong-validity-domain")],
  ]) {
    const changed = createModelUpdateIngressRequest({ ...base, requestId: `wrong-${field}`,
      [field]: value });
    const decision = evaluateModelUpdateIngress(changed, context);
    assert.equal(decision.decision, "HOLD", field);
    assert.equal(decision.effect.automaticTraining, false);
    assert.equal(decision.effect.modelUpdatePerformed, false);
  }
});

test("signed revocation blocks future ingress without erasing prior evidence or credit", () => {
  const g = governance();
  const { directory, ledger } = openLedger(g);
  try {
    const sources = prospective(g, "revoked");
    ledger.appendProspectiveEvidence(sources,
      { recordedAt: "2031-01-02T04:00:00.000Z" });
    const learning = learningArtifacts(g, sources.evidence);
    ledger.appendLearningDiet(learning.learningDiet,
      { recordedAt: "2031-01-02T04:10:00.000Z" });
    ledger.appendRightsGrant(learning.grant,
      { recordedAt: "2031-01-02T04:20:00.000Z" });
    const first = requestFor(sources.evidence, learning, "before-revocation");
    assert.equal(ledger.evaluateAndRecordModelUpdateIngress(first,
      { recordedAt: "2031-01-03T05:01:00.000Z" }).decision,
    "ADMIT_MANUAL_UPDATE_CANDIDATE");
    const revocation = createExperienceReuseRevocation({
      revocationId: "rights-revocation-1", grantHash: learning.grant.grantHash,
      evidenceHash: sources.evidence.evidenceHash,
      effectiveAt: "2031-01-03T06:00:00.000Z", reasonCode: "RIGHTS_WITHDRAWN",
      evidenceCommitmentHash: H("revocation-order"),
      authorityOrganizationHash: g.organizations.rights,
    }, { rightsPrivateKeyPem: g.keys.rights.privateKey });
    const revoked = ledger.appendRevocation(revocation,
      { recordedAt: "2031-01-03T06:00:00.000Z" });
    assert.equal(revoked.appended, true);
    assert.equal(ledger.appendRevocation(revocation,
      { recordedAt: "2031-01-03T06:01:00.000Z" }).appended, false);
    const later = requestFor(sources.evidence, learning, "after-revocation", {
      candidateCheckpointHash: learning.candidateHashes[1],
      requestedAt: "2031-01-03T07:00:00.000Z" });
    assert.equal(ledger.evaluateAndRecordModelUpdateIngress(later,
      { recordedAt: "2031-01-03T07:01:00.000Z" }).decision, "HOLD");
    const report = ledger.report({ asOf: "2031-01-03T08:00:00.000Z" });
    assert.equal(report.credit.configuredPolicyConformanceUnits, 1);
    assert.equal(report.ingress.historicallyAdmittedManualCandidates, 1);
    assert.equal(report.ingress.currentlyUnrevokedManualCandidates, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("atomic lock, idempotency, conflicts, and signed-suffix recovery fail closed", () => {
  const g = governance();
  const { directory, ledger } = openLedger(g);
  try {
    const first = prospective(g, "atomic");
    const initialIndex = readFileSync(path.join(directory, "index.json"), "utf8");
    ledger.appendProspectiveEvidence(first,
      { recordedAt: "2031-01-02T04:00:00.000Z" });
    writeFileSync(path.join(directory, "index.json"), initialIndex, { mode: 0o600 });
    const second = prospective(g, "atomic-second");
    const recovered = ledger.appendProspectiveEvidence(second,
      { recordedAt: "2031-01-02T05:00:00.000Z" });
    assert.equal(recovered.appended, true);
    assert.equal(ledger.verify().ok, true);

    writeFileSync(path.join(directory, ".write.lock"), "held", { flag: "wx", mode: 0o600 });
    const before = readFileSync(path.join(directory, "events.jsonl"), "utf8");
    const locked = prospective(g, "locked");
    assert.throws(() => ledger.appendProspectiveEvidence(locked,
      { recordedAt: "2031-01-02T06:00:00.000Z" }), /STATE_LOCKED/);
    assert.equal(readFileSync(path.join(directory, "events.jsonl"), "utf8"), before);
    rmSync(path.join(directory, ".write.lock"));

    const conflictingExecution = createProspectiveCausalExecution({
      ...first.execution, datasetHash: H("conflicting-dataset"),
      checkpointHash: H("conflicting-checkpoint"),
      assignmentLedgerHash: H("conflicting-assignment"),
      observationLedgerHash: H("conflicting-observation"),
    }, { executionPrivateKeyPem: g.keys.execution.privateKey });
    const conflictingAdjudication = createIndependentCausalAdjudication({
      designHash: first.design.designHash, executionHash: conflictingExecution.executionHash,
      datasetHash: conflictingExecution.datasetHash,
      checkpointHash: conflictingExecution.checkpointHash,
      adjudicatedAt: "2031-01-02T03:30:00.000Z", decision: "ADMISSIBLE",
      outcomeAssessmentHash: H("conflicting-assessment"),
      validityDomainHash: first.design.validityDomainHash,
      authorityOrganizationHash: g.organizations.adjudicator,
    }, { adjudicatorPrivateKeyPem: g.keys.adjudicator.privateKey });
    assert.throws(() => ledger.appendProspectiveEvidence({ design: first.design,
      execution: conflictingExecution, adjudication: conflictingAdjudication },
    { recordedAt: "2031-01-02T06:00:00.000Z" }), /BINDING_CONFLICT/);
    assert.equal(ledger.verify().ok, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("rejected adjudication is preserved but receives zero credit", () => {
  const g = governance();
  const { directory, ledger } = openLedger(g);
  try {
    const rejected = prospective(g, "rejected", { decision: "REJECTED" });
    const result = ledger.appendProspectiveEvidence(rejected,
      { recordedAt: "2031-01-02T04:00:00.000Z" });
    assert.equal(result.creditClass, CEU_CREDIT_CLASSES.ineligible);
    assert.equal(result.creditUnits, 0);
    const learning = learningArtifacts(g, rejected.evidence);
    assert.throws(() => ledger.appendLearningDiet(learning.learningDiet,
      { recordedAt: "2031-01-02T04:10:00.000Z" }), /LEARNING_DIET_ADMISSION_INVALID/);
    const laterAdmissible = prospective(g, "rejected-claim-retried", {
      semantic: "semantic-rejected", identity: "new-valid-identity",
      correlation: "new-valid-correlation" });
    const later = ledger.appendProspectiveEvidence(laterAdmissible,
      { recordedAt: "2031-01-02T05:00:00.000Z" });
    assert.equal(later.creditClass, CEU_CREDIT_CLASSES.discovery,
      "a rejected artifact cannot preempt the first admissible discovery");
    assert.equal(later.creditUnits, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CLI verifies a source-replayed ledger without an operator private key", () => {
  const g = governance();
  const { directory, ledger } = openLedger(g);
  const policyFile = path.join(directory, "policy-copy.json");
  try {
    const sources = prospective(g, "cli");
    ledger.appendProspectiveEvidence(sources,
      { recordedAt: "2031-01-02T04:00:00.000Z" });
    writeFileSync(policyFile, `${JSON.stringify(g.policy)}\n`, { mode: 0o600 });
    const result = spawnSync(process.execPath,
      ["scripts/stage15-ceu-reuse-frontier.mjs", "--directory", directory,
        "--governance-policy", policyFile, "--pinned-governance-key-id", g.pins[0],
        "--as-of", "2031-01-03T00:00:00.000Z"],
      { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.credit.configuredPolicyConformanceUnits, 1);
    assert.equal(report.externalGaps.externalGovernanceAdoptionEstablished, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
