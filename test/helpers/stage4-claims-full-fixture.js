import { createHash, generateKeyPairSync } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCurateCheckpoint, clearCurateEpisode, createCurateInclusionProof,
  CURATE_SCHEMAS, normalizeCurateEpisode,
} from "../../src/outsider-curate-core.js";
import { buildEmpiricalFactorLedger } from "../../src/outsider-empirical-factor-ledger.js";
import {
  buildLossExposureQuarantine, buildLossExposureShadowBook,
} from "../../src/outsider-loss-exposure-evidence.js";
import {
  createRealityCurateEvidenceIntent, createSourceBoundRealityAdvisoryEnvelope,
} from "../../src/outsider-reality-stewardship-integration.js";
import {
  assessRealityStewardship, createRealityBoundary, createRealityBudgetCommitment,
  createRealityExecutionReceipt, createStewardshipClaim,
} from "../../src/outsider-reality-stewardship.js";
import { createReadinessGapLedger } from "../../src/outsider-readiness-gap-ledger.js";
import {
  buildStage2QuoteCandidate, buildStage2QuoteFrontier,
} from "../../src/outsider-stage2-quote-frontier.js";
import {
  buildStage34AuthorityFrontier, buildStage4SettlementInstructionCandidate,
} from "../../src/outsider-stage34-authority-frontier.js";
import {
  createAttestationV2, createStage05ControlledWayBinding, finalizeStage05Evidence,
} from "../../src/outsider-stage05-evidence.js";
import { RunStore, snapshotWorkspace } from "../../src/outsider-kernel-store.js";
import { freezeContract } from "../../src/outsider-work-contract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const stage4ClaimsHash = (value) => `sha256:${createHash("sha256")
  .update(String(value)).digest("hex")}`;
export const stage4ClaimsAt = (seconds) => new Date(
  Date.parse("2026-08-21T00:00:00.000Z") + seconds * 1_000).toISOString();

function curateSource() {
  const episode = normalizeCurateEpisode({
    schema: CURATE_SCHEMAS.episodeInput,
    source: {
      datasetId: "stage4-claims-fixture", datasetVersion: "2026.08",
      datasetManifestHash: stage4ClaimsHash("dataset-manifest"),
      sourceObjectHash: stage4ClaimsHash("source-object"),
      licenseId: "CC-BY-4.0", attributionHash: stage4ClaimsHash("attribution"),
    },
    instrument: {
      extractorId: "stage4-claims-fixture", extractorVersion: "1.0.0",
      extractorImplementationHash: stage4ClaimsHash("extractor"),
      featureSchemaHash: stage4ClaimsHash("feature-schema"),
    },
    episodeIdHash: stage4ClaimsHash("episode"), platformClass: "test-robot",
    steps: [0, 1].map((index) => ({
      index, tOffsetMs: index * 10,
      boundary: { isFirst: index === 0, isLast: index === 1, isTerminal: index === 1 },
      observation: { commitment: stage4ClaimsHash(`observation-${index}`),
        features: { "joint.position.0": index + 1 }, images: [] },
      action: { kind: "joint-delta", features: { "joint.0": (index + 1) / 10 } },
      outcome: index === 1 ? { kind: "terminal", features: { success: 1 } } : null,
    })),
  });
  const history = [];
  const clearance = clearCurateEpisode(episode, { history });
  const checkpointClearances = [clearance];
  const checkpoint = buildCurateCheckpoint(checkpointClearances,
    { checkpointId: "stage4-claims-fixture" });
  const inclusionProof = createCurateInclusionProof(checkpointClearances,
    clearance.clearanceHash, checkpoint);
  return { episode, history, clearance, checkpoint, checkpointClearances, inclusionProof };
}

function realityFixture(seed = "primary") {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "outsider-stage4-claims-source-"));
  const workspace = path.join(temporaryRoot, "workspace");
  mkdirSync(workspace);
  writeFileSync(path.join(workspace, "result.txt"), "bounded result\n");
  const curate = curateSource();
  const curateIntent = createRealityCurateEvidenceIntent({ curateSource: curate });
  const partyA = stage4ClaimsHash("affected-party-a");
  const partyB = stage4ClaimsHash("affected-party-b");
  const boundary = createRealityBoundary({
    boundaryId: `stage4-claims-world-${seed}`,
    worldHash: stage4ClaimsHash(`world:${seed}`), policyHash: stage4ClaimsHash("policy"),
    resourceOwnerRootHash: stage4ClaimsHash("resource-owner"),
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
    challengePolicyHash: stage4ClaimsHash("challenge-policy"),
    recoveryStandardHash: stage4ClaimsHash("recovery-standard"),
    validFrom: stage4ClaimsAt(0), validUntil: stage4ClaimsAt(100),
  });
  const provider = stage4ClaimsHash("provider");
  const claim = createStewardshipClaim({
    boundary, claimIdHash: stage4ClaimsHash(`claim:${seed}`),
    wayHash: stage4ClaimsHash(`way:${seed}`),
    claimantRootHash: stage4ClaimsHash("claimant"),
    standingEvidenceHashes: [stage4ClaimsHash("standing-reference")],
    purpose: "EXPERIENCE",
    operationHashes: [stage4ClaimsHash("operation"), curateIntent.intentHash],
    representedPartyRootHashes: [...boundary.affectedPartyRootHashes],
    requestedExternalities: [
      { channelId: "consent", amount: 0 }, { channelId: "shared-load", amount: 3 },
    ],
    alternativesConsideredHashes: [stage4ClaimsHash("simulation-alternative")],
    whyRealityRequiredHash: stage4ClaimsHash("why-reality-required"),
    causalDesignHash: stage4ClaimsHash("causal-design"),
    experienceRightsHash: curateIntent.declaredExperienceRightsReferenceHash,
    optionPreservationEvidenceHashes: [stage4ClaimsHash("option-preservation")],
    recoveryPlanHash: stage4ClaimsHash("recovery-plan"),
    responsibilityRootHashes: [stage4ClaimsHash("principal"), provider],
    requestedAt: stage4ClaimsAt(1), expiresAt: stage4ClaimsAt(90),
  });
  const baseline = snapshotWorkspace(workspace);
  const contract = freezeContract({
    cwd: workspace, ask: "collect one bounded experience", acceptance: "test -f result.txt",
    semantic: { objective: "collect one bounded experience", successCriteria: ["result exists"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["result.txt"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: stage4ClaimsHash("semantic-audit") },
    baselineEvidence: baseline,
  });
  const binding = createStage05ControlledWayBinding({
    contract, host: "claude-code", workerExecutable: "test-worker",
    supervisorCommand: "test-supervisor", exactClaim: { claimHash: claim.claimHash },
    exactWay: { wayHash: claim.wayHash }, exactWorld: { worldHash: boundary.worldHash },
  });
  const store = RunStore.create({ cwd: workspace, contract,
    supervisorCommand: "test-supervisor", stateRoot: path.join(temporaryRoot, "runs"),
    binding });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash,
    createdBeforeWorker: true });
  store.append("contract_compiled", { objective: contract.semantic.objective });
  store.append("contract_audited", { passed: true,
    evidenceHash: stage4ClaimsHash("semantic-audit") });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  store.append("worker_launch", { executable: "test-worker" });
  store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0 });
  store.append("outcome_verdict", { phase: "stop", passed: true,
    finalFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
    acceptancePassed: true, finalFingerprint: baseline.fingerprint, errors: [] });
  store.saveState({ status: "complete", proof: { complete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: true } });
  const evidence = finalizeStage05Evidence({ directory: store.directory });
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const attestation = createAttestationV2({ runDirectories: [store.directory], privateKeyPem });
  const assessment = assessRealityStewardship({ boundary, claim,
    priorCommitmentEntries: [], now: stage4ClaimsAt(2) });
  const currentCommitment = createRealityBudgetCommitment({ boundary, claim,
    channelAmounts: claim.requestedExternalities,
    commitmentEvidenceHash: stage4ClaimsHash("local-budget-reservation"),
    committedAt: stage4ClaimsAt(3) });
  const execution = createRealityExecutionReceipt({ boundary, claim,
    ownerGateReceiptHash: stage4ClaimsHash("opaque-owner-gate-reference"),
    executionEvidenceHash: evidence.publicEvidence.publicEvidenceHash,
    providerRootHash: provider, responsibilityRootHashes: claim.responsibilityRootHashes,
    executedAt: stage4ClaimsAt(10) });
  const sources = { boundary, claim, assessment, priorCommitmentEntries: [],
    currentCommitment, execution, curateIntent, curateSource: curate,
    stage05Source: { runDirectory: store.directory, attestation } };
  const envelope = createSourceBoundRealityAdvisoryEnvelope({ ...sources,
    createdAt: stage4ClaimsAt(10.5) });
  return { temporaryRoot, sources, envelope };
}

function empiricalOptions() {
  const droidSourceDirectory = path.join(root, "artifacts/curate-droid100-20260819/source");
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
    nhtsaRegistryDirectory: path.join(root,
      "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902"),
    nhtsaCsvPath: path.join(root,
      "artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv"),
    nhtsaDataDictionaryPath: path.join(root,
      "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf"),
  };
  if (![...Object.values(paths), droidSourceDirectory].every(existsSync)) {
    throw new Error("STAGE4_CLAIMS_FIXTURE_SOURCES_MISSING");
  }
  return { ...paths, nhtsaReplayAt: "2026-09-02T14:20:08.000Z", droidSource: {
    objectListBytes: readFileSync(path.join(droidSourceDirectory, "gcs-objects.json")),
    datasetInfoBytes: readFileSync(path.join(droidSourceDirectory, "dataset_info.json")),
    featureBytes: readFileSync(path.join(droidSourceDirectory, "features.json")),
    shardBytes: readFileSync(path.join(droidSourceDirectory,
      "r2d2_faceblur-train.tfrecord-00000-of-00031")),
  } };
}

export async function createStage4ClaimsFullFixture({ seed = "primary" } = {}) {
  const reality = realityFixture(seed);
  try {
    const empiricalSourceOptions = empiricalOptions();
    const empiricalLedger = buildEmpiricalFactorLedger(empiricalSourceOptions);
    const trustStore = { operators: {}, adjudicators: {}, fraudReviewers: {} };
    const quarantine = buildLossExposureQuarantine([], {
      trustStore, createdAt: "2026-08-20T00:00:00.000Z",
    });
    const lossExposureBook = buildLossExposureShadowBook({ quarantine,
      adjudications: [], trustStore, generatedAt: "2026-08-20T00:00:00.000Z" });
    const stage2Sources = {
      realityEnvelope: reality.envelope,
      realitySources: reality.sources,
      empiricalLedger,
      empiricalSourceOptions,
      lossExposureBook,
      lossExposureSources: { quarantine, quarantineLineage: [], adjudications: [],
        trustStore, now: "2026-08-20T00:00:00.000Z" },
    };
    const stage2Frontier = buildStage2QuoteFrontier({
      createdAt: stage4ClaimsAt(20), sources: stage2Sources,
    });
    const stage2PriorQuoteCandidates = [];
    const stage2QuoteCandidate = buildStage2QuoteCandidate({
      frontier: stage2Frontier, sources: stage2Sources,
      requestedAt: stage4ClaimsAt(21), validFrom: stage4ClaimsAt(22),
      validUntil: stage4ClaimsAt(30), priorCandidates: stage2PriorQuoteCandidates,
    });
    const readinessLedger = createReadinessGapLedger({ externalSubmissions: [] });
    const frontier = await buildStage34AuthorityFrontier({ readinessLedger,
      stage2Frontier, stage2QuoteCandidate, stage2Sources,
      stage2PriorQuoteCandidates, createdAt: stage4ClaimsAt(31) });
    const priorCandidates = [];
    const candidate = buildStage4SettlementInstructionCandidate({ frontier,
      readinessLedger, priorCandidates, createdAt: stage4ClaimsAt(32) });
    const stage34Context = { frontier, readinessLedger, stage2Frontier,
      stage2QuoteCandidate, stage2Sources, stage2PriorQuoteCandidates };
    return { reality, candidate, priorCandidates, stage34Context,
      cleanup: () => rmSync(reality.temporaryRoot, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(reality.temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
