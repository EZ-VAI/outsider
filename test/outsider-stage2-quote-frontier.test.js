import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCurateCheckpoint,
  clearCurateEpisode,
  createCurateInclusionProof,
  CURATE_SCHEMAS,
  normalizeCurateEpisode,
} from "../src/outsider-curate-core.js";
import {
  buildEmpiricalFactorLedger,
} from "../src/outsider-empirical-factor-ledger.js";
import {
  buildLossExposureQuarantine,
  buildLossExposureShadowBook,
  lossExposurePublicKeyId,
  signLossExposureAdjudication,
  signLossExposureFraudReview,
  signLossExposureObservation,
} from "../src/outsider-loss-exposure-evidence.js";
import {
  createRealityCurateEvidenceIntent,
  createSourceBoundRealityAdvisoryEnvelope,
} from "../src/outsider-reality-stewardship-integration.js";
import {
  assessRealityStewardship,
  createRealityBoundary,
  createRealityBudgetCommitment,
  createRealityExecutionReceipt,
  createStewardshipClaim,
} from "../src/outsider-reality-stewardship.js";
import {
  buildStage2QuoteCandidate,
  buildStage2QuoteFrontier,
  STAGE2_PRE_ACTION_FACTOR_POLICY,
  STAGE2_QUOTE_FRONTIER_SCHEMAS,
  verifyStage2QuoteCandidate,
  verifyStage2QuoteCandidateStructure,
  verifyStage2QuoteFrontier,
  verifyStage2QuoteFrontierStructure,
} from "../src/outsider-stage2-quote-frontier.js";
import {
  createAttestationV2,
  createStage05ControlledWayBinding,
  finalizeStage05Evidence,
} from "../src/outsider-stage05-evidence.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";
import { freezeContract } from "../src/outsider-work-contract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const h = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const at = (seconds) => new Date(Date.parse("2026-08-21T00:00:00.000Z")
  + seconds * 1_000).toISOString();
const LOSS_AT = "2026-08-20T00:00:00.000Z";

function domainDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function reseal(value, hashField, domain) {
  const body = structuredClone(value);
  delete body[hashField];
  return { ...body, [hashField]: domainDigest(domain, body) };
}

function curateSource() {
  const episode = normalizeCurateEpisode({
    schema: CURATE_SCHEMAS.episodeInput,
    source: {
      datasetId: "stage2-frontier-test",
      datasetVersion: "2026.08",
      datasetManifestHash: h("curate-manifest"),
      sourceObjectHash: h("curate-object"),
      licenseId: "CC-BY-4.0",
      attributionHash: h("curate-attribution"),
    },
    instrument: {
      extractorId: "stage2-frontier-test",
      extractorVersion: "1.0.0",
      extractorImplementationHash: h("curate-extractor"),
      featureSchemaHash: h("curate-feature-schema"),
    },
    episodeIdHash: h("curate-episode"),
    platformClass: "test-robot",
    steps: [0, 1].map((index) => ({
      index,
      tOffsetMs: index * 10,
      boundary: { isFirst: index === 0, isLast: index === 1,
        isTerminal: index === 1 },
      observation: {
        commitment: h(`curate-observation-${index}`),
        features: { "joint.position.0": index + 1 },
        images: [],
      },
      action: { kind: "joint-delta", features: { "joint.0": (index + 1) / 10 } },
      outcome: index === 1 ? { kind: "terminal", features: { success: 1 } } : null,
    })),
  });
  const history = [];
  const clearance = clearCurateEpisode(episode, { history });
  const checkpointClearances = [clearance];
  const checkpoint = buildCurateCheckpoint(checkpointClearances,
    { checkpointId: "stage2-frontier" });
  const inclusionProof = createCurateInclusionProof(
    checkpointClearances, clearance.clearanceHash, checkpoint,
  );
  return { episode, history, clearance, checkpoint, checkpointClearances, inclusionProof };
}

function realitySources(t) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "outsider-stage2-frontier-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const workspace = path.join(temporaryRoot, "workspace");
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, "result.txt"), "bounded result\n");

  const curate = curateSource();
  const curateIntent = createRealityCurateEvidenceIntent({ curateSource: curate });
  const partyA = h("affected-party-a");
  const partyB = h("affected-party-b");
  const boundary = createRealityBoundary({
    boundaryId: "stage2-frontier-world",
    worldHash: h("world"),
    policyHash: h("world-policy"),
    resourceOwnerRootHash: h("resource-owner"),
    affectedPartyRootHashes: [partyA, partyB],
    constraints: [
      { channelId: "consent", kind: "HARD_PROHIBITION", unit: "violations",
        cap: 0, aggregation: "CUMULATIVE_MAX", nonCompensable: true,
        affectedPartyRootHashes: [partyA, partyB] },
      { channelId: "shared-load", kind: "CUMULATIVE_CAP", unit: "impact-points",
        cap: 10, aggregation: "INCREMENTAL_SUM", nonCompensable: true,
        affectedPartyRootHashes: [partyA, partyB] },
    ],
    observationHorizons: [
      { horizonId: "immediate", closesAfterMs: 0, mandatory: true },
      { horizonId: "delayed", closesAfterMs: 2_000, mandatory: true },
    ],
    challengePolicyHash: h("challenge-policy"),
    recoveryStandardHash: h("recovery-standard"),
    validFrom: at(0),
    validUntil: at(100),
  });
  const provider = h("provider");
  const claim = createStewardshipClaim({
    boundary,
    claimIdHash: h("claim"),
    wayHash: h("way"),
    claimantRootHash: h("claimant"),
    standingEvidenceHashes: [h("standing-reference")],
    purpose: "EXPERIENCE",
    operationHashes: [h("operation"), curateIntent.intentHash],
    representedPartyRootHashes: [...boundary.affectedPartyRootHashes],
    requestedExternalities: [
      { channelId: "consent", amount: 0 },
      { channelId: "shared-load", amount: 3 },
    ],
    alternativesConsideredHashes: [h("simulation-alternative")],
    whyRealityRequiredHash: h("why-reality-required"),
    causalDesignHash: h("causal-design"),
    experienceRightsHash: curateIntent.declaredExperienceRightsReferenceHash,
    optionPreservationEvidenceHashes: [h("option-preservation")],
    recoveryPlanHash: h("recovery-plan"),
    responsibilityRootHashes: [h("principal"), provider],
    requestedAt: at(1),
    expiresAt: at(90),
  });

  const baseline = snapshotWorkspace(workspace);
  const contract = freezeContract({
    cwd: workspace,
    ask: "collect one bounded experience",
    acceptance: "test -f result.txt",
    semantic: {
      objective: "collect one bounded experience",
      successCriteria: ["result exists"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["result.txt"], out: [] }, uncertainties: [],
    },
    semanticAudit: { passed: true, evidenceHash: h("semantic-audit") },
    baselineEvidence: baseline,
  });
  const binding = createStage05ControlledWayBinding({
    contract,
    host: "claude-code",
    workerExecutable: "test-worker",
    supervisorCommand: "test-supervisor",
    exactClaim: { claimHash: claim.claimHash },
    exactWay: { wayHash: claim.wayHash },
    exactWorld: { worldHash: boundary.worldHash },
  });
  const store = RunStore.create({
    cwd: workspace,
    contract,
    supervisorCommand: "test-supervisor",
    stateRoot: path.join(temporaryRoot, "runs"),
    binding,
  });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash,
    createdBeforeWorker: true });
  store.append("contract_compiled", { objective: contract.semantic.objective });
  store.append("contract_audited", { passed: true, evidenceHash: h("semantic-audit") });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  store.append("worker_launch", { executable: "test-worker" });
  store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0 });
  store.append("outcome_verdict", { phase: "stop", passed: true,
    finalFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
    acceptancePassed: true, finalFingerprint: baseline.fingerprint, errors: [] });
  store.saveState({ status: "complete", proof: { complete: true,
    deliveryComplete: true, interventionRequired: false, interventionComplete: true } });
  const evidence = finalizeStage05Evidence({ directory: store.directory });
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const attestation = createAttestationV2({
    runDirectories: [store.directory], privateKeyPem,
  });
  const assessment = assessRealityStewardship({
    boundary, claim, priorCommitmentEntries: [], now: at(2),
  });
  const currentCommitment = createRealityBudgetCommitment({
    boundary, claim,
    channelAmounts: claim.requestedExternalities,
    commitmentEvidenceHash: h("local-budget-reservation"),
    committedAt: at(3),
  });
  const execution = createRealityExecutionReceipt({
    boundary, claim,
    ownerGateReceiptHash: h("opaque-owner-gate-reference"),
    executionEvidenceHash: evidence.publicEvidence.publicEvidenceHash,
    providerRootHash: provider,
    responsibilityRootHashes: claim.responsibilityRootHashes,
    executedAt: at(10),
  });
  const sources = {
    boundary,
    claim,
    assessment,
    priorCommitmentEntries: [],
    currentCommitment,
    execution,
    curateIntent,
    curateSource: curate,
    stage05Source: { runDirectory: store.directory, attestation },
  };
  const envelope = createSourceBoundRealityAdvisoryEnvelope({
    ...sources, createdAt: at(10.5),
  });
  return { sources, envelope };
}

function lossKey(label) {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    keyId: lossExposurePublicKeyId(publicKeyPem), publicKeyPem, privateKeyPem,
    domainRootHash: h(`domain:${label}`), controlRootHash: h(`control:${label}`),
  };
}

function trustEntry(key) {
  return {
    publicKeyPem: key.publicKeyPem,
    domainRootHash: key.domainRootHash,
    controlRootHash: key.controlRootHash,
    conformanceOnly: true,
    policyVersionHash: h(`trust-policy:${key.keyId}`),
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z",
    revokedAt: null,
  };
}

function lossEnvironment() {
  const operator = lossKey("operator");
  const adjudicator = lossKey("adjudicator");
  const reviewer = lossKey("reviewer");
  return {
    operator, adjudicator, reviewer,
    trustStore: {
      operators: { [operator.keyId]: trustEntry(operator) },
      adjudicators: { [adjudicator.keyId]: trustEntry(adjudicator) },
      fraudReviewers: { [reviewer.keyId]: trustEntry(reviewer) },
    },
  };
}

function lossIncident(id) {
  return {
    incidentIdHash: h(id),
    claimIdHash: h(`claim:${id}`),
    occurredAt: "2026-08-19T07:00:00.000Z",
    currency: "USD",
    grossAmountMinorUnits: 12_500,
    recoveryAmountMinorUnits: 2_500,
    economicLossBasis: "CLAIM_PAID",
    lossEvidenceHashes: [h(`loss-proof:${id}`)],
  };
}

function lossObservationPayload(operator, id, { loss = false } = {}) {
  const startAt = loss ? "2026-08-19T06:00:00.000Z" : "2026-08-19T01:00:00.000Z";
  const endAt = loss ? "2026-08-19T08:00:00.000Z" : "2026-08-19T03:00:00.000Z";
  const observedAt = loss ? "2026-08-19T08:10:00.000Z" : "2026-08-19T03:10:00.000Z";
  const systemRootHash = h("system-a");
  return {
    sourceClass: "PROSPECTIVE_DESIGN_PARTNER",
    sourceRecordIdHash: h(`source:${id}`),
    operatorDomainRootHash: operator.domainRootHash,
    operatorControlRootHash: operator.controlRootHash,
    systemRootHash,
    instrumentHash: h("instrument-v1"),
    policyHash: h("loss-policy-v1"),
    assignmentAt: "2026-08-19T00:30:00.000Z",
    observedAt,
    window: {
      windowIdHash: h(`window:${id}`),
      populationRootHash: h("population-a"),
      populationManifestHash: h(`population-manifest:${id}`),
      startAt,
      endAt,
      status: "CLOSED",
      exposureUnit: "RUN",
      unitDefinitionHash: h("run-unit-v1"),
      quantityMicrounits: 1_000_000,
      reportingCurrency: "USD",
    },
    reportedIncidents: loss ? [lossIncident(`incident:${id}`)] : [],
    provenance: {
      sourceSystemHash: h("partner-ledger"),
      collectionMethodHash: h("signed-export-v1"),
      sourceEvidenceHashes: [h(`source-evidence:${id}`)],
      licenseStatus: "VERIFIED",
      licenseEvidenceHash: h("data-license"),
      researchUsePermitted: true,
      pricingUsePermitted: false,
      piiIncluded: false,
      rawPayloadRetainedByOutsider: false,
    },
    correlationRoots: [operator.domainRootHash, operator.controlRootHash,
      systemRootHash].sort(),
    claimBoundary: {
      automaticTraining: false,
      benchmarkSpendUsedAsLoss: false,
      droidOrHistoricalRobotCorpusUsedAsLoss: false,
      estimatedDamageUsedAsLoss: false,
      failedAttemptCostUsedAsLoss: false,
      modelTokenCostUsedAsLoss: false,
      robotRewardUsedAsLoss: false,
    },
  };
}

function commitments(payload) {
  return {
    windowCommitmentHash: `sha256:${createHash("sha256")
      .update(canonicalizeStrict({ domain: "outsider/loss-exposure-window-commitment/v1",
        value: payload.window })).digest("hex")}`,
    claimSetHash: `sha256:${createHash("sha256")
      .update(canonicalizeStrict({ domain: "outsider/loss-exposure-claim-set/v1",
        value: payload.reportedIncidents.map((incident) => ({
          incidentIdHash: incident.incidentIdHash, claimIdHash: incident.claimIdHash,
        })) })).digest("hex")}`,
  };
}

function adjudicate(entry, env) {
  const source = entry.observationEnvelope.payload;
  const reviewedAt = new Date(Date.parse(source.observedAt) + 3_600_000).toISOString();
  const adjudicatedAt = new Date(Date.parse(source.observedAt) + 7_200_000).toISOString();
  const bound = commitments(source);
  const fraudReview = signLossExposureFraudReview({
    quarantineEntryHash: entry.entryHash,
    sourceObservationHash: entry.sourceObservationHash,
    ...bound,
    policyHash: source.policyHash,
    reviewerDomainRootHash: env.reviewer.domainRootHash,
    reviewerControlRootHash: env.reviewer.controlRootHash,
    completedAt: reviewedAt,
    status: "CLEAR",
    evidenceHashes: [h(`fraud-review:${entry.entryHash}`)],
  }, { privateKeyPem: env.reviewer.privateKeyPem });
  return signLossExposureAdjudication({
    quarantineEntryHash: entry.entryHash,
    sourceObservationHash: entry.sourceObservationHash,
    ...bound,
    policyHash: source.policyHash,
    adjudicatorDomainRootHash: env.adjudicator.domainRootHash,
    adjudicatorControlRootHash: env.adjudicator.controlRootHash,
    adjudicatedAt,
    status: "FINAL",
    disposition: source.reportedIncidents.length ? "LOSS_CONFIRMED" : "NO_LOSS",
    observationWindowClosed: true,
    exposureVerified: true,
    populationCompletenessVerified: true,
    finalIncidents: source.reportedIncidents,
    adjudicationEvidenceHashes: [h(`adjudication:${entry.entryHash}`)],
    fraudReviewHash: fraudReview.fraudReviewHash,
    appealStatus: "NONE",
    authority: { movesFunds: false, permitsCapital: false, permitsCoverage: false,
      permitsPricing: false, permitsSettlement: false },
  }, { privateKeyPem: env.adjudicator.privateKeyPem, fraudReview });
}

function lossSources() {
  const env = lossEnvironment();
  const observations = [
    signLossExposureObservation(lossObservationPayload(env.operator, "zero"),
      { privateKeyPem: env.operator.privateKeyPem }),
    signLossExposureObservation(lossObservationPayload(env.operator, "loss", { loss: true }),
      { privateKeyPem: env.operator.privateKeyPem }),
  ];
  const quarantine = buildLossExposureQuarantine(observations,
    { trustStore: env.trustStore, createdAt: LOSS_AT });
  const adjudications = quarantine.entries.map((entry) => adjudicate(entry, env));
  const book = buildLossExposureShadowBook({
    quarantine, adjudications, trustStore: env.trustStore, generatedAt: LOSS_AT,
  });
  return {
    book,
    sources: {
      quarantine,
      quarantineLineage: [],
      adjudications,
      trustStore: env.trustStore,
      now: LOSS_AT,
    },
  };
}

const empiricalPaths = {
  wave3SourceDirectory: path.join(root,
    "artifacts/public-agent-wave3-20260821/source/cuarewardbench"),
  wave4SourceDirectory: path.join(root,
    "artifacts/public-agent-wave4-20260821/source/agentrx-tau"),
  botFailsSourceDirectory: path.join(root,
    "artifacts/curate-public-robotics-20260820/source/botfails"),
  ur5SourceDirectory: path.join(root,
    "artifacts/curate-public-robotics-20260820/source/ur5fail-execution"),
  droidArtifactDirectory: path.join(root,
    "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay"),
  droidSourceDirectory: path.join(root, "artifacts/curate-droid100-20260819/source"),
  nhtsaRegistryDirectory: path.join(root,
    "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902"),
  nhtsaCsvPath: path.join(root,
    "artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv"),
  nhtsaDataDictionaryPath: path.join(root,
    "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf"),
};
const hasEmpiricalSources = Object.values(empiricalPaths).every(existsSync)
  && existsSync(path.join(empiricalPaths.droidSourceDirectory,
    "r2d2_faceblur-train.tfrecord-00000-of-00031"));
let empiricalOptions;
let empiricalLedger;

before(() => {
  if (!hasEmpiricalSources) return;
  empiricalOptions = {
    wave3SourceDirectory: empiricalPaths.wave3SourceDirectory,
    wave4SourceDirectory: empiricalPaths.wave4SourceDirectory,
    botFailsSourceDirectory: empiricalPaths.botFailsSourceDirectory,
    ur5SourceDirectory: empiricalPaths.ur5SourceDirectory,
    droidArtifactDirectory: empiricalPaths.droidArtifactDirectory,
    nhtsaRegistryDirectory: empiricalPaths.nhtsaRegistryDirectory,
    nhtsaCsvPath: empiricalPaths.nhtsaCsvPath,
    nhtsaDataDictionaryPath: empiricalPaths.nhtsaDataDictionaryPath,
    nhtsaReplayAt: "2026-09-02T14:20:08.000Z",
    droidSource: {
      objectListBytes: readFileSync(path.join(empiricalPaths.droidSourceDirectory,
        "gcs-objects.json")),
      datasetInfoBytes: readFileSync(path.join(empiricalPaths.droidSourceDirectory,
        "dataset_info.json")),
      featureBytes: readFileSync(path.join(empiricalPaths.droidSourceDirectory,
        "features.json")),
      shardBytes: readFileSync(path.join(empiricalPaths.droidSourceDirectory,
        "r2d2_faceblur-train.tfrecord-00000-of-00031")),
    },
  };
  empiricalLedger = buildEmpiricalFactorLedger(empiricalOptions);
});

function fullFixture(t) {
  const reality = realitySources(t);
  const loss = lossSources();
  const sources = {
    realityEnvelope: reality.envelope,
    realitySources: reality.sources,
    empiricalLedger,
    empiricalSourceOptions: empiricalOptions,
    lossExposureBook: loss.book,
    lossExposureSources: loss.sources,
  };
  const frontier = buildStage2QuoteFrontier({ createdAt: at(20), sources });
  return { sources, frontier, reality, loss };
}

function resealFrontier(frontier) {
  return reseal(frontier, "frontierHash", STAGE2_QUOTE_FRONTIER_SCHEMAS.frontier);
}

function resealQuote(candidate) {
  return reseal(candidate, "candidateHash", STAGE2_QUOTE_FRONTIER_SCHEMAS.quoteCandidate);
}

test("pre-action policy versions observation timing and blocks every outcome-derived factor", () => {
  assert.equal(STAGE2_PRE_ACTION_FACTOR_POLICY.schema,
    "outsider/stage2-pre-action-factor-policy/v1");
  assert.match(STAGE2_PRE_ACTION_FACTOR_POLICY.policyHash, /^sha256:[a-f0-9]{64}$/);
  assert.ok(STAGE2_PRE_ACTION_FACTOR_POLICY.factors.length > 30);
  for (const factor of STAGE2_PRE_ACTION_FACTOR_POLICY.factors) {
    if (factor.outcomeDerived) {
      assert.equal(factor.admission, "FORBIDDEN_POST_OUTCOME_OR_LABEL_DERIVED");
    }
  }
  assert.equal(STAGE2_PRE_ACTION_FACTOR_POLICY.timingRule.observationMustPrecedeAction, true);
  assert.equal(STAGE2_PRE_ACTION_FACTOR_POLICY.timingRule.zeroImputationPermitted, false);
});

test("full source replay builds an exact frontier that still abstains without numbers",
  { skip: !hasEmpiricalSources }, (t) => {
    const { sources, frontier } = fullFixture(t);
    const checked = verifyStage2QuoteFrontier(frontier, sources);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.verificationLevel,
      "FULL_ATTEST_CURATE_REALITY_EMPIRICAL_LOSS_SOURCES_REPLAYED");
    assert.equal(checked.sourceReverified, true);
    assert.equal(checked.bindingHashes.frontierHash, frontier.frontierHash);
    assert.equal(checked.bindingHashes.claimHash, frontier.bindings.reality.claimHash);
    assert.equal(checked.bindingHashes.registryHash, frontier.bindings.registry.registryHash);
    assert.equal(frontier.bindings.empirical.sourceRows.NHTSA_SGO_ADS_CRASH_REPORTS, 1_324);
    assert.equal(frontier.bindings.empirical.sourceProfileHashes.length, 6);
    assert.equal(frontier.sourceReplay.empiricalSixSourceLedgerReplayed, true);
    assert.equal(Object.hasOwn(frontier.sourceReplay,
      "empiricalFiveSourceLedgerReplayed"), false);
    const structural = verifyStage2QuoteFrontierStructure(frontier);
    assert.equal(structural.sourceReverified, false);
    assert.equal(structural.bindingHashes.evidenceSetHash,
      frontier.bindings.evidenceSetHash);
    assert.equal(frontier.preAction.admittedValues.length, 0);
    assert.ok(frontier.preAction.missingMask.length > 0);
    assert.equal(frontier.preAction.decision,
      "ABSTAIN_NO_SOURCE_REPLAYED_PROSPECTIVE_FACTOR_RECEIPT");
    assert.equal(frontier.modelPipeline.frequency.localClosedExposureWindows, 2);
    assert.equal(frontier.modelPipeline.frequency.localZeroLossWindowsIncluded, 1);
    assert.equal(frontier.modelPipeline.severity.localAdjudicatedMonetarySamples, 1);
    assert.equal(frontier.modelPipeline.frequency.externallyGovernedCompleteWindows, 0);
    assert.equal(frontier.modelPipeline.driftAndHoldout.externalHoldoutPresent, false);
    assert.deepEqual(frontier.modelPipeline.outputs, {
      frequencyEstimate: null, severityEstimate: null, premium: null,
      capital: null, price: null, coverage: null,
    });
    assert.equal(frontier.quoteBoundary.decision, "NON_BINDING_ABSTAIN");
    assert.equal(frontier.authority.permitsPrice, false);
  });

test("post-outcome leakage and missing-mask removal fail even after outer resealing",
  { skip: !hasEmpiricalSources }, (t) => {
    const { frontier } = fullFixture(t);
    const forged = structuredClone(frontier);
    const forbidden = forged.factorPolicy.factors.find((factor) => factor.outcomeDerived);
    forged.preAction.admittedValues.push({
      factorId: forbidden.factorId,
      value: 1,
      observedAt: at(11),
      proposedActionAt: at(10),
      evidenceHash: h("label-leak"),
    });
    forged.preAction.missingMask = [];
    const checked = verifyStage2QuoteFrontierStructure(resealFrontier(forged));
    assert.equal(checked.ok, false);
    assert.match(checked.error, /PRE_ACTION_BOUNDARY/);
  });

test("fake denominator, loss, holdout, and authority cannot be promoted by resealing",
  { skip: !hasEmpiricalSources }, (t) => {
    const { frontier } = fullFixture(t);
    const forged = structuredClone(frontier);
    forged.modelPipeline.frequency.externallyGovernedCompleteWindows = 1_000;
    forged.modelPipeline.frequency.externallyGovernedZeroLossWindows = 900;
    forged.modelPipeline.frequency.completeDenominatorEstablished = true;
    forged.modelPipeline.frequency.posteriorComputed = true;
    forged.modelPipeline.frequency.estimate = 0.1;
    forged.modelPipeline.severity.externallyGovernedAdjudicatedMonetarySamples = 100;
    forged.modelPipeline.severity.severityDistributionComputed = true;
    forged.modelPipeline.severity.estimate = 1_000;
    forged.modelPipeline.driftAndHoldout.externalHoldoutPresent = true;
    forged.modelPipeline.outputs.premium = 100;
    forged.authority.permitsPrice = true;
    const checked = verifyStage2QuoteFrontierStructure(resealFrontier(forged));
    assert.equal(checked.ok, false);
    assert.equal(checked.price, null);
    assert.equal(checked.capital, null);
  });

test("a coherent hash reseal, correlation omission, or currency/unit rewrite fails full replay",
  { skip: !hasEmpiricalSources }, (t) => {
    const { sources, frontier } = fullFixture(t);

    const hashSwap = structuredClone(frontier);
    const oldLedgerHash = hashSwap.bindings.empirical.ledgerHash;
    const newLedgerHash = h("self-resealed-ledger");
    hashSwap.bindings.empirical.ledgerHash = newLedgerHash;
    hashSwap.bindings.evidenceHashes = hashSwap.bindings.evidenceHashes
      .map((value) => value === oldLedgerHash ? newLedgerHash : value).sort();
    hashSwap.bindings.evidenceSetHash = domainDigest(
      "outsider/stage2-evidence-set/v1", hashSwap.bindings.evidenceHashes,
    );
    const hashResealed = resealFrontier(hashSwap);
    assert.equal(verifyStage2QuoteFrontierStructure(hashResealed).ok, true);
    assert.equal(verifyStage2QuoteFrontier(hashResealed, sources).ok, false);

    const correlation = structuredClone(frontier);
    correlation.modelPipeline.dependence.connectedComponentCount = 0;
    correlation.modelPipeline.dependence.structuralIndependentUpperBound = 0;
    const correlationResealed = resealFrontier(correlation);
    assert.equal(verifyStage2QuoteFrontierStructure(correlationResealed).ok, true);
    assert.equal(verifyStage2QuoteFrontier(correlationResealed, sources).ok, false);

    const domain = structuredClone(frontier);
    const priorModelDomainHash = domain.bindings.model.modelDomainHash;
    domain.modelPipeline.modelCellDomains[0].reportingCurrency = "EUR";
    domain.modelPipeline.modelCellDomains[0].exposureUnit = "ACTION";
    domain.modelPipeline.domainCompatibility.currencies = ["EUR"];
    domain.modelPipeline.domainCompatibility.exposureUnits = ["ACTION"];
    const newModelDomainHash = domainDigest("outsider/stage2-model-domain/v1", {
      validityDomainHash: domain.validityDomain.validityDomainHash,
      factorPolicyHash: domain.factorPolicy.policyHash,
      modelCellDomains: domain.modelPipeline.modelCellDomains,
    });
    domain.bindings.model.modelDomainHash = newModelDomainHash;
    domain.bindings.evidenceHashes = domain.bindings.evidenceHashes
      .map((value) => value === priorModelDomainHash ? newModelDomainHash : value).sort();
    domain.bindings.evidenceSetHash = domainDigest(
      "outsider/stage2-evidence-set/v1", domain.bindings.evidenceHashes,
    );
    const domainResealed = resealFrontier(domain);
    assert.equal(verifyStage2QuoteFrontierStructure(domainResealed).ok, true);
    assert.equal(verifyStage2QuoteFrontier(domainResealed, sources).ok, false);
  });

test("quote candidate binds Claim/Way/World, registry, Reality, model, rights and evidence",
  { skip: !hasEmpiricalSources }, (t) => {
    const { sources, frontier } = fullFixture(t);
    const candidate = buildStage2QuoteCandidate({
      frontier, sources, requestedAt: at(21), validFrom: at(22), validUntil: at(30),
      priorCandidates: [],
    });
    const checked = verifyStage2QuoteCandidate(candidate,
      { frontier, sources, priorCandidates: [] });
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.verificationLevel, "FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED");
    assert.equal(checked.sourceReverified, true);
    assert.equal(checked.bindingHashes.candidateHash, candidate.candidateHash);
    assert.equal(checked.bindingHashes.quoteIdentityHash, candidate.quoteIdentityHash);
    assert.equal(verifyStage2QuoteCandidateStructure(candidate).sourceReverified, false);
    assert.equal(candidate.identity.claimHash, frontier.bindings.reality.claimHash);
    assert.equal(candidate.identity.wayHash, frontier.bindings.reality.wayHash);
    assert.equal(candidate.identity.worldHash, frontier.bindings.reality.worldHash);
    assert.equal(candidate.identity.registryHash, frontier.bindings.registry.registryHash);
    assert.equal(candidate.identity.realityEnvelopeHash,
      frontier.bindings.reality.envelopeHash);
    assert.equal(candidate.identity.rightsReferenceHash,
      frontier.bindings.rights.declaredExperienceRightsReferenceHash);
    assert.equal(candidate.decision.status, "NON_BINDING_ABSTAIN");
    assert.ok(Object.values(candidate.financialOutputs).every((value) => value === null));
    assert.ok(Object.values(candidate.permissions).every((value) => value === false));
  });

test("quote replay, unknown fields, and authority promotion are rejected",
  { skip: !hasEmpiricalSources }, (t) => {
    const { sources, frontier } = fullFixture(t);
    const candidate = buildStage2QuoteCandidate({
      frontier, sources, requestedAt: at(21), validFrom: at(22), validUntil: at(30),
      priorCandidates: [],
    });
    assert.throws(() => buildStage2QuoteCandidate({
      frontier, sources, requestedAt: at(31), validFrom: at(32), validUntil: at(40),
      priorCandidates: [candidate],
    }), /STAGE2_QUOTE_REPLAY/);
    assert.throws(() => buildStage2QuoteCandidate({
      frontier, sources, requestedAt: at(21), validFrom: at(22), validUntil: at(30),
      priorCandidates: [], price: 100,
    }), /STAGE2_QUOTE_INPUT_SCHEMA_INVALID/);
    assert.throws(() => buildStage2QuoteFrontier({
      createdAt: at(20), sources, FULL_SOURCE: true,
    }), /STAGE2_FRONTIER_INPUT_SCHEMA_INVALID/);
    assert.throws(() => buildStage2QuoteFrontier({
      createdAt: at(20),
      sources: { ...sources,
        realitySources: { ...sources.realitySources, trusted: true } },
    }), /STAGE2_REALITY_SOURCE_SET_SCHEMA_INVALID/);
    assert.throws(() => buildStage2QuoteFrontier({
      createdAt: at(20),
      sources: { ...sources,
        empiricalSourceOptions: { ...sources.empiricalSourceOptions,
          FULL_SOURCE: true } },
    }), /STAGE2_EMPIRICAL_SOURCE_SET_SCHEMA_INVALID/);

    const legacyReceipt = structuredClone(frontier);
    delete legacyReceipt.sourceReplay.empiricalSixSourceLedgerReplayed;
    legacyReceipt.sourceReplay.empiricalFiveSourceLedgerReplayed = true;
    assert.match(verifyStage2QuoteFrontierStructure(
      resealFrontier(legacyReceipt)).error,
    /STAGE2_SOURCE_REPLAY_RECEIPT_INVALID/);

    const mixedReceipt = structuredClone(frontier);
    mixedReceipt.sourceReplay.empiricalFiveSourceLedgerReplayed = true;
    assert.match(verifyStage2QuoteFrontierStructure(
      resealFrontier(mixedReceipt)).error,
    /STAGE2_SOURCE_REPLAY_RECEIPT_INVALID/);
    const missingNhtsa = structuredClone(sources.empiricalSourceOptions);
    delete missingNhtsa.nhtsaCsvPath;
    assert.throws(() => buildStage2QuoteFrontier({
      createdAt: at(20),
      sources: { ...sources, empiricalSourceOptions: missingNhtsa },
    }), /STAGE2_EMPIRICAL_SOURCE_SET_SCHEMA_INVALID/);
    assert.throws(() => buildStage2QuoteCandidate({
      frontier, sources, requestedAt: at(21), validFrom: at(22), validUntil: at(101),
      priorCandidates: [],
    }), /STAGE2_QUOTE_OUTSIDE_FRONTIER_VALIDITY_DOMAIN/);

    const unknown = structuredClone(candidate);
    unknown.trusted = true;
    assert.match(verifyStage2QuoteCandidateStructure(resealQuote(unknown)).error,
      /QUOTE_SCHEMA_INVALID/);

    const promoted = structuredClone(candidate);
    promoted.financialOutputs.price = 1;
    promoted.financialOutputs.currency = "USD";
    promoted.permissions.PRICE = true;
    promoted.authority.permitsPrice = true;
    const checked = verifyStage2QuoteCandidateStructure(resealQuote(promoted),
      { frontier, priorCandidates: [] });
    assert.equal(checked.ok, false);
    assert.equal(checked.price, null);
    assert.equal(checked.permitsCoverage, false);
    assert.equal(checked.permitsGuarantee, false);
      assert.equal(checked.permitsSettlement, false);
  });

test("offline CLI builds, fully replays, quotes, and fully replays the quote",
  { skip: !hasEmpiricalSources, timeout: 60_000 }, (t) => {
    const { sources, frontier, reality, loss } = fullFixture(t);
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-stage2-cli-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const put = (name, value) => {
      const file = path.join(directory, name);
      writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
      return name;
    };

    const episodeFile = put("curate-episode.json", reality.sources.curateSource.episode);
    const clearanceFile = put("curate-clearance.json",
      reality.sources.curateSource.clearance);
    const checkpointFile = put("curate-checkpoint.json",
      reality.sources.curateSource.checkpoint);
    const proofFile = put("curate-proof.json",
      reality.sources.curateSource.inclusionProof);
    const realitySpec = {
      schema: "outsider/reality-source-bound-input-spec/v1",
      boundaryFile: put("reality-boundary.json", reality.sources.boundary),
      claimFile: put("reality-claim.json", reality.sources.claim),
      assessmentFile: put("reality-assessment.json", reality.sources.assessment),
      priorCommitmentEntries: [],
      currentCommitmentFile: put("reality-current-commitment.json",
        reality.sources.currentCommitment),
      executionFile: put("reality-execution.json", reality.sources.execution),
      curateIntentFile: put("reality-curate-intent.json", reality.sources.curateIntent),
      curateSource: {
        episodeFile,
        historyFiles: [],
        clearanceFile,
        checkpointFile,
        checkpointClearanceFiles: [clearanceFile],
        inclusionProofFile: proofFile,
      },
      stage05: {
        runDirectory: reality.sources.stage05Source.runDirectory,
        attestationFile: put("stage05-attestation.json",
          reality.sources.stage05Source.attestation),
      },
      createdAt: reality.envelope.createdAt,
    };
    put("reality-source-spec.json", realitySpec);
    put("reality-envelope.json", reality.envelope);
    put("empirical-ledger.json", empiricalLedger);
    put("loss-book.json", loss.book);
    put("loss-quarantine.json", loss.sources.quarantine);
    put("loss-trust-store.json", loss.sources.trustStore);
    const adjudicationFiles = loss.sources.adjudications.map((value, index) =>
      put(`loss-adjudication-${index}.json`, value));
    const spec = {
      schema: "outsider/stage2-model-quote-input-spec/v1",
      createdAt: frontier.createdAt,
      reality: {
        envelopeFile: "reality-envelope.json",
        sourceSpecFile: "reality-source-spec.json",
      },
      empirical: {
        ledgerFile: "empirical-ledger.json",
        wave3SourceDirectory: empiricalPaths.wave3SourceDirectory,
        wave4SourceDirectory: empiricalPaths.wave4SourceDirectory,
        botFailsSourceDirectory: empiricalPaths.botFailsSourceDirectory,
        ur5SourceDirectory: empiricalPaths.ur5SourceDirectory,
        droidArtifactDirectory: empiricalPaths.droidArtifactDirectory,
        droidSourceDirectory: empiricalPaths.droidSourceDirectory,
        nhtsaRegistryDirectory: empiricalPaths.nhtsaRegistryDirectory,
        nhtsaCsvPath: empiricalPaths.nhtsaCsvPath,
        nhtsaDataDictionaryPath: empiricalPaths.nhtsaDataDictionaryPath,
        nhtsaReplayAt: "2026-09-02T14:20:08.000Z",
      },
      lossExposure: {
        bookFile: "loss-book.json",
        quarantineFile: "loss-quarantine.json",
        quarantineLineageFiles: [],
        adjudicationFiles,
        trustStoreFile: "loss-trust-store.json",
        now: loss.sources.now,
      },
      quote: {
        requestedAt: at(21),
        validFrom: at(22),
        validUntil: at(30),
        priorCandidateFiles: [],
      },
    };
    const specFile = path.join(directory, "stage2-spec.json");
    writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);
    const frontierFile = path.join(directory, "frontier.json");
    const quoteFile = path.join(directory, "quote.json");
    const script = path.join(root, "scripts/stage2-quote-frontier.mjs");

    const built = spawnSync(process.execPath,
      [script, "build", "--spec", specFile, "--out", frontierFile],
      { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(built.status, 0, built.stderr);
    const builtFrontier = JSON.parse(readFileSync(frontierFile, "utf8"));
    assert.equal(builtFrontier.frontierHash, frontier.frontierHash);
    assert.equal(builtFrontier.sourceReplay.empiricalSixSourceLedgerReplayed, true);
    assert.equal(Object.hasOwn(builtFrontier.sourceReplay,
      "empiricalFiveSourceLedgerReplayed"), false);

    const verified = spawnSync(process.execPath,
      [script, "verify", "--spec", specFile, "--frontier", frontierFile],
      { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).verificationLevel,
      "FULL_ATTEST_CURATE_REALITY_EMPIRICAL_LOSS_SOURCES_REPLAYED");

    const quoted = spawnSync(process.execPath,
      [script, "quote", "--spec", specFile, "--frontier", frontierFile,
        "--out", quoteFile],
      { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(quoted.status, 0, quoted.stderr);
    assert.equal(JSON.parse(readFileSync(quoteFile, "utf8")).decision.status,
      "NON_BINDING_ABSTAIN");

    const quoteVerified = spawnSync(process.execPath,
      [script, "verify-quote", "--spec", specFile, "--frontier", frontierFile,
        "--quote", quoteFile],
      { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(quoteVerified.status, 0, quoteVerified.stderr);
    assert.equal(JSON.parse(quoteVerified.stdout).verificationLevel,
      "FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED");

    assert.equal(sources.empiricalLedger.ledgerHash, empiricalLedger.ledgerHash);
  });
