import assert from "node:assert/strict";
import {
  createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { snapshotWorkspace, RunStore } from "../src/outsider-kernel-store.js";
import { freezeContract } from "../src/outsider-work-contract.js";
import {
  createAttestationV2, createStage05ControlledWayBinding, finalizeStage05Evidence,
  stage05Digest,
} from "../src/outsider-stage05-evidence.js";
import {
  contributionDigest, createContributionEnvelope, ExperienceContributionRegistry,
  initializeShareDirectory, previewRunContribution,
} from "../src/outsider-experience-contribution.js";
import {
  createEvidenceRegistry, importQuarantineExport,
} from "../src/outsider-evidence-registry.js";
import {
  DurableStage1CurateCorpusRegistry, verifyCorpusArtifactSet,
} from "../src/outsider-corpus-registry.js";
import {
  buildStage05ContributionCorpusArtifactSetsFromEvidenceRegistry,
} from "../src/outsider-stage05-corpus-registry-intake.js";

const T0 = "2036-01-01T00:00:00.000Z";
const CLI = path.resolve("scripts/stage1-curate-corpus-registry.mjs");
const at = (seconds) => new Date(Date.parse(T0) + seconds * 1_000);

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function sealedUnattributedRun(root) {
  const cwd = path.join(root, "workspace");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 2;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: "deliver only independently verified work",
    acceptance: "node --test",
    semantic: { objective: "deliver verified work", successCriteria: ["tests pass"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: `sha256:${"a".repeat(64)}` },
    baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/test/worker", supervisorCommand: "test supervisor" });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "test supervisor",
    stateRoot: path.join(root, "runs"), binding });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash,
    createdBeforeWorker: true });
  store.append("contract_compiled", { objective: "deliver verified work" });
  store.append("contract_audited", { passed: true,
    evidenceHash: `sha256:${"a".repeat(64)}` });
  store.append("contract_frozen", { acceptance: "node --test" });
  store.append("worker_launch", { executable: "test" });
  store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0 });
  store.append("outcome_verdict", { phase: "stop", passed: true,
    finalFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: false, deliveryComplete: true,
    interventionRequired: true, interventionComplete: false,
    acceptancePassed: true, finalFingerprint: baseline.fingerprint,
    errors: ["no intervention has a complete causal chain"] });
  store.saveState({ status: "delivered-unattributed", proof: { complete: false,
    deliveryComplete: true, interventionRequired: true, interventionComplete: false } });
  finalizeStage05Evidence({ directory: store.directory });
  return store.directory;
}

function quarantinePage({ entry, generatedAt = at(8).toISOString() }) {
  return { schema: "outsider/quarantine-export/v1", registryId: "live-contributions",
    generatedAt, count: 1, items: [entry], nextCursor: null,
    useBoundary: { disposition: "QUARANTINED", automaticTraining: false,
      permitsCuratePromotion: false, permitsPricing: false,
      permitsGuarantee: false, permitsSettlement: false } };
}

function liveFixture({ forgeCausalCredit = false, instrumentVariant = null,
  corpusSigner = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stage05-corpus-intake-"));
  const sourceServer = keys();
  const evidenceSigner = keys();
  const corpusSigningKeys = corpusSigner ?? keys();
  const runDirectory = sealedUnattributedRun(root);
  const audience = "https://contributions.outsider.test";
  const ingress = new ExperienceContributionRegistry({ directory: path.join(root, "ingress"),
    privateKeyPem: sourceServer.privateKey, registryId: "live-contributions", audience });
  const share = initializeShareDirectory({ directory: path.join(root, "share"), endpoint: audience,
    serverPublicKeyPem: sourceServer.publicKey, retentionDays: 30, now: at(0) });
  const devicePrivateKeyPem = readFileSync(path.join(share.directory, "device-private.pem"),
    "utf8");
  const preview = previewRunContribution(runDirectory);
  let contributionRecord = preview.contributionRecord;
  if (forgeCausalCredit || instrumentVariant) {
    contributionRecord = structuredClone(contributionRecord);
    if (instrumentVariant) Object.assign(contributionRecord.instrument, instrumentVariant);
  }
  if (forgeCausalCredit) {
    contributionRecord.learningLabels.outsiderCausalContribution = true;
    contributionRecord.learningLabels.eligibleForCorrectionEffectLearning = true;
    contributionRecord.learningLabels.causalAttributionClass = "AUDITED_INTERVENTION_COMPLETE";
    contributionRecord.modelFeatures.verified.outsiderCausalContribution = true;
    contributionRecord.modelFeatures.verified.eligibleForCorrectionEffectLearning = true;
    contributionRecord.modelFeatures.verified.causalAttributionClass
      = "AUDITED_INTERVENTION_COMPLETE";
  }
  if (forgeCausalCredit || instrumentVariant) {
    delete contributionRecord.recordHash;
    contributionRecord.recordHash = contributionDigest(contributionRecord);
  }
  let attestation = createAttestationV2({ runDirectories: [runDirectory],
    privateKeyPem: devicePrivateKeyPem });
  if (instrumentVariant) {
    attestation = structuredClone(attestation);
    Object.assign(attestation.groupKey, instrumentVariant);
    attestation.correlation.correlationRoots = [
      attestation.groupKey.controllerImplementationHash, attestation.groupKey.wayHash,
    ];
    attestation.commitment = stage05Digest({ groupKey: attestation.groupKey,
      included: attestation.included, counts: attestation.outcomes });
    const { attestationHash: ignoredHash, signature: ignoredSignature, ...unsignedBody }
      = attestation;
    attestation.attestationHash = stage05Digest({ ...unsignedBody, signature: null });
    const privateKey = createPrivateKey(devicePrivateKeyPem);
    const publicKey = createPublicKey(privateKey);
    attestation.signature = { algorithm: "Ed25519",
      keyId: stage05Digest(publicKey.export({ type: "spki", format: "der" })),
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      value: cryptoSign(null, Buffer.from(attestation.attestationHash), privateKey)
        .toString("base64") };
  }
  const challenge = ingress.issueChallenge({ deviceKeyId: share.consent.deviceKeyId,
    experienceRecordHash: contributionRecord.recordHash, now: at(1) });
  const envelope = createContributionEnvelope({ contributionRecord, attestation,
    consent: share.consent, challenge, devicePrivateKeyPem, createdAt: at(2) });
  const ingested = ingress.ingest(envelope, { now: at(3) });
  const page = quarantinePage({ entry: { contributionRecord, receipt: ingested.receipt,
    registry: ingress.entries.at(-1) }, generatedAt: at(4).toISOString() });
  let evidenceRegistry = createEvidenceRegistry({ registryId: "signed-live-stage1",
    createdAt: at(5), privateKeyPem: evidenceSigner.privateKey });
  evidenceRegistry = importQuarantineExport({ registry: evidenceRegistry,
    quarantineExport: page, serverPublicKeyPem: sourceServer.publicKey,
    importedAt: at(6), privateKeyPem: evidenceSigner.privateKey }).registry;
  return { root, sourceServer, evidenceSigner, corpusSigner: corpusSigningKeys, evidenceRegistry,
    retainUntil: ingested.receipt.retentionUntil };
}

function intake(fixture, overrides = {}) {
  return buildStage05ContributionCorpusArtifactSetsFromEvidenceRegistry({
    evidenceRegistry: fixture.evidenceRegistry,
    privateKeyPem: fixture.corpusSigner.privateKey,
    trustedRegistrySignerKeyIds: [fixture.evidenceRegistry.signature.keyId],
    trustedSourceServerKeyIds: [fixture.evidenceRegistry.imports[0].sourceServerKeyId],
    now: at(7), ...overrides,
  });
}

test("signed Stage 0.5 contribution projections enter the durable registry without causal credit",
  () => {
    const fixture = liveFixture();
    const registryRoot = path.join(fixture.root, "corpus-registry");
    try {
      const result = intake(fixture);
      assert.equal(result.ok, true);
      assert.equal(result.contributionProjectionReverified, true);
      assert.equal(result.sealedRunArtifactsReverified, false);
      assert.equal(result.revocationFreshness, "AS_OF_SOURCE_EXPORT_ONLY");
      assert.equal(result.artifactSets.length, 1);
      const set = result.artifactSets[0];
      assert.equal(verifyCorpusArtifactSet(set).ok, true);
      assert.equal(set.stage, "ATTEST");
      assert.equal(set.stream, "FORWARD_ACTION_EVIDENCE");
      assert.equal(set.sourceProof.verificationLevel,
        "SIGNED_PRIVACY_PROJECTION_REVERIFIED");
      assert.equal(set.sourceProof.sourceCompleteness, "SIGNED_PRIVACY_PROJECTION_ONLY");
      assert.equal(set.rightsBasis.class, "EXPLICIT_USER_CONTRIBUTION_CONSENT");
      assert.deepEqual(set.licenseIds, []);
      assert.equal(set.retention.retainUntil, fixture.retainUntil);
      assert.equal(set.causalCreditPolicy
        .verifiedDeliveryUnattributedCreditedAsOutsiderSuccess, false);
      assert.equal(set.boundary.causalExperienceUnits, 0);
      assert.equal(set.boundary.lossEvidenceUnits, 0);
      assert.equal(set.boundary.pricingEligible, false);
      const unit = set.units[0];
      const source = fixture.evidenceRegistry.imports[0]
        .quarantineExport.items[0].contributionRecord.source;
      assert.equal(unit.identityHash, source.supervisedExperienceHash);
      for (const root of [source.manifestHash, source.projectionHash,
        source.publicEvidenceHash, source.eventChainHash]) {
        assert.equal(unit.correlationRoots.includes(root), true);
      }
      const registry = new DurableStage1CurateCorpusRegistry({ directory: registryRoot,
        privateKeyPem: fixture.corpusSigner.privateKey, registryId: "live-stage05-test",
        createdAt: at(0) });
      const appended = registry.appendArtifactSets(result.artifactSets, { recordedAt: at(8) });
      assert.equal(appended.appended, 1);
      const replay = intake(fixture, { now: at(9) });
      assert.equal(replay.artifactSets[0].artifactSetHash, set.artifactSetHash,
        "verification wall time must not make the same signed source batch non-idempotent");
      assert.equal(registry.appendArtifactSets(replay.artifactSets,
        { recordedAt: at(9) }).duplicateArtifactSets, 1);
      const exhausted = intake(fixture, { now: at(9),
        afterImportHash: result.selection.completeThroughImportHash });
      assert.equal(exhausted.artifactSets.length, 0);
      assert.equal(exhausted.selection.selectedImports, 0);
      const status = registry.status({ now: at(9) });
      assert.equal(status.ok, true, status.error);
      assert.equal(status.counts.candidates, 1);
      assert.equal(status.counts.d2Groups, 1);
      assert.equal(status.boundary.causalExperienceUnits, 0);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

test("live intake rejects untrusted signers, expired retention, and tampered registries", () => {
  const fixture = liveFixture();
  try {
    assert.throws(() => intake(fixture, { trustedRegistrySignerKeyIds:
      [`sha256:${"0".repeat(64)}`] }), /SIGNED_EVIDENCE_REGISTRY_UNTRUSTED/);
    assert.throws(() => intake(fixture, { trustedSourceServerKeyIds:
      [`sha256:${"0".repeat(64)}`] }), /SIGNED_RECEIPT_SERVER_UNTRUSTED/);
    assert.throws(() => intake(fixture, { now: fixture.retainUntil }),
      /SIGNED_EVIDENCE_REGISTRY_UNTRUSTED|RETENTION_EXPIRED/);
    const tampered = structuredClone(fixture.evidenceRegistry);
    tampered.counts.nUnique = 99;
    assert.throws(() => intake(fixture, { evidenceRegistry: tampered }),
      /SIGNED_EVIDENCE_REGISTRY_UNTRUSTED/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("an unattributed delivery cannot be relabeled as Outsider causal success at intake", () => {
  const fixture = liveFixture({ forgeCausalCredit: true });
  try {
    assert.throws(() => intake(fixture), /UNATTRIBUTED_DELIVERY_CAUSAL_CREDIT_REFUSED/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("D2 preserves the complete original Evidence Registry instrument group", () => {
  const signer = keys();
  const base = liveFixture({ corpusSigner: signer });
  const productChanged = liveFixture({ corpusSigner: signer,
    instrumentVariant: { productVersion: "9.9.9" } });
  const controllerChanged = liveFixture({ corpusSigner: signer,
    instrumentVariant: { controllerImplementationHash: `sha256:${"b".repeat(64)}` } });
  const fixtures = [base, productChanged, controllerChanged];
  try {
    const sets = fixtures.map((fixture) => intake(fixture).artifactSets[0]);
    assert.equal(new Set(sets.map((set) => set.instrument.implementationHash)).size, 1,
      "the intake implementation itself is intentionally constant in this attack");
    assert.equal(new Set(sets.map((set) => set.instrument.featureSchemaHash)).size, 3,
      "product/controller-only source instrument changes must start distinct D2 groups");
    const registry = new DurableStage1CurateCorpusRegistry({
      directory: path.join(base.root, "d2-registry"), privateKeyPem: signer.privateKey,
      registryId: "stage05-d2-isolation", createdAt: at(0) });
    registry.appendArtifactSets(sets, { recordedAt: at(8) });
    const status = registry.status({ now: at(9) });
    assert.equal(status.ok, true, status.error);
    assert.equal(status.counts.d2Groups, 3);
  } finally {
    for (const fixture of fixtures) rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("CLI ingests a trusted Stage 0.5 registry incrementally and idempotently", () => {
  const fixture = liveFixture();
  try {
    const corpusDirectory = path.join(fixture.root, "cli-corpus");
    const keyFile = path.join(fixture.root, "corpus-private.pem");
    const evidenceFile = path.join(fixture.root, "evidence-registry.json");
    const trustFile = path.join(fixture.root, "trust.json");
    writeFileSync(keyFile, fixture.corpusSigner.privateKey, { mode: 0o600 });
    writeFileSync(evidenceFile, JSON.stringify(fixture.evidenceRegistry));
    writeFileSync(trustFile, JSON.stringify({
      registrySignerKeyIds: [fixture.evidenceRegistry.signature.keyId],
      sourceServerKeyIds: [fixture.evidenceRegistry.imports[0].sourceServerKeyId],
    }));
    const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    let result = run(["init", "--dir", corpusDirectory, "--signing-key", keyFile,
      "--registry-id", "cli-live-stage05", "--at", at(0).toISOString()]);
    assert.equal(result.status, 0, result.stderr);
    const base = ["ingest-stage05-registry", "--dir", corpusDirectory,
      "--signing-key", keyFile, "--evidence-registry", evidenceFile,
      "--trust-store", trustFile];
    result = run([...base, "--at", at(7).toISOString()]);
    assert.equal(result.status, 0, result.stderr);
    const first = JSON.parse(result.stdout);
    assert.equal(first.appended, 1);
    assert.equal(first.intakeCounts.causalExperienceUnits, 0);
    assert.equal(first.sealedRunArtifactsReverified, false);
    result = run([...base, "--at", at(8).toISOString()]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).duplicateArtifactSets, 1);
    result = run([...base, "--after-import-hash",
      first.selection.completeThroughImportHash, "--at", at(9).toISOString()]);
    assert.equal(result.status, 0, result.stderr);
    const exhausted = JSON.parse(result.stdout);
    assert.equal(exhausted.appended, 0);
    assert.equal(exhausted.selection.selectedImports, 0);
    result = run(["verify", "--dir", corpusDirectory, "--now", at(10).toISOString()]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).counts.candidates, 1);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
