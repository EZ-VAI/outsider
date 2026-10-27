import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildCausalJudgeEvidenceBundle, buildCausalJudgeSurvivalReport,
  CAUSAL_JUDGE_EVIDENCE_AUTHORITY, CAUSAL_JUDGE_EVIDENCE_TIMING,
  CAUSAL_JUDGE_PERMITTED_USE, CAUSAL_JUDGE_SOURCE_REALITY,
  causalJudgeKeyId, createCausalHypothesisPreregistration,
  createCausalJudgeGovernancePolicy, createCausalJudgeSourceManifest,
  createIndependentCausalJudgeAdjudication, createIndependentOutcomeAssessment,
  createMechanismCandidateAssessment, createProspectiveCausalJudgeExecution,
  createRandomizedControlAssignment, renderCausalJudgeAssignmentSource,
  verifyCausalJudgeEvidenceBundle, verifyCausalJudgeGovernancePolicy,
  verifyCausalJudgeSurvivalReport, verifyMechanismCandidateAssessment,
  verifyRandomizedControlAssignment,
} from "../src/outsider-causal-judge-survival.js";

const H = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const pair = () => generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function governance() {
  const keys = { root: pair(), registrar: pair(), assignment: pair(), execution: pair(),
    outcome: pair(), adjudicator: pair() };
  const organizations = { root: H("judge-root-org"), registrar: H("registrar-org"),
    assignment: H("assignment-org"), execution: H("execution-org"),
    outcome: H("outcome-org"), adjudicator: H("adjudicator-org") };
  const roles = [
    ["HYPOTHESIS_REGISTRAR", "registrar"],
    ["ASSIGNMENT_ATTESTOR", "assignment"],
    ["EXECUTION_ATTESTOR", "execution"],
    ["INDEPENDENT_OUTCOME_ASSESSOR", "outcome"],
    ["INDEPENDENT_ADJUDICATOR", "adjudicator"],
  ];
  const roleAuthorities = roles.map(([role, name]) => ({ role,
    actorType: "HUMAN_OR_INSTITUTION", keyId: causalJudgeKeyId(keys[name].publicKey),
    publicKeyPem: keys[name].publicKey, organizationHash: organizations[name] }));
  const policy = createCausalJudgeGovernancePolicy({
    policyId: "causal-judge-test-policy", issuedAt: "2029-01-01T00:00:00.000Z",
    validFrom: "2030-01-01T00:00:00.000Z", validUntil: "2040-01-01T00:00:00.000Z",
    governanceOrganizationHash: organizations.root, roleAuthorities,
  }, { governancePrivateKeyPem: keys.root.privateKey });
  return { keys, organizations, roleAuthorities, policy,
    pins: [causalJudgeKeyId(keys.root.publicKey)] };
}

function fixture(g, suffix = "a", {
  semantic = `semantic-${suffix}`, correlation = `correlation-${suffix}`,
  survived = true, adjudicationDecision = "ADMISSIBLE", proposedBy = "MODEL",
} = {}) {
  const hypothesis = createCausalHypothesisPreregistration({
    hypothesisId: `hypothesis-${suffix}`, hypothesisVersion: "1.0.0",
    semanticHash: H(semantic), identityHash: H(`identity-${suffix}`),
    mechanismHash: H(`mechanism-${suffix}`),
    falsificationRuleHash: H(`falsification-${suffix}`),
    proposedBy: { actorType: proposedBy, actorHash: H(`proposer-${suffix}`) },
    registeredAt: "2031-01-01T00:00:00.000Z",
    assignmentWindow: { notBefore: "2031-01-02T00:00:00.000Z",
      notAfter: "2031-01-03T00:00:00.000Z" },
    executionWindow: { notBefore: "2031-01-03T00:00:00.000Z",
      notAfter: "2031-01-05T00:00:00.000Z" },
    populationHash: H(`population-${suffix}`),
    plannedTests: ["effect", "boundary"].map((name) => ({
      testId: `${name}-${suffix}`, interventionHash: H(`intervention-${name}-${suffix}`),
      controlHash: H(`control-${name}-${suffix}`),
      outcomeSpecificationHash: H(`outcome-spec-${name}-${suffix}`),
      minimumUnitsPerArm: 2,
    })),
    correlationRootHashes: [H(correlation)],
    sourceAxes: {
      sourceReality: CAUSAL_JUDGE_SOURCE_REALITY.realSoftware,
      evidenceAuthority:
        CAUSAL_JUDGE_EVIDENCE_AUTHORITY.prospectiveConfiguredRoleSeparation,
      permittedUse: CAUSAL_JUDGE_PERMITTED_USE.measureCandidate,
      evidenceTiming: CAUSAL_JUDGE_EVIDENCE_TIMING.prospective,
    },
    registrarOrganizationHash: g.organizations.registrar,
  }, { registrarPrivateKeyPem: g.keys.registrar.privateKey });
  const randomizationBytes = Buffer.from(`externally-committed-randomness-${suffix}-0123456789`);
  const assignment = createRandomizedControlAssignment({
    assignedAt: "2031-01-02T12:00:00.000Z",
    randomizationSourceId: `random-${suffix}`,
    assignmentLedgerSourceId: `assignment-${suffix}`,
    testUnits: hypothesis.plannedTests.map((planned) => ({ testId: planned.testId,
      units: Array.from({ length: 6 }, (_, index) => ({
        unitHash: H(`unit-${planned.testId}-${index}`),
        correlationRootHashes: [H(`unit-correlation-${planned.testId}-${index}`)],
      })) })),
    assignmentOrganizationHash: g.organizations.assignment,
  }, { policy: g.policy, hypothesis, assignmentPrivateKeyPem: g.keys.assignment.privateKey,
    randomizationBytes });
  const assignmentBytes = renderCausalJudgeAssignmentSource(assignment);
  const traceBytes = Buffer.from(`exact-execution-trace-${suffix}\n`);
  const observationBytes = Buffer.from(`exact-outcome-observations-${suffix}\n`);
  const sourceManifest = createCausalJudgeSourceManifest([
    { sourceId: `random-${suffix}`, purpose: "RANDOMIZATION_BEACON",
      mediaType: "application/octet-stream", bytes: randomizationBytes },
    { sourceId: `assignment-${suffix}`, purpose: "ASSIGNMENT_LEDGER",
      mediaType: "application/json", bytes: assignmentBytes },
    { sourceId: `trace-${suffix}`, purpose: "EXECUTION_TRACE",
      mediaType: "application/x-ndjson", bytes: traceBytes },
    { sourceId: `observations-${suffix}`, purpose: "OUTCOME_OBSERVATIONS",
      mediaType: "application/x-ndjson", bytes: observationBytes },
  ]);
  const sources = { [`random-${suffix}`]: randomizationBytes,
    [`assignment-${suffix}`]: assignmentBytes, [`trace-${suffix}`]: traceBytes,
    [`observations-${suffix}`]: observationBytes };
  const execution = createProspectiveCausalJudgeExecution({
    sourceAxes: hypothesis.sourceAxes, sourceManifest,
    startedAt: "2031-01-03T01:00:00.000Z",
    completedAt: "2031-01-03T03:00:00.000Z",
    testExecutions: assignment.testAssignments.map((assigned) => ({
      testId: assigned.testId,
      unitOutcomes: assigned.units.map((unit) => ({ unitHash: unit.unitHash, arm: unit.arm,
        outcomeHash: H(`outcome-${unit.unitHash}`),
        sourceIds: [`observations-${suffix}`, `trace-${suffix}`] })),
    })),
    executionOrganizationHash: g.organizations.execution,
  }, { hypothesis, assignment, executionPrivateKeyPem: g.keys.execution.privateKey });
  const outcome = createIndependentOutcomeAssessment({
    assessedAt: "2031-01-03T04:00:00.000Z",
    testResults: hypothesis.plannedTests.map((planned) => ({ testId: planned.testId,
      survived, assessmentHash: H(`assessment-${planned.testId}-${survived}`) })),
    assessorOrganizationHash: g.organizations.outcome,
  }, { hypothesis, execution, assessorPrivateKeyPem: g.keys.outcome.privateKey });
  const adjudication = createIndependentCausalJudgeAdjudication({
    adjudicatedAt: "2031-01-03T05:00:00.000Z", decision: adjudicationDecision,
    adjudicationRecordHash: H(`adjudication-record-${suffix}`),
    adjudicatorOrganizationHash: g.organizations.adjudicator,
  }, { hypothesis, execution, outcome,
    adjudicatorPrivateKeyPem: g.keys.adjudicator.privateKey });
  const bundle = buildCausalJudgeEvidenceBundle({ hypothesis, assignment, execution,
    outcome, adjudication }, { policy: g.policy, sources });
  return { hypothesis, assignment, execution, outcome, adjudication, bundle, sources,
    randomizationBytes };
}

test("governance pins human/institution role keys and forbids same-signer self-evaluation", () => {
  const g = governance();
  assert.equal(verifyCausalJudgeGovernancePolicy(g.policy,
    { pinnedGovernanceKeyIds: g.pins }).ok, true);
  assert.equal(verifyCausalJudgeGovernancePolicy(g.policy,
    { pinnedGovernanceKeyIds: [] }).ok, false);
  const collapsed = g.roleAuthorities.map((item) => item.role === "INDEPENDENT_ADJUDICATOR"
    ? { ...item, keyId: g.roleAuthorities[3].keyId,
      publicKeyPem: g.roleAuthorities[3].publicKeyPem,
      organizationHash: g.roleAuthorities[3].organizationHash } : item);
  assert.throws(() => createCausalJudgeGovernancePolicy({
    policyId: "collapsed", issuedAt: "2029-01-01T00:00:00.000Z",
    validFrom: "2030-01-01T00:00:00.000Z", validUntil: "2040-01-01T00:00:00.000Z",
    governanceOrganizationHash: g.organizations.root, roleAuthorities: collapsed,
  }, { governancePrivateKeyPem: g.keys.root.privateKey }), /POLICY_ROLES_NOT_INDEPENDENT/);
  const modelAuthority = g.roleAuthorities.map((item) => item.role === "HYPOTHESIS_REGISTRAR"
    ? { ...item, actorType: "MODEL" } : item);
  assert.throws(() => createCausalJudgeGovernancePolicy({
    policyId: "model-signer", issuedAt: "2029-01-01T00:00:00.000Z",
    validFrom: "2030-01-01T00:00:00.000Z", validUntil: "2040-01-01T00:00:00.000Z",
    governanceOrganizationHash: g.organizations.root, roleAuthorities: modelAuthority,
  }, { governancePrivateKeyPem: g.keys.root.privateKey }), /ROLE_AUTHORITY_INVALID/);
});

test("full prospective chain replays exact sources but remains local conformance only", () => {
  const g = governance();
  const f = fixture(g);
  assert.equal(f.hypothesis.sourceAxes.evidenceAuthority,
    "SOURCE_REPLAYED_PROSPECTIVE_CONFIGURED_ROLE_SEPARATION");
  assert.equal(f.bundle.boundary.institutionalIndependenceEstablished, false);
  const checked = verifyCausalJudgeEvidenceBundle(f.bundle,
    { policy: g.policy, pinnedGovernanceKeyIds: g.pins, sources: f.sources });
  assert.equal(checked.ok, true);
  assert.equal(checked.eligibleForLocalConformanceDenominator, true);
  assert.equal(checked.survived, true);
  assert.equal(checked.authoritativeMeasuredSurvivalEstablished, false);
  assert.equal(checked.causalExperienceUnits, 0);
  assert.equal(checked.learningPermitted, false);
  assert.equal(checked.PRICE, false);
  assert.equal(checked.productionUsePermitted, false);
  const report = buildCausalJudgeSurvivalReport({ policy: g.policy, bundles: [f.bundle],
    createdAt: "2031-02-01T00:00:00.000Z" },
  { pinnedGovernanceKeyIds: g.pins, sources: f.sources });
  assert.equal(report.correlationDedup.localConformanceDenominator, 1);
  assert.equal(report.correlationDedup.localConformanceSurvived, 1);
  assert.equal(report.authoritativeMeasurement.denominator, 0);
  assert.equal(report.authoritativeMeasurement.established, false);
  assert.equal(verifyCausalJudgeSurvivalReport(report, { policy: g.policy,
    pinnedGovernanceKeyIds: g.pins, bundles: [f.bundle], sources: f.sources }).ok, true);
});

test("historical/public/metadata/simulation evidence remains a mechanism candidate with denominator zero", () => {
  const g = governance();
  for (const [suffix, sourceReality, authority, timing] of [
    ["historical", CAUSAL_JUDGE_SOURCE_REALITY.realPhysical,
      CAUSAL_JUDGE_EVIDENCE_AUTHORITY.retrospective,
      CAUSAL_JUDGE_EVIDENCE_TIMING.publicRetrospective],
    ["metadata", CAUSAL_JUDGE_SOURCE_REALITY.realSoftware,
      CAUSAL_JUDGE_EVIDENCE_AUTHORITY.metadataOnly,
      CAUSAL_JUDGE_EVIDENCE_TIMING.metadataOnly],
    ["simulation", CAUSAL_JUDGE_SOURCE_REALITY.simulation,
      CAUSAL_JUDGE_EVIDENCE_AUTHORITY.publisherDeclared,
      CAUSAL_JUDGE_EVIDENCE_TIMING.simulationOnly],
  ]) {
    const bytes = Buffer.from(`exact-${suffix}-empirical-source`);
    const sources = { [`source-${suffix}`]: bytes };
    const sourceManifest = createCausalJudgeSourceManifest([{
      sourceId: `source-${suffix}`, purpose: "EXECUTION_TRACE",
      mediaType: "application/octet-stream", bytes,
    }]);
    const candidate = createMechanismCandidateAssessment({
      candidateId: `candidate-${suffix}`, semanticHash: H(`semantic-${suffix}`),
      sourceArtifactHash: H(`artifact-${suffix}`), sourceManifest,
      sourceAxes: { sourceReality, evidenceAuthority: authority,
        permittedUse: CAUSAL_JUDGE_PERMITTED_USE.mechanismOnly, evidenceTiming: timing },
    }, { sources });
    const checked = verifyMechanismCandidateAssessment(candidate, { sources });
    assert.equal(checked.ok, true);
    assert.equal(checked.empiricalSourceRealityRetained, true);
    assert.equal(checked.survivalDenominatorContribution, 0);
    const report = buildCausalJudgeSurvivalReport({ policy: g.policy,
      mechanismCandidates: [candidate], createdAt: "2031-02-01T00:00:00.000Z" },
    { pinnedGovernanceKeyIds: g.pins, sources });
    assert.equal(report.inputSummary.proposedHypothesisBundles, 0);
    assert.equal(report.correlationDedup.localConformanceDenominator, 0);
    assert.equal(report.authoritativeMeasurement.denominator, 0);
  }
});

test("preregistration ordering and complete planned-test/control sets fail closed", () => {
  const g = governance();
  const f = fixture(g);
  assert.throws(() => createRandomizedControlAssignment({
    assignedAt: "2031-01-01T00:00:00.000Z",
    randomizationSourceId: "too-early-random", assignmentLedgerSourceId: "too-early-ledger",
    testUnits: f.assignment.testAssignments.map((row) => ({ testId: row.testId,
      units: row.units.map(({ unitHash, correlationRootHashes }) =>
        ({ unitHash, correlationRootHashes })) })),
    assignmentOrganizationHash: g.organizations.assignment,
  }, { policy: g.policy, hypothesis: f.hypothesis,
    assignmentPrivateKeyPem: g.keys.assignment.privateKey,
    randomizationBytes: f.randomizationBytes }), /ASSIGNMENT_TIME_ORDER_INVALID/);
  assert.throws(() => createProspectiveCausalJudgeExecution({
    ...f.execution, testExecutions: f.execution.testExecutions.slice(0, 1),
  }, { hypothesis: f.hypothesis, assignment: f.assignment,
    executionPrivateKeyPem: g.keys.execution.privateKey }), /PLANNED_TEST_SET_INCOMPLETE/);
  const noControl = structuredClone(f.assignment);
  noControl.testAssignments[0].units.forEach((unit) => { unit.arm = "INTERVENTION"; });
  assert.equal(verifyRandomizedControlAssignment(noControl, { policy: g.policy,
    hypothesis: f.hypothesis, sources: f.sources }).ok, false);
});

test("tamper, missing source and ordering attacks ABSTAIN with every downstream permission false", () => {
  const g = governance();
  const f = fixture(g);
  const tamperedSources = { ...f.sources,
    "observations-a": Buffer.from("tampered observations") };
  const tampered = verifyCausalJudgeEvidenceBundle(f.bundle,
    { policy: g.policy, pinnedGovernanceKeyIds: g.pins, sources: tamperedSources });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.decision, "ABSTAIN");
  assert.equal(tampered.causalExperienceUnits, 0);
  assert.equal(tampered.learningPermitted, false);
  assert.equal(tampered.PRICE, false);
  assert.equal(tampered.productionUsePermitted, false);
  const missing = { ...f.sources }; delete missing["trace-a"];
  assert.equal(verifyCausalJudgeEvidenceBundle(f.bundle,
    { policy: g.policy, pinnedGovernanceKeyIds: g.pins, sources: missing }).ok, false);
  const reordered = structuredClone(f.bundle);
  reordered.outcome.assessedAt = reordered.execution.completedAt;
  assert.equal(verifyCausalJudgeEvidenceBundle(reordered,
    { policy: g.policy, pinnedGovernanceKeyIds: g.pins, sources: f.sources }).ok, false);
  const wrongPurpose = structuredClone(f.bundle);
  wrongPurpose.execution.sourceManifest.entries.find((entry) =>
    entry.sourceId === "random-a").purpose = "ADJUDICATION_SUPPORT";
  assert.equal(verifyCausalJudgeEvidenceBundle(wrongPurpose,
    { policy: g.policy, pinnedGovernanceKeyIds: g.pins, sources: f.sources }).ok, false);
  assert.throws(() => buildCausalJudgeSurvivalReport({ policy: g.policy,
    bundles: [f.bundle], createdAt: f.adjudication.adjudicatedAt },
  { pinnedGovernanceKeyIds: g.pins, sources: f.sources }), /REPORT_CREATED_BEFORE_EVIDENCE/);
});

test("a fake adjudicator and artifact mutation cannot self-certify", () => {
  const g = governance();
  const f = fixture(g);
  const fake = pair();
  const adjudication = createIndependentCausalJudgeAdjudication({
    adjudicatedAt: "2031-01-03T05:00:00.000Z", decision: "ADMISSIBLE",
    adjudicationRecordHash: H("fake-adjudication-record"),
    adjudicatorOrganizationHash: g.organizations.adjudicator,
  }, { hypothesis: f.hypothesis, execution: f.execution, outcome: f.outcome,
    adjudicatorPrivateKeyPem: fake.privateKey });
  assert.throws(() => buildCausalJudgeEvidenceBundle({ hypothesis: f.hypothesis,
    assignment: f.assignment, execution: f.execution, outcome: f.outcome, adjudication },
  { policy: g.policy, sources: f.sources }), /EVIDENCE_CHAIN_INVALID/);
  const mutated = structuredClone(f.bundle);
  mutated.hypothesis.hypothesisVersion = "1.0.1";
  assert.equal(verifyCausalJudgeEvidenceBundle(mutated,
    { policy: g.policy, pinnedGovernanceKeyIds: g.pins, sources: f.sources }).ok, false);
});

test("D1 exact duplicates and correlation components cannot inflate or hide conflicting survival", () => {
  const g = governance();
  const first = fixture(g, "a", { semantic: "shared-semantic", correlation: "shared-root" });
  const second = fixture(g, "b", { semantic: "shared-semantic", correlation: "shared-root" });
  const sources = { ...first.sources, ...second.sources };
  const report = buildCausalJudgeSurvivalReport({ policy: g.policy,
    bundles: [first.bundle, first.bundle, second.bundle],
    createdAt: "2031-02-01T00:00:00.000Z" },
  { pinnedGovernanceKeyIds: g.pins, sources });
  assert.equal(report.d1DuplicateDisclosure.inputBundles, 3);
  assert.equal(report.d1DuplicateDisclosure.uniqueEvidenceHashes, 2);
  assert.equal(report.d1DuplicateDisclosure.exactDuplicatesCollapsed, 1);
  assert.equal(report.correlationDedup.eligibleUniqueBundles, 2);
  assert.equal(report.correlationDedup.correlationComponents.length, 1);
  assert.equal(report.correlationDedup.localConformanceDenominator, 1);
  const conflict = fixture(g, "c", { semantic: "shared-semantic",
    correlation: "shared-root", survived: false });
  const conflictReport = buildCausalJudgeSurvivalReport({ policy: g.policy,
    bundles: [first.bundle, conflict.bundle], createdAt: "2031-02-01T00:00:00.000Z" },
  { pinnedGovernanceKeyIds: g.pins, sources: { ...first.sources, ...conflict.sources } });
  assert.equal(conflictReport.correlationDedup.localConformanceDenominator, 0);
  assert.equal(conflictReport.correlationDedup.correlationComponents[0].decision,
    "ABSTAIN_CORRELATED_OUTCOME_CONFLICT");
});

test("formal zero-evidence pilot and verifier CLI report proposed/eligible zero", () => {
  const g = governance();
  const report = buildCausalJudgeSurvivalReport({ policy: g.policy, bundles: [],
    mechanismCandidates: [], createdAt: "2031-02-01T00:00:00.000Z" },
  { pinnedGovernanceKeyIds: g.pins, sources: {} });
  assert.equal(report.inputSummary.proposedHypothesisBundles, 0);
  assert.equal(report.correlationDedup.localConformanceDenominator, 0);
  assert.equal(report.authoritativeMeasurement.denominator, 0);
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-causal-judge-cli-"));
  try {
    writeFileSync(path.join(directory, "input.json"), JSON.stringify({ policy: g.policy,
      bundles: [], mechanismCandidates: [], createdAt: "2031-02-01T00:00:00.000Z" }));
    writeFileSync(path.join(directory, "sources.json"), "{}");
    const result = spawnSync(process.execPath,
      ["scripts/stage15-causal-judge-survival.mjs", "--input", path.join(directory, "input.json"),
        "--source-map", path.join(directory, "sources.json"),
        "--pinned-governance-key-id", g.pins[0]],
      { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.inputSummary.proposedHypothesisBundles, 0);
    assert.equal(output.correlationDedup.localConformanceDenominator, 0);
    assert.equal(output.authoritativeMeasurement.established, false);
    assert.equal(readFileSync(path.join(directory, "sources.json"), "utf8"), "{}");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
