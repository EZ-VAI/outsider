import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCurateCheckpoint,
  clearCurateEpisode,
  createCurateInclusionProof,
  CURATE_SCHEMAS,
  normalizeCurateEpisode,
} from "../src/outsider-curate-core.js";
import { buildEmpiricalFactorLedger } from "../src/outsider-empirical-factor-ledger.js";
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
import { createReadinessGapLedger } from "../src/outsider-readiness-gap-ledger.js";
import {
  buildStage2QuoteCandidate,
  buildStage2QuoteFrontier,
  STAGE2_QUOTE_FRONTIER_SCHEMAS,
} from "../src/outsider-stage2-quote-frontier.js";
import {
  buildStage34AuthorityFrontier,
  buildStage4SettlementInstructionCandidate,
  STAGE34_AUTHORITY_FRONTIER_SCHEMAS,
  verifyStage34AuthorityFrontier,
  verifyStage34AuthorityFrontierStructure,
  verifyStage4SettlementInstructionCandidate,
} from "../src/outsider-stage34-authority-frontier.js";
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

function seal(domain, record, hashField) {
  const next = structuredClone(record);
  delete next[hashField];
  return { ...next, [hashField]: `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(next)}`).digest("hex")}` };
}

function curateEpisodeInput() {
  return {
    schema: CURATE_SCHEMAS.episodeInput,
    source: {
      datasetId: "stage34-frontier-test",
      datasetVersion: "2026.08",
      datasetManifestHash: h("dataset-manifest"),
      sourceObjectHash: h("source-object"),
      licenseId: "CC-BY-4.0",
      attributionHash: h("attribution"),
    },
    instrument: {
      extractorId: "stage34-frontier-test",
      extractorVersion: "1.0.0",
      extractorImplementationHash: h("extractor"),
      featureSchemaHash: h("feature-schema"),
    },
    episodeIdHash: h("episode"),
    platformClass: "test-robot",
    steps: [0, 1].map((index) => ({
      index,
      tOffsetMs: index * 10,
      boundary: { isFirst: index === 0, isLast: index === 1,
        isTerminal: index === 1 },
      observation: {
        commitment: h(`observation-${index}`),
        features: { "joint.position.0": index + 1 },
        images: [],
      },
      action: { kind: "joint-delta", features: { "joint.0": (index + 1) / 10 } },
      outcome: index === 1 ? { kind: "terminal", features: { success: 1 } } : null,
    })),
  };
}

function curateSource() {
  const episode = normalizeCurateEpisode(curateEpisodeInput());
  const history = [];
  const clearance = clearCurateEpisode(episode, { history });
  const checkpointClearances = [clearance];
  const checkpoint = buildCurateCheckpoint(checkpointClearances,
    { checkpointId: "stage34-frontier" });
  const inclusionProof = createCurateInclusionProof(
    checkpointClearances, clearance.clearanceHash, checkpoint);
  return { episode, history, clearance, checkpoint, checkpointClearances, inclusionProof };
}

function realityFixture() {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "outsider-stage34-frontier-"));
  const workspace = path.join(temporaryRoot, "workspace");
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, "result.txt"), "bounded result\n");

  const curate = curateSource();
  const curateIntent = createRealityCurateEvidenceIntent({ curateSource: curate });
  const partyA = h("affected-party-a");
  const partyB = h("affected-party-b");
  const boundary = createRealityBoundary({
    boundaryId: "stage34-frontier-world",
    worldHash: h("world"),
    policyHash: h("policy"),
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
    ...sources,
    createdAt: at(10.5),
  });
  return { temporaryRoot, sources, envelope };
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

function adjudicate(entry, environment) {
  const source = entry.observationEnvelope.payload;
  const reviewedAt = new Date(Date.parse(source.observedAt) + 3_600_000).toISOString();
  const adjudicatedAt = new Date(Date.parse(source.observedAt) + 7_200_000).toISOString();
  const bound = commitments(source);
  const fraudReview = signLossExposureFraudReview({
    quarantineEntryHash: entry.entryHash,
    sourceObservationHash: entry.sourceObservationHash,
    ...bound,
    policyHash: source.policyHash,
    reviewerDomainRootHash: environment.reviewer.domainRootHash,
    reviewerControlRootHash: environment.reviewer.controlRootHash,
    completedAt: reviewedAt,
    status: "CLEAR",
    evidenceHashes: [h(`fraud-review:${entry.entryHash}`)],
  }, { privateKeyPem: environment.reviewer.privateKeyPem });
  return signLossExposureAdjudication({
    quarantineEntryHash: entry.entryHash,
    sourceObservationHash: entry.sourceObservationHash,
    ...bound,
    policyHash: source.policyHash,
    adjudicatorDomainRootHash: environment.adjudicator.domainRootHash,
    adjudicatorControlRootHash: environment.adjudicator.controlRootHash,
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
  }, { privateKeyPem: environment.adjudicator.privateKeyPem, fraudReview });
}

function lossFixture() {
  const environment = lossEnvironment();
  const observations = [
    signLossExposureObservation(lossObservationPayload(environment.operator, "zero"),
      { privateKeyPem: environment.operator.privateKeyPem }),
    signLossExposureObservation(lossObservationPayload(environment.operator, "loss",
      { loss: true }), { privateKeyPem: environment.operator.privateKeyPem }),
  ];
  const quarantine = buildLossExposureQuarantine(observations,
    { trustStore: environment.trustStore, createdAt: LOSS_AT });
  const adjudications = quarantine.entries.map((entry) => adjudicate(entry, environment));
  const book = buildLossExposureShadowBook({
    quarantine, adjudications, trustStore: environment.trustStore, generatedAt: LOSS_AT,
  });
  return {
    book,
    sources: {
      quarantine,
      quarantineLineage: [],
      adjudications,
      trustStore: environment.trustStore,
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

function stage2Fixture(reality) {
  if (!Object.values(empiricalPaths).every(existsSync)) {
    throw new Error("STAGE34_TEST_EMPIRICAL_SOURCES_MISSING");
  }
  const empiricalOptions = {
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
  const empiricalLedger = buildEmpiricalFactorLedger(empiricalOptions);
  const loss = lossFixture();
  const sources = {
    realityEnvelope: reality.envelope,
    realitySources: reality.sources,
    empiricalLedger,
    empiricalSourceOptions: empiricalOptions,
    lossExposureBook: loss.book,
    lossExposureSources: loss.sources,
  };
  const frontier = buildStage2QuoteFrontier({ createdAt: at(20), sources });
  const priorQuoteCandidates = [];
  const quoteCandidate = buildStage2QuoteCandidate({
    frontier,
    sources,
    requestedAt: at(21),
    validFrom: at(22),
    validUntil: at(30),
    priorCandidates: priorQuoteCandidates,
  });
  return { sources, frontier, quoteCandidate, priorQuoteCandidates, loss };
}

let shared;

test.before(async () => {
  const reality = realityFixture();
  const stage2 = stage2Fixture(reality);
  const ledger = createReadinessGapLedger({
    externalSubmissions: [{
      schema: "outsider/readiness-external-submission/v1",
      gapId: "S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY",
      artifactHash: h("unverified-issuer-package"),
      sourceKind: "issuer-package",
      submittedAt: at(0),
    }],
  });
  const frontier = await buildStage34AuthorityFrontier({
    readinessLedger: ledger,
    stage2Frontier: stage2.frontier,
    stage2QuoteCandidate: stage2.quoteCandidate,
    stage2Sources: stage2.sources,
    stage2PriorQuoteCandidates: stage2.priorQuoteCandidates,
    createdAt: at(31),
  });
  const candidate = buildStage4SettlementInstructionCandidate({
    frontier,
    readinessLedger: ledger,
    priorCandidates: [],
    createdAt: at(32),
  });
  shared = { reality, stage2, ledger, frontier, candidate };
});

test.after(() => {
  if (shared?.reality?.temporaryRoot) {
    rmSync(shared.reality.temporaryRoot, { recursive: true, force: true });
  }
});

test("the current Stage 2 and Reality sources stop at a permanent zero-authority frontier",
  async () => {
    const { frontier, ledger, stage2 } = shared;
    assert.equal(stage2.frontier.sourceReplay.empiricalSixSourceLedgerReplayed, true);
    assert.equal(Object.hasOwn(stage2.frontier.sourceReplay,
      "empiricalFiveSourceLedgerReplayed"), false);
    assert.equal(frontier.bindings.stage2.sourceReverifiedDuringBuild, true);
    assert.equal(frontier.bindings.stage2.quoteDecision, "NON_BINDING_ABSTAIN");
    assert.equal(frontier.bindings.stage2.frontierHash, stage2.frontier.frontierHash);
    assert.equal(frontier.bindings.stage2.quoteCandidateHash,
      stage2.quoteCandidate.candidateHash);
    assert.equal(frontier.bindings.stage2.claimHash,
      stage2.quoteCandidate.identity.claimHash);
    assert.equal(frontier.bindings.stage2.registryHash,
      stage2.quoteCandidate.identity.registryHash);
    assert.equal(frontier.bindings.stage2.modelDomainHash,
      stage2.quoteCandidate.identity.modelDomainHash);
    assert.equal(frontier.bindings.stage2.factorPolicyHash,
      stage2.quoteCandidate.identity.factorPolicyHash);
    assert.equal(frontier.bindings.stage2.validityDomainHash,
      stage2.quoteCandidate.identity.validityDomainHash);
    assert.equal(frontier.bindings.stage2.rightsReferenceHash,
      stage2.quoteCandidate.identity.rightsReferenceHash);
    assert.equal(frontier.bindings.stage2.evidenceSetHash,
      stage2.quoteCandidate.identity.evidenceSetHash);
    assert.equal(frontier.bindings.reality.localProtocolSourcesReplayed, true);
    assert.equal(frontier.stage3.decision,
      "HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_CONTRACT_AND_EVIDENCE");
    assert.equal(frontier.stage3.authority.permitsGuarantee, false);
    assert.equal(frontier.stage4Boundary.authority.settlementInstructionEligible, false);
    assert.equal(frontier.registeredExternalSubmissions.length, 1);
    assert.equal(frontier.registeredExternalSubmissions[0].closureCredit, false);
    assert.equal(frontier.readiness.externalInstitutionAuthorityVerified, false);
    assert.ok(frontier.readiness.stage3MissingGapIds.includes(
      "S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY"));
    const structural = verifyStage34AuthorityFrontierStructure(frontier,
      { readinessLedger: ledger });
    assert.equal(structural.ok, true);
    assert.equal(structural.sourceArtifactsReverified, false);

    const full = await verifyStage34AuthorityFrontier(frontier, {
      readinessLedger: ledger,
      stage2Frontier: stage2.frontier,
      stage2QuoteCandidate: stage2.quoteCandidate,
      stage2Sources: stage2.sources,
      stage2PriorQuoteCandidates: stage2.priorQuoteCandidates,
    });
    assert.equal(full.ok, true);
    assert.equal(full.verificationLevel,
      "FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED");
    assert.equal(full.externalInstitutionAuthorityVerified, false);
    assert.equal(full.bindingGuarantee, false);
  });

test("the stale factor-only Stage 2 seam is no longer an accepted input", async () => {
  const { ledger, reality } = shared;
  await assert.rejects(buildStage34AuthorityFrontier({
    readinessLedger: ledger,
    factorPredictiveReport: { reportHash: h("old-factor-report") },
    factorSourceOptions: {},
    realityEnvelope: reality.envelope,
    realitySources: reality.sources,
    createdAt: at(31),
  }), /STAGE34_FRONTIER_INPUT_SCHEMA_INVALID/);
});

test("a re-sealed quote identity cannot replace the exact Stage 2 quote", async () => {
  const { ledger, stage2 } = shared;
  const forged = structuredClone(stage2.quoteCandidate);
  forged.identity.modelDomainHash = h("self-resealed-model-domain");
  forged.bindings.model.modelDomainHash = forged.identity.modelDomainHash;
  forged.quoteIdentityHash = `sha256:${createHash("sha256")
    .update(`outsider/stage2-quote-identity/v1\0${canonicalizeStrict(forged.identity)}`)
    .digest("hex")}`;
  const resealed = seal(STAGE2_QUOTE_FRONTIER_SCHEMAS.quoteCandidate,
    forged, "candidateHash");
  await assert.rejects(buildStage34AuthorityFrontier({
    readinessLedger: ledger,
    stage2Frontier: stage2.frontier,
    stage2QuoteCandidate: resealed,
    stage2Sources: stage2.sources,
    stage2PriorQuoteCandidates: stage2.priorQuoteCandidates,
    createdAt: at(31),
  }), /STAGE34_STAGE2_QUOTE_SOURCE_REPLAY_FAILED/);
});

test("a Stage 2 source mismatch fails before Stage 3 receives a reference", async () => {
  const { ledger, stage2 } = shared;
  const mismatchedSources = {
    ...stage2.sources,
    realityEnvelope: {
      ...stage2.sources.realityEnvelope,
      envelopeHash: h("different-reality-source"),
    },
  };
  await assert.rejects(buildStage34AuthorityFrontier({
    readinessLedger: ledger,
    stage2Frontier: stage2.frontier,
    stage2QuoteCandidate: stage2.quoteCandidate,
    stage2Sources: mismatchedSources,
    stage2PriorQuoteCandidates: stage2.priorQuoteCandidates,
    createdAt: at(31),
  }), /STAGE34_STAGE2_FRONTIER_SOURCE_REPLAY_FAILED/);
});

test("a re-sealed fake PRICE never reaches the Stage 3 authority frontier", async () => {
  const { ledger, stage2 } = shared;
  const forged = structuredClone(stage2.quoteCandidate);
  forged.financialOutputs.price = 100;
  forged.financialOutputs.currency = "USD";
  forged.permissions.PRICE = true;
  forged.permissions.COVERAGE = true;
  forged.authority.permitsPrice = true;
  forged.authority.permitsCoverage = true;
  const resealed = seal(STAGE2_QUOTE_FRONTIER_SCHEMAS.quoteCandidate,
    forged, "candidateHash");
  await assert.rejects(buildStage34AuthorityFrontier({
    readinessLedger: ledger,
    stage2Frontier: stage2.frontier,
    stage2QuoteCandidate: resealed,
    stage2Sources: stage2.sources,
    stage2PriorQuoteCandidates: stage2.priorQuoteCandidates,
    createdAt: at(31),
  }), /STAGE34_STAGE2_QUOTE_SOURCE_REPLAY_FAILED/);
});

test("resealing cannot promote Stage 3, remove gaps, or credit external submissions", () => {
  const { frontier, ledger } = shared;
  const forged = structuredClone(frontier);
  forged.stage3.authority.permitsGuarantee = true;
  forged.readiness.stage3MissingGapIds = [];
  forged.registeredExternalSubmissions[0].closureCredit = true;
  const resealed = seal(STAGE34_AUTHORITY_FRONTIER_SCHEMAS.frontier,
    forged, "frontierHash");
  const checked = verifyStage34AuthorityFrontierStructure(resealed,
    { readinessLedger: ledger });
  assert.equal(checked.ok, false);
  assert.equal(checked.bindingGuarantee, false);
  assert.equal(checked.movesFunds, false);
});

test("the local claim prefix refuses a repeated claim identity", () => {
  const { frontier, ledger, candidate } = shared;
  assert.throws(() => buildStage4SettlementInstructionCandidate({
    frontier,
    readinessLedger: ledger,
    priorCandidates: [candidate],
    createdAt: at(13),
  }), /STAGE4_DUPLICATE_CLAIM_IDENTITY/);
});

test("reserve and custody cannot be caller-asserted or restored by resealing", () => {
  const { frontier, ledger, candidate } = shared;
  assert.throws(() => buildStage4SettlementInstructionCandidate({
    frontier,
    readinessLedger: ledger,
    priorCandidates: [],
    createdAt: at(13),
    reserve: { amount: 1_000_000, currency: "USD", custody: true },
  }), /STAGE4_CANDIDATE_INPUT_SCHEMA_INVALID/);

  const forged = structuredClone(candidate);
  forged.reserve.amount = 1_000_000;
  forged.reserve.currency = "USD";
  forged.reserve.aggregateLimitChecked = true;
  forged.reserve.atomicallyReserved = true;
  forged.reserve.authorizedCustodianVerified = true;
  forged.reserve.custodianAcknowledgementHash = h("self-signed-custody");
  const resealed = seal(STAGE34_AUTHORITY_FRONTIER_SCHEMAS.settlementCandidate,
    forged, "candidateHash");
  const checked = verifyStage4SettlementInstructionCandidate(resealed,
    { frontier, readinessLedger: ledger, priorCandidates: [] });
  assert.equal(checked.ok, false);
  assert.equal(checked.settlementInstructionEligible, false);
  assert.equal(checked.movesFunds, false);
});

test("void, payment, recovery, restoration, and closure remain separate states", () => {
  const { frontier, ledger, candidate } = shared;
  assert.equal(candidate.coverage.status, "NOT_ESTABLISHED");
  assert.equal(candidate.financialPayment.status, "NOT_AUTHORIZED");
  assert.equal(candidate.technicalRecovery.status, "OPEN_UNVERIFIED");
  assert.equal(candidate.worldRestoration.status, "NOT_ESTABLISHED");
  assert.equal(candidate.obligationClosure.status, "OPEN");
  assert.equal(candidate.obligationClosure.recoveryNonWaivable, true);
  assert.equal(candidate.obligationClosure.survivesCoverageVoidOrDietBreach, true);

  const forged = structuredClone(candidate);
  forged.coverage.status = "VOID";
  forged.financialPayment.status = "PAID";
  forged.financialPayment.executed = true;
  forged.technicalRecovery.status = "ERASED_BY_VOID";
  forged.technicalRecovery.complete = true;
  forged.worldRestoration.status = "RESTORED_BY_PAYMENT";
  forged.worldRestoration.restored = true;
  forged.obligationClosure.status = "CLOSED";
  forged.obligationClosure.obligationOpen = false;
  forged.obligationClosure.closureAuthorized = true;
  forged.obligationClosure.recoveryNonWaivable = false;
  const resealed = seal(STAGE34_AUTHORITY_FRONTIER_SCHEMAS.settlementCandidate,
    forged, "candidateHash");
  const checked = verifyStage4SettlementInstructionCandidate(resealed,
    { frontier, readinessLedger: ledger, priorCandidates: [] });
  assert.equal(checked.ok, false);
  assert.equal(checked.movesFunds, false);
  assert.equal(checked.closesObligation, false);
});

test("a valid settlement candidate is still only a held reference", () => {
  const { frontier, ledger, candidate } = shared;
  const checked = verifyStage4SettlementInstructionCandidate(candidate,
    { frontier, readinessLedger: ledger, priorCandidates: [] });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel,
    "FRONTIER_LEDGER_AND_LOCAL_PREFIX_REPLAYED");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.settlementInstructionEligible, false);
  assert.equal(checked.movesFunds, false);
  assert.equal(checked.closesObligation, false);
  assert.equal(checked.obligationOpen, true);
  assert.equal(checked.reopenable, true);
});
