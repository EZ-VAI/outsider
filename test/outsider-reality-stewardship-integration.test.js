import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCurateCheckpoint,
  clearCurateEpisode,
  createCurateInclusionProof,
  CURATE_SCHEMAS,
  normalizeCurateEpisode,
} from "../src/outsider-curate-core.js";
import {
  createAttestationV2,
  createStage05ControlledWayBinding,
  finalizeStage05Evidence,
} from "../src/outsider-stage05-evidence.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";
import {
  assessRealityStewardship,
  createRealityBoundary,
  createRealityBudgetCommitment,
  createRealityExecutionReceipt,
  createStewardshipClaim,
} from "../src/outsider-reality-stewardship.js";
import {
  createRealityCurateEvidenceIntent,
  createSourceBoundRealityAdvisoryEnvelope,
  describeRealityIntegrationMachineBoundary,
  verifyRealityCurateEvidenceIntent,
  verifySourceBoundRealityAdvisoryEnvelope,
} from "../src/outsider-reality-stewardship-integration.js";
import { freezeContract } from "../src/outsider-work-contract.js";

const h = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const at = (seconds) => new Date(Date.parse("2026-08-21T00:00:00.000Z")
  + seconds * 1_000).toISOString();

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function resealEnvelope(record, patch) {
  const { envelopeHash: ignored, ...body } = structuredClone(record);
  const next = { ...body, ...patch };
  return { ...next, envelopeHash: domainHash(
    "outsider/reality-source-bound-advisory-envelope/v1", next) };
}

function curateEpisodeInput({ id = "source", object = "object" } = {}) {
  return {
    schema: CURATE_SCHEMAS.episodeInput,
    source: {
      datasetId: "physical-ai-test-corpus",
      datasetVersion: "2026.08",
      datasetManifestHash: h("dataset-manifest"),
      sourceObjectHash: h(object),
      licenseId: "CC-BY-4.0",
      attributionHash: h("dataset-attribution"),
    },
    instrument: {
      extractorId: "reality-integration-test",
      extractorVersion: "1.0.0",
      extractorImplementationHash: h("extractor"),
      featureSchemaHash: h("feature-schema"),
    },
    episodeIdHash: h(id),
    platformClass: "test-robot",
    steps: [0, 1].map((index) => ({
      index,
      tOffsetMs: index * 10,
      boundary: { isFirst: index === 0, isLast: index === 1,
        isTerminal: index === 1 },
      observation: {
        commitment: h(`${id}-observation-${index}`),
        features: { "joint.position.0": index + 1 },
        images: [],
      },
      action: { kind: "joint-delta", features: { "joint.0": (index + 1) / 10 } },
      outcome: index === 1 ? { kind: "terminal", features: { success: 1 } } : null,
    })),
  };
}

function makeCurateSource(options = {}) {
  const episode = normalizeCurateEpisode(curateEpisodeInput(options));
  const history = [];
  const clearance = clearCurateEpisode(episode, { history });
  const checkpointClearances = [clearance];
  const checkpoint = buildCurateCheckpoint(checkpointClearances, {
    checkpointId: `reality-${options.id ?? "source"}`,
  });
  const inclusionProof = createCurateInclusionProof(
    checkpointClearances, clearance.clearanceHash, checkpoint);
  return { episode, history, clearance, checkpoint, checkpointClearances, inclusionProof };
}

function makeBoundary() {
  const partyA = h("affected-party-a");
  const partyB = h("affected-party-b");
  return createRealityBoundary({
    boundaryId: "source-bound-integration-world",
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
    validFrom: at(0), validUntil: at(100),
  });
}

function experienceClaim(boundary, intent, {
  name = "current", load = 3, provider = h("provider"),
} = {}) {
  return createStewardshipClaim({
    boundary,
    claimIdHash: h(`claim-${name}`),
    wayHash: h(`way-${name}`),
    claimantRootHash: h("claimant"),
    standingEvidenceHashes: [h("standing-reference")],
    purpose: "EXPERIENCE",
    operationHashes: [h(`operation-${name}`), intent.intentHash],
    representedPartyRootHashes: [...boundary.affectedPartyRootHashes],
    requestedExternalities: [
      { channelId: "consent", amount: 0 },
      { channelId: "shared-load", amount: load },
    ],
    alternativesConsideredHashes: [h("simulation-alternative")],
    whyRealityRequiredHash: h("why-reality-required"),
    causalDesignHash: h("prospective-causal-design"),
    experienceRightsHash: intent.declaredExperienceRightsReferenceHash,
    optionPreservationEvidenceHashes: [h("option-preservation")],
    recoveryPlanHash: h("recovery-plan"),
    responsibilityRootHashes: [h("principal"), provider],
    requestedAt: at(1),
    expiresAt: at(90),
  });
}

function sealedStage05Run(t, { boundary, claim } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-reality-integration-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, "workspace");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "result.txt"), "source-bound result\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({
    cwd,
    ask: "collect one bounded physical-AI experience",
    acceptance: "test -f result.txt",
    semantic: {
      objective: "collect one bounded physical-AI experience",
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
    cwd, contract, supervisorCommand: "test-supervisor",
    stateRoot: path.join(root, "runs"), binding,
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
  return { root, store, binding, evidence, attestation,
    stage05Source: { runDirectory: store.directory, attestation } };
}

function completeFixture(t, { createdAt = at(10.5) } = {}) {
  const curateSource = makeCurateSource();
  const curateIntent = createRealityCurateEvidenceIntent({ curateSource });
  const boundary = makeBoundary();
  const provider = h("provider");
  const claim = experienceClaim(boundary, curateIntent, { provider });
  const stage05 = sealedStage05Run(t, { boundary, claim });
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
    executionEvidenceHash: stage05.evidence.publicEvidence.publicEvidenceHash,
    providerRootHash: provider,
    responsibilityRootHashes: claim.responsibilityRootHashes,
    executedAt: at(10),
  });
  const sources = {
    boundary, claim, assessment, priorCommitmentEntries: [], currentCommitment,
    execution, curateIntent, curateSource, stage05Source: stage05.stage05Source,
  };
  const envelope = createSourceBoundRealityAdvisoryEnvelope({ ...sources, createdAt });
  return { ...sources, stage05, envelope };
}

test("replays CURATE -> exact Claim -> sealed Stage0.5 -> signed ATTEST as one advisory envelope",
  (t) => {
    const fixture = completeFixture(t);
    const intentCheck = verifyRealityCurateEvidenceIntent(fixture.curateIntent, {
      curateSource: fixture.curateSource,
    });
    assert.equal(intentCheck.ok, true);
    assert.equal(intentCheck.curateProtocolInputsReplayed, true);
    assert.equal(intentCheck.rawSourceObjectBytesReverified, false);

    const checked = verifySourceBoundRealityAdvisoryEnvelope(
      fixture.envelope, fixture);
    assert.equal(checked.ok, true);
    assert.equal(checked.verificationLevel, "LOCAL_PROTOCOL_SOURCES_REPLAYED");
    assert.equal(checked.stage05EvidenceBytesReverified, true);
    assert.equal(checked.attestationDerivationReverified, true);
    assert.equal(checked.curateProtocolDerivationReverified, true);
    assert.equal(checked.rawCurateSourceObjectBytesReverified, false);
    assert.equal(fixture.envelope.sources.stage05.manifestHash,
      fixture.stage05.evidence.manifest.manifestHash);
    assert.equal(fixture.envelope.sources.stage05.attestationHash,
      fixture.stage05.attestation.attestationHash);
    assert.equal(fixture.envelope.sources.curate.checkpointHash,
      fixture.curateIntent.curate.checkpointHash);
    assert.equal(fixture.envelope.sources.stage05.boundClaimHash, fixture.claim.claimHash);
    assert.equal(fixture.envelope.sources.stage05.boundWayHash, fixture.claim.wayHash);
    assert.equal(fixture.envelope.sources.stage05.boundWorldHash, fixture.boundary.worldHash);
  });

test("local replay still fails closed without an external owner, complete ledger or closure",
  (t) => {
    const { envelope } = completeFixture(t);
    assert.equal(envelope.advisoryDisposition,
      "HOLD_EXTERNAL_OWNER_LEDGER_AND_OPEN_CONSEQUENCES");
    assert.equal(envelope.boundary.authority, "none");
    assert.equal(envelope.boundary.externalOwnerAdoptionVerified, false);
    assert.equal(envelope.boundary.externalLedgerCompletenessVerified, false);
    assert.equal(envelope.boundary.affectedPartyStandingExternallyVerified, false);
    assert.equal(envelope.boundary.ownerGateInputEligible, false);
    assert.equal(envelope.boundary.executionAuthorized, false);
    assert.equal(envelope.boundary.priceAuthorized, false);
    assert.equal(envelope.boundary.closureAuthorized, false);
    assert.deepEqual(envelope.boundary.permits, {
      EXECUTE: false, TRAIN: false, PRICE: false,
      GUARANTEE: false, SETTLE: false, CLOSE: false,
    });
    assert.equal(envelope.consequenceObligations.obligationOpen, true);
    assert.equal(envelope.consequenceObligations.canClose, false);
    assert.equal(envelope.consequenceObligations.externalClosureEligibilityVerified, false);
    assert.equal(verifySourceBoundRealityAdvisoryEnvelope(envelope).verificationLevel,
      "SELF_CHECK_ONLY");
    assert.deepEqual(describeRealityIntegrationMachineBoundary().permissions,
      envelope.boundary.permits);
  });

test("an unsigned ATTEST cannot enter the source-bound envelope", (t) => {
  const fixture = completeFixture(t);
  const unsigned = createAttestationV2({
    runDirectories: [fixture.stage05.store.directory],
  });
  assert.throws(() => createSourceBoundRealityAdvisoryEnvelope({
    ...fixture,
    stage05Source: {
      runDirectory: fixture.stage05.store.directory,
      attestation: unsigned,
    },
    createdAt: at(10.5),
  }), /REALITY_INTEGRATION_SIGNED_ATTESTATION_REQUIRED/);
});

test("resealing cannot elevate authority and source replacement fails full replay", (t) => {
  const fixture = completeFixture(t);
  const elevated = resealEnvelope(fixture.envelope, {
    boundary: { ...structuredClone(fixture.envelope.boundary),
      permits: { ...fixture.envelope.boundary.permits, EXECUTE: true } },
  });
  assert.equal(verifySourceBoundRealityAdvisoryEnvelope(elevated).ok, false);

  const changedManifest = h("self-resealed-unrelated-stage05-manifest");
  const sources = structuredClone(fixture.envelope.sources);
  sources.stage05.manifestHash = changedManifest;
  const sourceEvidenceAnchorHash = domainHash("outsider/reality-source-anchor/v1", {
    stage05ManifestHash: changedManifest,
    stage05PublicEvidenceHash: sources.stage05.publicEvidenceHash,
    attestationHash: sources.stage05.attestationHash,
    curateIntentHash: fixture.envelope.intentHash,
    curateCheckpointHash: sources.curate.checkpointHash,
    executionHash: fixture.envelope.executionHash,
  });
  const consequenceObligations = structuredClone(fixture.envelope.consequenceObligations);
  consequenceObligations.horizons = consequenceObligations.horizons.map((row) => ({
    ...row, sourceEvidenceAnchorHash,
  }));
  consequenceObligations.obligationSetHash = domainHash(
    "outsider/reality-obligation-set/v1", consequenceObligations.horizons);
  const fullyResealed = resealEnvelope(fixture.envelope, {
    sources, sourceEvidenceAnchorHash, consequenceObligations,
  });
  const self = verifySourceBoundRealityAdvisoryEnvelope(fullyResealed);
  assert.equal(self.ok, true);
  assert.equal(self.verificationLevel, "SELF_CHECK_ONLY");
  assert.equal(verifySourceBoundRealityAdvisoryEnvelope(fullyResealed, fixture).ok, false);
});

test("omitted affected parties or constraint channels fail source replay", (t) => {
  const fixture = completeFixture(t);
  const constitutionalBindings = structuredClone(fixture.envelope.constitutionalBindings);
  const retainedParty = constitutionalBindings.affectedPartyRootHashes[0];
  constitutionalBindings.affectedPartyRootHashes = [retainedParty];
  constitutionalBindings.representedPartyRootHashes = [retainedParty];
  constitutionalBindings.constraintChannels = constitutionalBindings.constraintChannels
    .map((row) => ({ ...row, affectedPartyRootHashes: [retainedParty] }));
  const missingParty = resealEnvelope(fixture.envelope, { constitutionalBindings });
  assert.equal(verifySourceBoundRealityAdvisoryEnvelope(missingParty).ok, true,
    "a caller-resealed projection is explicitly only a self-check");
  assert.equal(verifySourceBoundRealityAdvisoryEnvelope(missingParty, fixture).ok, false);

  const missingChannelBindings = structuredClone(fixture.envelope.constitutionalBindings);
  missingChannelBindings.constraintChannels = missingChannelBindings.constraintChannels.slice(1);
  const missingChannel = resealEnvelope(fixture.envelope, {
    constitutionalBindings: missingChannelBindings,
  });
  assert.equal(verifySourceBoundRealityAdvisoryEnvelope(missingChannel).ok, true);
  assert.equal(verifySourceBoundRealityAdvisoryEnvelope(missingChannel, fixture).ok, false);

  const incompleteClaim = createStewardshipClaim({
    ...fixture.claim,
    boundary: fixture.boundary,
    claimIdHash: h("incomplete-party-claim"),
    representedPartyRootHashes: [fixture.boundary.affectedPartyRootHashes[0]],
  });
  const refused = assessRealityStewardship({
    boundary: fixture.boundary, claim: incompleteClaim, now: at(2),
  });
  assert.equal(refused.decision, "REFUSE_NON_FUNGIBLE_CONSTRAINT");
});

test("duplicate budget credit is rejected even when the kernel would deduplicate it", (t) => {
  const fixture = completeFixture(t);
  const priorClaim = experienceClaim(fixture.boundary, fixture.curateIntent, {
    name: "prior", load: 1,
  });
  const priorCommitment = createRealityBudgetCommitment({
    boundary: fixture.boundary,
    claim: priorClaim,
    channelAmounts: priorClaim.requestedExternalities,
    commitmentEvidenceHash: h("prior-budget"),
    committedAt: at(1.5),
  });
  const entry = { commitment: priorCommitment, claim: priorClaim };
  const assessment = assessRealityStewardship({
    boundary: fixture.boundary,
    claim: fixture.claim,
    priorCommitmentEntries: [entry],
    now: at(2),
  });
  assert.throws(() => createSourceBoundRealityAdvisoryEnvelope({
    ...fixture,
    assessment,
    priorCommitmentEntries: [entry, entry],
    createdAt: at(10.5),
  }), /REALITY_INTEGRATION_DUPLICATE_BUDGET_COMMITMENT/);
});

test("provider replacement adds responsibility but cannot erase the original roots", (t) => {
  const fixture = completeFixture(t);
  const replacement = h("replacement-provider");
  assert.throws(() => createRealityExecutionReceipt({
    boundary: fixture.boundary,
    claim: fixture.claim,
    ownerGateReceiptHash: h("owner-reference"),
    executionEvidenceHash: fixture.stage05.evidence.publicEvidence.publicEvidenceHash,
    providerRootHash: replacement,
    responsibilityRootHashes: [replacement],
    executedAt: at(10),
  }), /REALITY_EXECUTION_RESPONSIBILITY_ERASED/);

  const successorExecution = createRealityExecutionReceipt({
    boundary: fixture.boundary,
    claim: fixture.claim,
    ownerGateReceiptHash: h("owner-reference"),
    executionEvidenceHash: fixture.stage05.evidence.publicEvidence.publicEvidenceHash,
    providerRootHash: replacement,
    responsibilityRootHashes: [...fixture.claim.responsibilityRootHashes, replacement],
    executedAt: at(10),
  });
  const successor = createSourceBoundRealityAdvisoryEnvelope({
    ...fixture,
    execution: successorExecution,
    createdAt: at(10.5),
  });
  assert.ok(successor.constitutionalBindings.responsibilityRootHashes
    .includes(replacement));
  for (const root of fixture.claim.responsibilityRootHashes) {
    assert.ok(successor.constitutionalBindings.responsibilityRootHashes.includes(root));
  }
  assert.equal(successor.boundary.permits.CLOSE, false);
});

test("an immature or overdue consequence horizon never becomes closure", (t) => {
  const early = completeFixture(t, { createdAt: at(10.5) });
  const immediate = early.envelope.consequenceObligations.horizons
    .find((row) => row.horizonId === "immediate");
  const delayed = early.envelope.consequenceObligations.horizons
    .find((row) => row.horizonId === "delayed");
  assert.equal(immediate.status, "REPORT_DUE_OR_OVERDUE");
  assert.equal(delayed.status, "OPEN_UNTIL_DUE");
  assert.equal(delayed.consequenceReportHash, null);
  assert.equal(delayed.obligationOpen, true);
  assert.equal(delayed.canClose, false);

  const later = createSourceBoundRealityAdvisoryEnvelope({
    ...early,
    createdAt: at(13),
  });
  assert.ok(later.consequenceObligations.horizons
    .every((row) => row.status === "REPORT_DUE_OR_OVERDUE"));
  assert.equal(later.consequenceObligations.allConsequenceReportsBound, false);
  assert.equal(later.consequenceObligations.canClose, false);
  assert.equal(later.boundary.permits.CLOSE, false);
});

test("a different valid CURATE episode cannot be swapped into an already-bound Claim", (t) => {
  const fixture = completeFixture(t);
  const replacementSource = makeCurateSource({ id: "replacement", object: "replacement" });
  const replacementIntent = createRealityCurateEvidenceIntent({
    curateSource: replacementSource,
  });
  assert.throws(() => createSourceBoundRealityAdvisoryEnvelope({
    ...fixture,
    curateIntent: replacementIntent,
    curateSource: replacementSource,
    createdAt: at(10.5),
  }), /REALITY_INTEGRATION_CURATE_INTENT_NOT_BOUND_TO_CLAIM/);
});

test("the offline CLI builds and fully replays the same no-authority envelope", (t) => {
  const fixture = completeFixture(t);
  const root = fixture.stage05.root;
  const put = (name, value) => {
    const file = path.join(root, name);
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
    return name;
  };
  const episodeFile = put("curate-episode.json", fixture.curateSource.episode);
  const clearanceFile = put("curate-clearance.json", fixture.curateSource.clearance);
  const checkpointFile = put("curate-checkpoint.json", fixture.curateSource.checkpoint);
  const inclusionProofFile = put("curate-proof.json", fixture.curateSource.inclusionProof);
  const spec = {
    schema: "outsider/reality-source-bound-input-spec/v1",
    boundaryFile: put("reality-boundary.json", fixture.boundary),
    claimFile: put("reality-claim.json", fixture.claim),
    assessmentFile: put("reality-assessment.json", fixture.assessment),
    priorCommitmentEntries: [],
    currentCommitmentFile: put("reality-current-commitment.json",
      fixture.currentCommitment),
    executionFile: put("reality-execution.json", fixture.execution),
    curateIntentFile: put("reality-curate-intent.json", fixture.curateIntent),
    curateSource: {
      episodeFile,
      historyFiles: [],
      clearanceFile,
      checkpointFile,
      checkpointClearanceFiles: [clearanceFile],
      inclusionProofFile,
    },
    stage05: {
      runDirectory: path.relative(root, fixture.stage05.store.directory),
      attestationFile: put("stage05-attestation.json", fixture.stage05.attestation),
    },
    createdAt: fixture.envelope.createdAt,
  };
  const specFile = path.join(root, "source-bound-spec.json");
  writeFileSync(specFile, `${JSON.stringify(spec, null, 2)}\n`);
  const output = path.join(root, "source-bound-envelope.json");
  const cli = path.resolve("scripts/reality-stewardship-bind.mjs");
  const built = spawnSync(process.execPath,
    [cli, "build", "--spec", specFile, "--out", output], {
      cwd: process.cwd(), encoding: "utf8",
    });
  assert.equal(built.status, 0, built.stderr);
  const emitted = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(emitted.envelopeHash, fixture.envelope.envelopeHash);
  const verified = spawnSync(process.execPath,
    [cli, "verify", "--spec", specFile, "--envelope", output], {
      cwd: process.cwd(), encoding: "utf8",
    });
  assert.equal(verified.status, 0, verified.stderr);
  const checked = JSON.parse(verified.stdout);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "LOCAL_PROTOCOL_SOURCES_REPLAYED");
  assert.equal(checked.executionAuthorized, false);
  assert.equal(checked.priceAuthorized, false);
  assert.equal(checked.closureAuthorized, false);
});
