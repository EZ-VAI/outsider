import assert from "node:assert/strict";
import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  CURATE_SCHEMAS, normalizeCurateEpisode,
} from "../src/outsider-curate-core.js";
import {
  adjudicateSimulationTrial,
  buildProspectiveSimulationPilot,
  buildSimulationLearningReceipt,
  classifyPhysicalEvidence,
  createSignedSimulationSchedule,
  createSimulationPreregistration,
  evaluateSimulationCeuMint,
  executeSimulationTrial,
  PHYSICAL_SOURCE_CLASSES,
  verifyProspectiveSimulationPilot,
  verifySimulationAdjudication,
  verifySimulationCeuDecision,
  verifySimulationExecution,
  verifySimulationLearningReceipt,
  verifySimulationPreregistration,
  verifySimulationSchedule,
} from "../src/outsider-prospective-physical-simulation.js";

const H = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const pair = () => generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const DOMAINS = Object.freeze({
  preregistration: "outsider/prospective-simulation-preregistration/v1",
  schedulerManifest: "outsider/prospective-simulation-scheduler-manifest/v1",
  executionLedger: "outsider/prospective-simulation-execution-ledger/v1",
  adjudication: "outsider/prospective-simulation-adjudication/v1",
  signature: "outsider/prospective-simulation-signature/v1",
});

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function keyId(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(der).digest("hex")}`;
}

function resign(record, { domain, hashField, role, privateKeyPem }) {
  const body = structuredClone(record);
  delete body[hashField];
  delete body.signature;
  const artifactHash = digest(domain, body);
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyPem = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" }).toString();
  const payload = canonicalizeStrict({ schema: DOMAINS.signature, role, artifactHash });
  return { ...body, [hashField]: artifactHash, signature: {
    algorithm: "Ed25519", role, keyId: keyId(publicKeyPem), publicKeyPem,
    value: cryptoSign(null, Buffer.from(payload), privateKey).toString("base64"),
  } };
}

function fixture({ sharedRoles = false } = {}) {
  const researcher = pair();
  const scheduler = sharedRoles ? researcher : pair();
  const executor = sharedRoles ? researcher : pair();
  const adjudicator = sharedRoles ? researcher : pair();
  const assignmentSeed = "fixed-assignment-seed-0001";
  const simulatorSeed = "fixed-simulator-seed-00001";
  const preregistration = createSimulationPreregistration({
    experimentId: "synthetic-physical-conformance-001",
    preregisteredAt: "2035-01-01T00:00:00.000Z",
    plannedUnitCount: 12,
    horizonSteps: 8,
    stepMs: 100,
    assignmentSeed,
    simulatorSeed,
    researcherOrganizationHash: H("research-organization"),
    researcherPrivateKeyPem: researcher.privateKey,
  });
  const manifest = createSignedSimulationSchedule(preregistration, {
    assignmentSeed,
    issuedAt: "2035-01-01T00:01:00.000Z",
    schedulerPrivateKeyPem: scheduler.privateKey,
  });
  const ledger = executeSimulationTrial(preregistration, manifest, {
    simulatorSeed,
    startedAt: "2035-01-01T00:02:00.000Z",
    executorPrivateKeyPem: executor.privateKey,
  });
  const adjudication = adjudicateSimulationTrial(preregistration, manifest, ledger, {
    adjudicatedAt: "2035-01-01T00:10:00.000Z",
    adjudicatorPrivateKeyPem: adjudicator.privateKey,
  });
  const ceuDecision = evaluateSimulationCeuMint(preregistration, manifest, ledger,
    adjudication);
  const learningReceipt = buildSimulationLearningReceipt(preregistration, manifest,
    ledger, adjudication, ceuDecision);
  const report = buildProspectiveSimulationPilot({ preregistration, manifest, ledger,
    adjudication, ceuDecision, learningReceipt });
  return { keys: { researcher, scheduler, executor, adjudicator }, assignmentSeed,
    simulatorSeed, preregistration, manifest, ledger, adjudication, ceuDecision,
    learningReceipt, report };
}

test("closes a signed prospective simulation protocol without minting real CEU", () => {
  const f = fixture();
  assert.equal(verifySimulationPreregistration(f.preregistration).ok, true);
  assert.equal(verifySimulationSchedule(f.manifest,
    { preregistration: f.preregistration }).ok, true);
  assert.equal(verifySimulationExecution(f.ledger,
    { preregistration: f.preregistration, manifest: f.manifest }).ok, true);
  assert.equal(verifySimulationAdjudication(f.adjudication,
    { preregistration: f.preregistration, manifest: f.manifest,
      ledger: f.ledger }).ok, true);
  assert.equal(verifySimulationCeuDecision(f.ceuDecision,
    { preregistration: f.preregistration, manifest: f.manifest, ledger: f.ledger,
      adjudication: f.adjudication }).ok, true);
  assert.equal(verifySimulationLearningReceipt(f.learningReceipt,
    { preregistration: f.preregistration, manifest: f.manifest, ledger: f.ledger,
      adjudication: f.adjudication, ceuDecision: f.ceuDecision }).ok, true);
  const verified = verifyProspectiveSimulationPilot(f.report, f);
  assert.equal(verified.ok, true);
  assert.equal(verified.protocolConformance, true);
  assert.equal(verified.realRobotEvidence, false);
  assert.equal(verified.causalExperienceUnits, 0);
  assert.equal(f.ceuDecision.counts.protocolConformanceUnits, 12);
  assert.equal(f.ceuDecision.counts.realProspectiveExecutions, 0);
  assert.equal(f.learningReceipt.consumption.causalExperienceUnitsConsumed, 0);
  assert.equal(f.learningReceipt.modelEffect.automaticTraining, false);
  assert.equal(f.report.authority.authority, "none");
  assert.deepEqual(f.report.authority.permits,
    { PRICE: false, GUARANTEE: false, SETTLE: false });
});

test("precommits the exact population, balanced assignment, propensity and windows", () => {
  const f = fixture();
  assert.equal(new Set(f.preregistration.population.map((item) => item.unitIdHash)).size, 12);
  assert.equal(new Set(f.preregistration.population.map((item) => item.episodeIdHash)).size, 12);
  assert.equal(f.manifest.assignments.filter((item) => item.arm === "CONTROL").length, 6);
  assert.equal(f.manifest.assignments.filter((item) => item.arm === "INTERVENTION").length, 6);
  assert.ok(f.manifest.assignments.every((item) => item.propensity === 0.5
    && item.issuedAt === f.manifest.issuedAt && item.nonce.startsWith("sha256:")));
  assert.ok(f.ledger.executions.every((item) => item.steps.length === 8
    && item.monotonicStartTick === 0 && item.monotonicEndTick === 8));
  assert.ok(f.ledger.outcomes.every((item, index) => (
    item.executionHash === f.ledger.executions[index].executionHash
    && item.recordedBy === "EXECUTOR" && item.independentOutcomeSensing === false
  )));
  assert.equal(f.adjudication.roleSeparation.organizationalIndependenceEstablished, false);
  assert.equal(f.adjudication.roleSeparation.outcomeSensing,
    "EXECUTOR_RECORDED_NOT_INDEPENDENTLY_SENSED");
});

test("correlation roots remain stable across experiment ids for the same simulator", () => {
  const researcher = pair();
  const common = {
    preregisteredAt: "2035-01-01T00:00:00.000Z",
    plannedUnitCount: 4,
    assignmentSeed: "cross-experiment-assignment-seed",
    simulatorSeed: "cross-experiment-simulator-seed",
    researcherOrganizationHash: H("cross-experiment-researcher"),
    researcherPrivateKeyPem: researcher.privateKey,
  };
  const first = createSimulationPreregistration({ ...common, experimentId: "experiment-a" });
  const second = createSimulationPreregistration({ ...common, experimentId: "experiment-b" });
  assert.notEqual(first.population[0].unitIdHash, second.population[0].unitIdHash);
  assert.notEqual(first.population[0].episodeIdHash, second.population[0].episodeIdHash);
  assert.deepEqual([...new Set(first.population.map((item) => item.correlationRoot))],
    [...new Set(second.population.map((item) => item.correlationRoot))]);
});

test("source class is structural and exposes no caller-controlled REAL path", () => {
  const f = fixture();
  assert.equal(classifyPhysicalEvidence(f.preregistration.sourceEvidence),
    PHYSICAL_SOURCE_CLASSES.synthetic);
  const hashShapedHistoricalClaim = {
    schema: "outsider/curate-episode/v1", episodeHash: H("episode"),
    provenance: { class: "historical-public-dataset" },
  };
  assert.equal(classifyPhysicalEvidence(hashShapedHistoricalClaim),
    PHYSICAL_SOURCE_CLASSES.unverified);
  const historical = normalizeCurateEpisode({
    schema: CURATE_SCHEMAS.episodeInput,
    source: { datasetId: "historical-test", datasetVersion: "1.0.0",
      datasetManifestHash: H("manifest"), sourceObjectHash: H("object"),
      licenseId: "CC-BY-4.0", attributionHash: H("attribution") },
    instrument: { extractorId: "historical-test", extractorVersion: "1.0.0",
      extractorImplementationHash: H("extractor"), featureSchemaHash: H("features") },
    episodeIdHash: H("historical-episode"), platformClass: null,
    steps: [0, 1].map((index) => ({ index, tOffsetMs: index * 10,
      boundary: { isFirst: index === 0, isLast: index === 1, isTerminal: index === 1 },
      observation: { commitment: H(`observation-${index}`), features: { position: index },
        images: [] }, action: null, outcome: null })),
  });
  assert.equal(classifyPhysicalEvidence(historical), PHYSICAL_SOURCE_CLASSES.historical);
  assert.equal(classifyPhysicalEvidence({
    schema: "outsider/trusted-prospective-device-evidence/v1",
    sourceClass: "REAL_PROSPECTIVE_DEVICE", realWorld: true,
    externalDeviceAttestation: H("fake"), externalAcquisitionRoot: H("self"),
  }), PHYSICAL_SOURCE_CLASSES.unverified);

  const promoted = structuredClone(f.preregistration);
  promoted.sourceClass = "REAL_PROSPECTIVE_DEVICE";
  promoted.sourceEvidence.externalDeviceAttestation = H("fake-device");
  promoted.sourceEvidence.externalAcquisitionRoot = H("self-root");
  const resealed = resign(promoted, { domain: DOMAINS.preregistration,
    hashField: "preregistrationHash", role: "researcher",
    privateKeyPem: f.keys.researcher.privateKey });
  assert.equal(verifySimulationPreregistration(resealed).ok, false);
});

test("arm, propensity, ordinal and post-hoc schedule changes fail even when resealed", () => {
  const f = fixture();
  for (const mutate of [
    (copy) => { copy.assignments[0].arm = copy.assignments[0].arm === "CONTROL"
      ? "INTERVENTION" : "CONTROL"; },
    (copy) => { copy.assignments[0].propensity = 0.9; },
    (copy) => { copy.assignments[0].ordinal = 99; },
    (copy) => { copy.assignments[0].episodeIdHash = copy.assignments[1].episodeIdHash; },
  ]) {
    const copy = structuredClone(f.manifest);
    mutate(copy);
    const resealed = resign(copy, { domain: DOMAINS.schedulerManifest,
      hashField: "manifestHash", role: "scheduler",
      privateKeyPem: f.keys.scheduler.privateKey });
    assert.equal(verifySimulationSchedule(resealed,
      { preregistration: f.preregistration }).ok, false);
  }
  const postHoc = structuredClone(f.manifest);
  postHoc.issuedAt = "2035-01-01T00:03:00.000Z";
  for (const assignment of postHoc.assignments) assignment.issuedAt = postHoc.issuedAt;
  const resealed = resign(postHoc, { domain: DOMAINS.schedulerManifest,
    hashField: "manifestHash", role: "scheduler",
    privateKeyPem: f.keys.scheduler.privateKey });
  assert.equal(verifySimulationExecution(f.ledger,
    { preregistration: f.preregistration, manifest: resealed }).ok, false);
});

test("execution replay, duplicates, incomplete windows and outcome substitution fail closed", () => {
  const f = fixture();
  for (const mutate of [
    (copy) => { copy.executions[0].arm = copy.executions[0].arm === "CONTROL"
      ? "INTERVENTION" : "CONTROL"; },
    (copy) => { copy.executions[1].unitIdHash = copy.executions[0].unitIdHash; },
    (copy) => { copy.executions[1].episodeIdHash = copy.executions[0].episodeIdHash; },
    (copy) => { copy.executions[0].steps.pop(); },
    (copy) => { copy.outcomes[0].eventObserved = !copy.outcomes[0].eventObserved; },
    (copy) => { copy.outcomes[1] = structuredClone(copy.outcomes[0]); },
  ]) {
    const copy = structuredClone(f.ledger);
    mutate(copy);
    const resealed = resign(copy, { domain: DOMAINS.executionLedger,
      hashField: "ledgerHash", role: "executor",
      privateKeyPem: f.keys.executor.privateKey });
    assert.equal(verifySimulationExecution(resealed,
      { preregistration: f.preregistration, manifest: f.manifest }).ok, false);
  }
});

test("same-key role collapse and adjudicator substitution are refused", () => {
  const researcher = pair();
  const assignmentSeed = "fixed-assignment-seed-role";
  const simulatorSeed = "fixed-simulator-seed-role-0";
  const preregistration = createSimulationPreregistration({
    preregisteredAt: "2035-01-01T00:00:00.000Z", assignmentSeed, simulatorSeed,
    researcherOrganizationHash: H("same-key"), researcherPrivateKeyPem: researcher.privateKey,
  });
  const manifest = createSignedSimulationSchedule(preregistration, {
    assignmentSeed, issuedAt: "2035-01-01T00:01:00.000Z",
    schedulerPrivateKeyPem: researcher.privateKey,
  });
  assert.equal(verifySimulationSchedule(manifest, { preregistration }).ok, false);

  const f = fixture();
  assert.throws(() => adjudicateSimulationTrial(f.preregistration, f.manifest, f.ledger, {
    adjudicatedAt: "2035-01-01T00:10:00.000Z",
    adjudicatorPrivateKeyPem: f.keys.executor.privateKey,
  }), /ROLE_KEY_REUSE/);
  const substituted = structuredClone(f.adjudication);
  substituted.executionLedgerHash = H("other-execution");
  const resealed = resign(substituted, { domain: DOMAINS.adjudication,
    hashField: "adjudicationHash", role: "adjudicator",
    privateKeyPem: f.keys.adjudicator.privateKey });
  assert.equal(verifySimulationAdjudication(resealed,
    { preregistration: f.preregistration, manifest: f.manifest, ledger: f.ledger }).ok, false);
});

test("self-signed artifacts cannot reverse preregistration, assignment, execution order", () => {
  const f = fixture();
  const earlySchedule = structuredClone(f.manifest);
  earlySchedule.issuedAt = "2034-12-31T23:59:00.000Z";
  earlySchedule.assignments.forEach((item) => { item.issuedAt = earlySchedule.issuedAt; });
  const resealedSchedule = resign(earlySchedule, { domain: DOMAINS.schedulerManifest,
    hashField: "manifestHash", role: "scheduler",
    privateKeyPem: f.keys.scheduler.privateKey });
  assert.equal(verifySimulationSchedule(resealedSchedule,
    { preregistration: f.preregistration }).ok, false);

  const earlyExecution = structuredClone(f.ledger);
  earlyExecution.startedAt = "2035-01-01T00:00:30.000Z";
  const resealedExecution = resign(earlyExecution, { domain: DOMAINS.executionLedger,
    hashField: "ledgerHash", role: "executor",
    privateKeyPem: f.keys.executor.privateKey });
  assert.equal(verifySimulationExecution(resealedExecution,
    { preregistration: f.preregistration, manifest: f.manifest }).ok, false);

  const earlyAdjudication = structuredClone(f.adjudication);
  earlyAdjudication.adjudicatedAt = "2035-01-01T00:02:00.100Z";
  const resealedAdjudication = resign(earlyAdjudication, { domain: DOMAINS.adjudication,
    hashField: "adjudicationHash", role: "adjudicator",
    privateKeyPem: f.keys.adjudicator.privateKey });
  assert.equal(verifySimulationAdjudication(resealedAdjudication,
    { preregistration: f.preregistration, manifest: f.manifest, ledger: f.ledger }).ok, false);
});

test("unknown or expanded applicability and post-hoc policy edits fail after researcher reseal", () => {
  const f = fixture();
  const cases = [
    (copy) => { copy.applicabilityBounds.unknownOutsideBounds = false; },
    (copy) => { copy.applicabilityBounds.included.push("real robots"); },
    (copy) => { copy.policy.stoppingPolicy.mode = "STOP_WHEN_FAVORABLE"; },
    (copy) => { copy.confounderRegister = []; },
    (copy) => { copy.population.pop(); },
  ];
  for (const mutate of cases) {
    const copy = structuredClone(f.preregistration);
    mutate(copy);
    if (copy.policy) copy.policyHash = digest(
      "outsider/prospective-simulation-policy/v1", copy.policy);
    const resealed = resign(copy, { domain: DOMAINS.preregistration,
      hashField: "preregistrationHash", role: "researcher",
      privateKeyPem: f.keys.researcher.privateKey });
    assert.equal(verifySimulationPreregistration(resealed).ok, false);
  }
});

test("resealing downstream labels cannot promote simulation into CEU, training or PRICE", () => {
  const f = fixture();
  const ceu = structuredClone(f.ceuDecision);
  ceu.sourceAssessment.recomputedSourceClass = "REAL_PROSPECTIVE_DEVICE";
  ceu.sourceAssessment.realSourceVerificationImplemented = true;
  ceu.sourceAssessment.trustedExternalDeviceChainVerified = true;
  ceu.counts.causalExperienceUnits = 12;
  ceu.counts.realProspectiveExecutions = 12;
  ceu.decision = "MINT";
  ceu.candidates.forEach((item) => { item.admitted = true; item.refusalCode = null; });
  delete ceu.ceuDecisionHash;
  ceu.ceuDecisionHash = digest("outsider/prospective-simulation-ceu-decision/v1", ceu);
  assert.equal(verifySimulationCeuDecision(ceu,
    { preregistration: f.preregistration, manifest: f.manifest, ledger: f.ledger,
      adjudication: f.adjudication }).ok, false);

  const learning = structuredClone(f.learningReceipt);
  learning.consumption.causalExperienceUnitsConsumed = 12;
  learning.modelEffect.automaticTraining = true;
  learning.modelEffect.productionModelUpdated = true;
  learning.authority.permits.PRICE = true;
  delete learning.learningReceiptHash;
  learning.learningReceiptHash = digest(
    "outsider/prospective-simulation-learning-receipt/v1", learning);
  assert.equal(verifySimulationLearningReceipt(learning,
    { preregistration: f.preregistration, manifest: f.manifest, ledger: f.ledger,
      adjudication: f.adjudication, ceuDecision: f.ceuDecision }).ok, false);
});

test("the same deterministic seeds reproduce assignments, executions and outcomes", () => {
  const f = fixture();
  const schedule = createSignedSimulationSchedule(f.preregistration, {
    assignmentSeed: f.assignmentSeed,
    issuedAt: f.manifest.issuedAt,
    schedulerPrivateKeyPem: f.keys.scheduler.privateKey,
  });
  assert.deepEqual(schedule.assignments, f.manifest.assignments);
  const ledger = executeSimulationTrial(f.preregistration, schedule, {
    simulatorSeed: f.simulatorSeed,
    startedAt: f.ledger.startedAt,
    executorPrivateKeyPem: f.keys.executor.privateKey,
  });
  assert.deepEqual(ledger.executions, f.ledger.executions);
  assert.deepEqual(ledger.outcomes, f.ledger.outcomes);
});

test("standalone CLI writes an exact no-clobber artifact set and verifies it", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-prospective-sim-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "pilot");
  const script = path.resolve("scripts/stage15-prospective-simulation-pilot.mjs");
  const run = spawnSync(process.execPath, [script, "run", "--output-dir", output,
    "--units", "8", "--assignment-seed", "cli-assignment-seed-0001",
    "--simulator-seed", "cli-simulator-seed-00001"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.protocolConformance, true);
  assert.equal(summary.causalExperienceUnits, 0);
  assert.equal(summary.realRobotEvidence, false);

  const verify = spawnSync(process.execPath, [script, "verify", "--output-dir", output],
    { encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).reportHash, summary.reportHash);

  const clobber = spawnSync(process.execPath, [script, "run", "--output-dir", output],
    { encoding: "utf8" });
  assert.equal(clobber.status, 1);
  assert.match(clobber.stderr, /OUTPUT_DIR_EXISTS/);
});
