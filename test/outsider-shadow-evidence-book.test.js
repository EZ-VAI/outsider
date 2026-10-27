import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { snapshotWorkspace, RunStore } from "../src/outsider-kernel-store.js";
import { freezeContract } from "../src/outsider-work-contract.js";
import {
  createAttestationV2, createStage05ControlledWayBinding, finalizeStage05Evidence,
} from "../src/outsider-stage05-evidence.js";
import {
  createContributionEnvelope, ExperienceContributionRegistry, initializeShareDirectory,
  previewRunContribution,
} from "../src/outsider-experience-contribution.js";
import {
  createEvidenceRegistry, importQuarantineExport,
} from "../src/outsider-evidence-registry.js";
import {
  buildCurateCheckpoint, clearCurateEpisode, CURATE_SCHEMAS, normalizeCurateEpisode,
} from "../src/outsider-curate-core.js";
import {
  buildShadowEvidenceBook, verifyShadowEvidenceBook,
} from "../src/outsider-shadow-evidence-book.js";

// RunStore timestamps are real wall-clock values; synthetic receipts live in a
// fixed later epoch so occurrence ordering remains deterministic.
const T0 = "2035-08-20T00:00:00.000Z";
const BOOK_TIME = "2035-08-20T00:00:13.000Z";
const H = (character) => `sha256:${character.repeat(64)}`;

function runChild(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}
const digest = (value) => `sha256:${createHash("sha256")
  .update(canonicalizeStrict(value)).digest("hex")}`;

function resealBook(book) {
  const { bookHash: ignored, ...body } = book;
  return { ...body, bookHash: digest(body) };
}

function episodeInput(id, value) {
  return {
    schema: CURATE_SCHEMAS.episodeInput,
    source: { datasetId: "droid-100", datasetVersion: "1.0.0",
      datasetManifestHash: H("a"), sourceObjectHash: H("b"), licenseId: "CC-BY-4.0",
      attributionHash: H("c") },
    instrument: { extractorId: "droid-rlds-test", extractorVersion: "1.0.0",
      extractorImplementationHash: H("d"), featureSchemaHash: H("e") },
    episodeIdHash: digest(id),
    platformClass: "franka-7dof-teleoperated",
    steps: [0, 1].map((index) => ({
      index, tOffsetMs: index * 67,
      boundary: { isFirst: index === 0, isLast: index === 1, isTerminal: index === 1 },
      observation: { commitment: digest(`${id}:${index}`),
        features: { "joint.position.0": value + index }, images: [] },
      action: { kind: "cartesian-velocity-command", features: { x: value / 100 } },
      outcome: null,
    })),
  };
}

const addSeconds = (value) => new Date(Date.parse(T0) + value * 1_000);

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function stage1Registry(root) {
  const cwd = path.join(root, "workspace");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 1;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: "preserve value", acceptance: "node --test",
    semantic: { objective: "preserve value", successCriteria: ["tests pass"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: H("f") }, baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/test/worker", supervisorCommand: "test supervisor" });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "test supervisor",
    stateRoot: path.join(root, "runs"), binding });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash });
  store.append("contract_compiled", { objective: "preserve value" });
  store.append("contract_audited", { passed: true });
  store.append("contract_frozen", { acceptance: "node --test" });
  store.append("worker_launch", { executable: "test" });
  store.append("boundary_reached", { boundary: "PreToolUse", tool: "Read" });
  store.append("boundary_reached", { boundary: "PostToolUse", tool: "Read", exit: 0 });
  store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0,
    finalFingerprint: baseline.fingerprint });
  store.append("outcome_verdict", { phase: "stop", passed: true,
    finalFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: false,
    acceptancePassed: true, finalFingerprint: baseline.fingerprint, errors: [] });
  store.saveState({ status: "complete", proof: { complete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: false } });
  finalizeStage05Evidence({ directory: store.directory });

  const server = keys();
  const endpoint = "https://contributions.outsider.test";
  const ingress = new ExperienceContributionRegistry({ directory: path.join(root, "ingress"),
    privateKeyPem: server.privateKey, registryId: "shadow-contributions", audience: endpoint });
  const share = initializeShareDirectory({ directory: path.join(root, "share"),
    endpoint, serverPublicKeyPem: server.publicKey, retentionDays: 30, now: addSeconds(0) });
  const devicePrivateKeyPem = readFileSync(path.join(share.directory, "device-private.pem"), "utf8");
  const preview = previewRunContribution(store.directory);
  const attestation = createAttestationV2({ runDirectories: [store.directory],
    privateKeyPem: devicePrivateKeyPem });
  const challenge = ingress.issueChallenge({ deviceKeyId: share.consent.deviceKeyId,
    experienceRecordHash: preview.contributionRecord.recordHash, now: addSeconds(1) });
  const envelope = createContributionEnvelope({ contributionRecord: preview.contributionRecord,
    attestation, consent: share.consent, challenge, devicePrivateKeyPem,
    createdAt: addSeconds(2) });
  const ingested = ingress.ingest(envelope, { now: addSeconds(3) });
  const quarantineExport = {
    schema: "outsider/quarantine-export/v1", registryId: "shadow-contributions",
    generatedAt: addSeconds(10).toISOString(), count: 1,
    items: [{ contributionRecord: preview.contributionRecord, receipt: ingested.receipt,
      registry: ingress.entries.at(-1) }], nextCursor: null,
    useBoundary: { disposition: "QUARANTINED", automaticTraining: false,
      permitsCuratePromotion: false, permitsPricing: false,
      permitsGuarantee: false, permitsSettlement: false },
  };
  let registry = createEvidenceRegistry({ registryId: "shadow-test", createdAt: addSeconds(11) });
  registry = importQuarantineExport({ registry, quarantineExport,
    serverPublicKeyPem: server.publicKey, importedAt: addSeconds(12) }).registry;
  return registry;
}

function inputs() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-shadow-book-"));
  const registry = stage1Registry(root);
  const first = normalizeCurateEpisode(episodeInput("one", 1));
  const second = normalizeCurateEpisode(episodeInput("two", 2));
  const clearances = [clearCurateEpisode(first), clearCurateEpisode(second, { history: [first] })];
  const checkpoint = buildCurateCheckpoint(clearances, { checkpointId: "droid-pilot" });
  return { root, registry, episodes: [first, second], clearances, checkpoint };
}

test("keeps Stage 1 and physical CURATE evidence separate at one ABSTAIN entrance", (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const book = buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    generatedAt: BOOK_TIME });
  const checked = verifyShadowEvidenceBook(book, { evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    now: BOOK_TIME });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.curateDerivationsReverified, true);
  assert.equal(book.streams.supervisedActions.uniqueRuns, 1);
  assert.equal(book.streams.physicalExperience.historicalEpisodes, 2);
  assert.equal(book.streams.physicalExperience.causalExperienceUnits, 0);
  assert.equal(book.separation.pooledAsOneRiskClass, false);
  assert.equal(book.modelEntrance.decision, "ABSTAIN_NO_ADMISSIBLE_L3_L4");
  assert.equal(book.modelEntrance.automaticTraining, false);
  assert.equal(book.authority.price, null);
  assert.equal(book.authority.permitsPricing, false);
});

test("self-verification never pretends it reverified source artifacts", (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const book = buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    generatedAt: BOOK_TIME });
  const checked = verifyShadowEvidenceBook(book, { now: BOOK_TIME });
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceCommitmentInternallyConsistent, true);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.curateDerivationsReverified, false);
  assert.equal(checked.retentionCheckedAt, null);
});

test("tampering, partial source sets and mixed-stream financial authority fail closed", (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const book = buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    generatedAt: BOOK_TIME });
  const financial = structuredClone(book);
  financial.authority.price = 1;
  assert.equal(verifyShadowEvidenceBook(financial).ok, false);
  const pooled = structuredClone(book);
  pooled.separation.pooledAsOneRiskClass = true;
  assert.equal(verifyShadowEvidenceBook(pooled).ok, false);
  assert.match(verifyShadowEvidenceBook(book, { evidenceRegistry: registry,
    now: BOOK_TIME }).error,
    /PARTIAL_SOURCE_SET/);
  const wrongClearances = [clearances[0]];
  assert.throws(() => buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: wrongClearances,
    curateEpisodes: episodes, generatedAt: BOOK_TIME }),
  /CHECKPOINT_INVALID/);
});

test("the two-chain entrance refuses an empty Stage 1 or Stage 1.5 stream", (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const emptyRegistry = createEvidenceRegistry({ registryId: "empty", createdAt: BOOK_TIME });
  assert.throws(() => buildShadowEvidenceBook({ evidenceRegistry: emptyRegistry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    generatedAt: BOOK_TIME }), /STAGE1_EMPTY/);
  const emptyCheckpoint = buildCurateCheckpoint([], { checkpointId: "empty" });
  assert.throws(() => buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: emptyCheckpoint, curateClearances: [], curateEpisodes: [],
    generatedAt: BOOK_TIME }), /STAGE15_EMPTY/);
});

test("resealing cannot forge counts, commitments or an unbounded alert payload", (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    generatedAt: BOOK_TIME });
  const mutations = [
    (book) => { book.sourceCommitment = H("0"); },
    (book) => { book.streams.supervisedActions.candidates += 1; },
    (book) => { book.streams.supervisedActions.outcomes.SAFE_DELIVERY += 1; },
    (book) => { book.streams.physicalExperience.checksExecuted += 1; },
    (book) => { book.streams.physicalExperience.observedAlertCodes = [{ rawSecret: "x" }]; },
    (book) => { book.streams.supervisedActions.correlationRoots = []; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.equal(verifyShadowEvidenceBook(resealBook(changed), { now: BOOK_TIME }).ok, false);
  }
  const signatureClaim = structuredClone(original);
  signatureClaim.streams.supervisedActions.signature = { present: true, keyId: H("9"),
    validity: "SOURCE_ARTIFACT_REVERIFY_REQUIRED", trustedByPolicy: false };
  const selfOnly = verifyShadowEvidenceBook(resealBook(signatureClaim), { now: BOOK_TIME });
  assert.equal(selfOnly.ok, true);
  assert.equal(selfOnly.sourceArtifactsReverified, false);
  assert.equal(verifyShadowEvidenceBook(resealBook(signatureClaim), {
    evidenceRegistry: registry, curateCheckpoint: checkpoint,
    curateClearances: clearances, curateEpisodes: episodes, now: BOOK_TIME,
  }).ok, false);
});

test("full source verification checks Stage 1 retention at use time", (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const book = buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    generatedAt: BOOK_TIME });
  const expired = verifyShadowEvidenceBook(book, { evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    now: "2035-09-21T00:00:00.000Z" });
  assert.equal(expired.ok, false);
  assert.match(expired.error, /REGISTRY_INVALID.*EXPIRED/);
});

test("a stable physical source identity cannot be projected twice for extra credit", (t) => {
  const { root, registry } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = normalizeCurateEpisode(episodeInput("same", 1));
  const conflictingProjection = normalizeCurateEpisode(episodeInput("same", 9));
  assert.notEqual(first.episodeHash, conflictingProjection.episodeHash);
  const clearances = [clearCurateEpisode(first), clearCurateEpisode(conflictingProjection)];
  const checkpoint = buildCurateCheckpoint(clearances, { checkpointId: "identity-conflict" });
  assert.throws(() => buildShadowEvidenceBook({ evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances,
    curateEpisodes: [first, conflictingProjection], generatedAt: BOOK_TIME }),
  /SOURCE_EPISODE_IDENTITY_CONFLICT/);
});

test("CLI builds an atomic fully rebound book and the public verifier refuses local schemas", (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    registry: path.join(root, "registry.json"), checkpoint: path.join(root, "checkpoint.json"),
    clearances: path.join(root, "clearances.json"), episodes: path.join(root, "episodes.json"),
    output: path.join(root, "book.json"),
  };
  for (const [name, value] of [["registry", registry], ["checkpoint", checkpoint],
    ["clearances", clearances], ["episodes", episodes]]) {
    writeFileSync(files[name], JSON.stringify(value));
  }
  const built = spawnSync(process.execPath, ["scripts/stage1-shadow-evidence-book.mjs",
    "--registry", files.registry, "--checkpoint", files.checkpoint,
    "--clearances", files.clearances, "--episodes", files.episodes,
    "--out", files.output, "--generated-at", BOOK_TIME],
  { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(JSON.parse(built.stdout).decision, "ABSTAIN_NO_ADMISSIBLE_L3_L4");
  const book = JSON.parse(readFileSync(files.output, "utf8"));
  assert.equal(verifyShadowEvidenceBook(book, { evidenceRegistry: registry,
    curateCheckpoint: checkpoint, curateClearances: clearances, curateEpisodes: episodes,
    now: BOOK_TIME }).ok, true);
  const generic = spawnSync(process.execPath, ["bin/outsider.mjs", "verify", files.output,
    "--now", BOOK_TIME], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(generic.status, 1, generic.stderr);
  const genericResult = JSON.parse(generic.stdout);
  assert.equal(genericResult.ok, false);
  assert.equal(genericResult.error, "UNSUPPORTED_SCHEMA");
  assert.equal(genericResult.verificationMode, "NO_VERIFIER_DISPATCHED");
  assert.equal(genericResult.sourceArtifactsReverified, false);
  const overwrite = spawnSync(process.execPath, ["scripts/stage1-shadow-evidence-book.mjs",
    "--registry", files.registry, "--checkpoint", files.checkpoint,
    "--clearances", files.clearances, "--episodes", files.episodes,
    "--out", files.output, "--generated-at", BOOK_TIME],
  { cwd: process.cwd(), encoding: "utf8" });
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /OUTPUT_EXISTS/);
});

test("concurrent shadow builders cannot both claim the same output", async (t) => {
  const { root, registry, episodes, clearances, checkpoint } = inputs();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    registry: path.join(root, "registry.json"), checkpoint: path.join(root, "checkpoint.json"),
    clearances: path.join(root, "clearances.json"), episodes: path.join(root, "episodes.json"),
    output: path.join(root, "concurrent-book.json"),
  };
  for (const [name, value] of [["registry", registry], ["checkpoint", checkpoint],
    ["clearances", clearances], ["episodes", episodes]]) {
    writeFileSync(files[name], JSON.stringify(value));
  }
  const args = ["scripts/stage1-shadow-evidence-book.mjs",
    "--registry", files.registry, "--checkpoint", files.checkpoint,
    "--clearances", files.clearances, "--episodes", files.episodes,
    "--out", files.output, "--generated-at", BOOK_TIME];
  const results = await Promise.all([runChild(args), runChild(args)]);
  assert.deepEqual(results.map((item) => item.status).sort(), [0, 1]);
  assert.match(results.find((item) => item.status !== 0).stderr, /OUTPUT_EXISTS/);
  assert.equal(verifyShadowEvidenceBook(JSON.parse(readFileSync(files.output, "utf8")), {
    evidenceRegistry: registry, curateCheckpoint: checkpoint, curateClearances: clearances,
    curateEpisodes: episodes, now: BOOK_TIME,
  }).ok, true);
});
