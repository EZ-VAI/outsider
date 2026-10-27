import { createHash, generateKeyPairSync } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCurateCheckpoint,
  clearCurateEpisode,
  createCurateInclusionProof,
  CURATE_SCHEMAS,
  normalizeCurateEpisode,
} from "../../src/outsider-curate-core.js";
import { buildEmpiricalFactorLedger } from "../../src/outsider-empirical-factor-ledger.js";
import {
  buildLossExposureQuarantine,
  buildLossExposureShadowBook,
} from "../../src/outsider-loss-exposure-evidence.js";
import {
  createRealityCurateEvidenceIntent,
  createSourceBoundRealityAdvisoryEnvelope,
} from "../../src/outsider-reality-stewardship-integration.js";
import {
  assessRealityStewardship,
  createRealityBoundary,
  createRealityBudgetCommitment,
  createRealityExecutionReceipt,
  createStewardshipClaim,
} from "../../src/outsider-reality-stewardship.js";
import { createReadinessGapLedger } from "../../src/outsider-readiness-gap-ledger.js";
import {
  buildStage2QuoteCandidate,
  buildStage2QuoteFrontier,
} from "../../src/outsider-stage2-quote-frontier.js";
import { buildStage34AuthorityFrontier } from "../../src/outsider-stage34-authority-frontier.js";
import {
  createAttestationV2,
  createStage05ControlledWayBinding,
  finalizeStage05Evidence,
} from "../../src/outsider-stage05-evidence.js";
import { RunStore, snapshotWorkspace } from "../../src/outsider-kernel-store.js";
import { freezeContract } from "../../src/outsider-work-contract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const fixtureHash = (value) => `sha256:${createHash("sha256")
  .update(String(value)).digest("hex")}`;
export const fixtureTime = (seconds) => new Date(
  Date.parse("2026-08-21T00:00:00.000Z") + seconds * 1_000,
).toISOString();

function curateSource() {
  const episode = normalizeCurateEpisode({
    schema: CURATE_SCHEMAS.episodeInput,
    source: {
      datasetId: "stage3-gate-test",
      datasetVersion: "2026.08",
      datasetManifestHash: fixtureHash("dataset-manifest"),
      sourceObjectHash: fixtureHash("source-object"),
      licenseId: "CC-BY-4.0",
      attributionHash: fixtureHash("attribution"),
    },
    instrument: {
      extractorId: "stage3-gate-test",
      extractorVersion: "1.0.0",
      extractorImplementationHash: fixtureHash("extractor"),
      featureSchemaHash: fixtureHash("feature-schema"),
    },
    episodeIdHash: fixtureHash("episode"),
    platformClass: "test-robot",
    steps: [0, 1].map((index) => ({
      index,
      tOffsetMs: index * 10,
      boundary: { isFirst: index === 0, isLast: index === 1,
        isTerminal: index === 1 },
      observation: {
        commitment: fixtureHash(`observation-${index}`),
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
    { checkpointId: "stage3-gate" });
  const inclusionProof = createCurateInclusionProof(
    checkpointClearances, clearance.clearanceHash, checkpoint);
  return { episode, history, clearance, checkpoint, checkpointClearances, inclusionProof };
}

function realityFixture(temporaryRoot) {
  const workspace = path.join(temporaryRoot, "workspace");
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, "result.txt"), "bounded result\n");
  const curate = curateSource();
  const curateIntent = createRealityCurateEvidenceIntent({ curateSource: curate });
  const partyA = fixtureHash("affected-party-a");
  const partyB = fixtureHash("affected-party-b");
  const boundary = createRealityBoundary({
    boundaryId: "stage3-gate-world",
    worldHash: fixtureHash("world"),
    policyHash: fixtureHash("world-policy"),
    resourceOwnerRootHash: fixtureHash("resource-owner"),
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
    challengePolicyHash: fixtureHash("challenge-policy"),
    recoveryStandardHash: fixtureHash("recovery-standard"),
    validFrom: fixtureTime(0),
    validUntil: fixtureTime(120),
  });
  const provider = fixtureHash("provider");
  const claim = createStewardshipClaim({
    boundary,
    claimIdHash: fixtureHash("claim"),
    wayHash: fixtureHash("way"),
    claimantRootHash: fixtureHash("claimant"),
    standingEvidenceHashes: [fixtureHash("standing-reference")],
    purpose: "EXPERIENCE",
    operationHashes: [fixtureHash("operation"), curateIntent.intentHash],
    representedPartyRootHashes: [...boundary.affectedPartyRootHashes],
    requestedExternalities: [
      { channelId: "consent", amount: 0 },
      { channelId: "shared-load", amount: 3 },
    ],
    alternativesConsideredHashes: [fixtureHash("simulation-alternative")],
    whyRealityRequiredHash: fixtureHash("why-reality-required"),
    causalDesignHash: fixtureHash("causal-design"),
    experienceRightsHash: curateIntent.declaredExperienceRightsReferenceHash,
    optionPreservationEvidenceHashes: [fixtureHash("option-preservation")],
    recoveryPlanHash: fixtureHash("recovery-plan"),
    responsibilityRootHashes: [fixtureHash("principal"), provider],
    requestedAt: fixtureTime(1),
    expiresAt: fixtureTime(110),
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
    semanticAudit: { passed: true, evidenceHash: fixtureHash("semantic-audit") },
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
  store.append("contract_audited", { passed: true,
    evidenceHash: fixtureHash("semantic-audit") });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  store.append("worker_launch", { executable: "test-worker" });
  store.append("acceptance_finished", { phase: "final", ran: true,
    passed: true, exit: 0 });
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
    boundary, claim, priorCommitmentEntries: [], now: fixtureTime(2),
  });
  const currentCommitment = createRealityBudgetCommitment({
    boundary, claim,
    channelAmounts: claim.requestedExternalities,
    commitmentEvidenceHash: fixtureHash("local-budget-reservation"),
    committedAt: fixtureTime(3),
  });
  const execution = createRealityExecutionReceipt({
    boundary, claim,
    ownerGateReceiptHash: fixtureHash("opaque-owner-gate-reference"),
    executionEvidenceHash: evidence.publicEvidence.publicEvidenceHash,
    providerRootHash: provider,
    responsibilityRootHashes: claim.responsibilityRootHashes,
    executedAt: fixtureTime(10),
  });
  const sources = { boundary, claim, assessment, priorCommitmentEntries: [],
    currentCommitment, execution, curateIntent, curateSource: curate,
    stage05Source: { runDirectory: store.directory, attestation } };
  const envelope = createSourceBoundRealityAdvisoryEnvelope({
    ...sources, createdAt: fixtureTime(10.5),
  });
  return { sources, envelope };
}

function empiricalFixture() {
  const paths = {
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
  if (!Object.values(paths).every(existsSync)) {
    throw new Error("STAGE3_GATE_TEST_EMPIRICAL_SOURCES_MISSING");
  }
  const options = {
    wave3SourceDirectory: paths.wave3SourceDirectory,
    wave4SourceDirectory: paths.wave4SourceDirectory,
    botFailsSourceDirectory: paths.botFailsSourceDirectory,
    ur5SourceDirectory: paths.ur5SourceDirectory,
    droidArtifactDirectory: paths.droidArtifactDirectory,
    nhtsaRegistryDirectory: paths.nhtsaRegistryDirectory,
    nhtsaCsvPath: paths.nhtsaCsvPath,
    nhtsaDataDictionaryPath: paths.nhtsaDataDictionaryPath,
    nhtsaReplayAt: "2026-09-02T14:20:08.000Z",
    droidSource: {
      objectListBytes: readFileSync(path.join(paths.droidSourceDirectory,
        "gcs-objects.json")),
      datasetInfoBytes: readFileSync(path.join(paths.droidSourceDirectory,
        "dataset_info.json")),
      featureBytes: readFileSync(path.join(paths.droidSourceDirectory,
        "features.json")),
      shardBytes: readFileSync(path.join(paths.droidSourceDirectory,
        "r2d2_faceblur-train.tfrecord-00000-of-00031")),
    },
  };
  return { ledger: buildEmpiricalFactorLedger(options), options };
}

function lossFixture() {
  const trustStore = { operators: {}, adjudicators: {}, fraudReviewers: {} };
  const now = "2026-08-21T00:00:00.000Z";
  const quarantine = buildLossExposureQuarantine([], { trustStore, createdAt: now });
  const book = buildLossExposureShadowBook({ quarantine, adjudications: [],
    trustStore, generatedAt: now });
  return { book, sources: { quarantine, quarantineLineage: [], adjudications: [],
    trustStore, now } };
}

export async function buildStage3GateFullSourceFixture() {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "outsider-stage3-gate-source-"));
  const reality = realityFixture(temporaryRoot);
  const empirical = empiricalFixture();
  const loss = lossFixture();
  const stage2Sources = {
    realityEnvelope: reality.envelope,
    realitySources: reality.sources,
    empiricalLedger: empirical.ledger,
    empiricalSourceOptions: empirical.options,
    lossExposureBook: loss.book,
    lossExposureSources: loss.sources,
  };
  const stage2Frontier = buildStage2QuoteFrontier({
    createdAt: fixtureTime(20), sources: stage2Sources,
  });
  const stage2PriorQuoteCandidates = [];
  const stage2QuoteCandidate = buildStage2QuoteCandidate({
    frontier: stage2Frontier,
    sources: stage2Sources,
    requestedAt: fixtureTime(21),
    validFrom: fixtureTime(22),
    validUntil: fixtureTime(100),
    priorCandidates: stage2PriorQuoteCandidates,
  });
  const readinessLedger = createReadinessGapLedger({ externalSubmissions: [] });
  const stage34Context = { readinessLedger, stage2Frontier, stage2QuoteCandidate,
    stage2Sources, stage2PriorQuoteCandidates };
  const stage34Frontier = await buildStage34AuthorityFrontier({
    ...stage34Context, createdAt: fixtureTime(30),
  });
  return {
    temporaryRoot,
    stage34Frontier,
    stage34Context,
    stage2QuoteCandidate,
    cleanup() { rmSync(temporaryRoot, { recursive: true, force: true }); },
  };
}
