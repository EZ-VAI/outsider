import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { snapshotWorkspace, RunStore } from "../src/outsider-kernel-store.js";
import { freezeContract } from "../src/outsider-work-contract.js";
import {
  createAttestationV2, createStage05ControlledWayBinding, finalizeStage05Evidence,
} from "../src/outsider-stage05-evidence.js";
import {
  contributionDigest, createContributionEnvelope, ExperienceContributionRegistry,
  initializeShareDirectory, previewRunContribution,
} from "../src/outsider-experience-contribution.js";
import {
  createEvidenceRegistry, evidenceRegistryDigest, evidenceRegistryReport, importQuarantineExport,
  pruneExpiredEvidenceRegistry, verifyEvidenceRecord, verifyEvidenceRegistry,
} from "../src/outsider-evidence-registry.js";

// RunStore timestamps are real wall-clock values. Keep the synthetic receipt
// epoch safely after them so this fixture cannot become invalid as the test day advances.
const T0 = "2035-08-20T00:00:00.000Z";
const addSeconds = (amount) => new Date(Date.parse(T0) + amount * 1_000);

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function sealedRuns(root, name, count) {
  const cwd = path.join(root, name);
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), `export const value = ${JSON.stringify(name)};\n`);
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: `preserve ${name}`, acceptance: "node --test",
    semantic: { objective: `preserve ${name}`, successCriteria: ["tests pass"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true,
      evidenceHash: `sha256:${"a".repeat(63)}${name === "domain-a" ? "1" : "2"}` },
    baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/test/worker", supervisorCommand: "test supervisor" });
  return Array.from({ length: count }, () => {
    const store = RunStore.create({ cwd, contract, supervisorCommand: "test supervisor",
      stateRoot: path.join(root, "runs"), binding });
    store.writeJson("baseline.json", baseline);
    store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash });
    store.append("contract_compiled", { objective: `preserve ${name}` });
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
    return store.directory;
  });
}

function contributionFixture({ domains = [["domain-a", 2], ["domain-b", 1]],
  serverKeys = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stage1-registry-"));
  const server = serverKeys ?? keys();
  const audience = "https://contributions.outsider.test";
  const ingress = new ExperienceContributionRegistry({ directory: path.join(root, "ingress"),
    privateKeyPem: server.privateKey, registryId: "test-contributions", audience });
  const share = initializeShareDirectory({ directory: path.join(root, "share"), endpoint: audience,
    serverPublicKeyPem: server.publicKey, retentionDays: 30, now: addSeconds(0) });
  const devicePrivateKeyPem = readFileSync(path.join(share.directory, "device-private.pem"), "utf8");
  const entries = [];
  let tick = 1;
  for (const [name, count] of domains) {
    for (const directory of sealedRuns(root, name, count)) {
      const preview = previewRunContribution(directory);
      const attestation = createAttestationV2({ runDirectories: [directory],
        privateKeyPem: devicePrivateKeyPem });
      const challenge = ingress.issueChallenge({ deviceKeyId: share.consent.deviceKeyId,
        experienceRecordHash: preview.contributionRecord.recordHash, now: addSeconds(tick++) });
      const envelope = createContributionEnvelope({ contributionRecord: preview.contributionRecord,
        attestation, consent: share.consent, challenge,
        devicePrivateKeyPem, createdAt: addSeconds(tick++) });
      const ingested = ingress.ingest(envelope, { now: addSeconds(tick++) });
      entries.push({ contributionRecord: preview.contributionRecord,
        receipt: ingested.receipt, registry: ingress.entries.at(-1) });
    }
  }
  const exportPage = (items, generatedAt = addSeconds(tick++).toISOString()) => ({
    schema: "outsider/quarantine-export/v1", registryId: "test-contributions",
    generatedAt, count: items.length, items, nextCursor: null,
    useBoundary: { disposition: "QUARANTINED", automaticTraining: false,
      permitsCuratePromotion: false, permitsPricing: false,
      permitsGuarantee: false, permitsSettlement: false },
  });
  return { root, server, entries, exportPage };
}

function resealEvidenceRecord(record) {
  record.groupKeyHash = evidenceRegistryDigest(record.groupKey);
  record.commitment = evidenceRegistryDigest({ groupKey: record.groupKey,
    included: record.included, duplicates: record.duplicates, outcomes: record.outcomes,
    correlation: record.correlation });
  const { evidenceRecordHash: ignored, ...body } = record;
  record.evidenceRecordHash = evidenceRegistryDigest(body);
  return record;
}

test("Stage 1 registry verifies imports, discloses D1 duplicates and never crosses D2", () => {
  const fixture = contributionFixture();
  let registry = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20) });
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage(fixture.entries.slice(0, 2), addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22) }).registry;
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage([fixture.entries[1]], addSeconds(23).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(24) }).registry;
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage([fixture.entries[2]], addSeconds(25).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(26) }).registry;

  const checked = verifyEvidenceRegistry(registry, { now: addSeconds(27) });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(registry.counts.candidates, 4);
  assert.equal(registry.counts.nUnique, 3);
  assert.equal(registry.counts.duplicates, 1);
  assert.equal(registry.counts.groups, 2);
  assert.equal(registry.evidenceRecords.length, 2);
  const first = registry.evidenceRecords.find((record) => record.nUnique === 2);
  assert.ok(first);
  assert.equal(first.nCandidates, 3);
  assert.equal(first.duplicates.length, 1);
  assert.equal(first.correlation.independenceClaimed, false);
  assert.ok(first.correlation.correlationRoots.includes(first.groupKey.controllerImplementationHash));
  assert.equal(verifyEvidenceRecord(first).ok, true);
  assert.notEqual(registry.evidenceRecords[0].groupKeyHash,
    registry.evidenceRecords[1].groupKeyHash);
  assert.equal(evidenceRegistryReport(registry, { now: addSeconds(27) }).counts.duplicates, 1);
});

test("Stage 1 registry rejects expired, revoked, non-quarantine and damaged evidence atomically", () => {
  const fixture = contributionFixture({ domains: [["domain-a", 1]] });
  const empty = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20) });
  const page = fixture.exportPage(fixture.entries, addSeconds(21).toISOString());
  const cases = [
    ["expired", structuredClone(page), new Date(Date.parse(T0) + 31 * 86_400_000)],
    ["revoked", structuredClone(page), addSeconds(22)],
    ["non-quarantine", structuredClone(page), addSeconds(22)],
    ["record", structuredClone(page), addSeconds(22)],
    ["receipt", structuredClone(page), addSeconds(22)],
    ["entry", structuredClone(page), addSeconds(22)],
  ];
  cases[1][1].items[0].revokedAt = addSeconds(21).toISOString();
  cases[2][1].items[0].registry.disposition = "RELEASED";
  cases[3][1].items[0].contributionRecord.terminal.proofComplete = false;
  cases[4][1].items[0].receipt.signature.value = `${"A".repeat(84)}==`;
  cases[5][1].items[0].registry.entryHash = `sha256:${"0".repeat(64)}`;
  for (const [label, artifact, now] of cases) {
    assert.throws(() => importQuarantineExport({ registry: empty, quarantineExport: artifact,
      serverPublicKeyPem: fixture.server.publicKey, importedAt: now }),
    /EXPIRED|REVOKED|QUARANTINE|INVALID|BROKEN|TAMPERED/, label);
  }
  assert.throws(() => importQuarantineExport({ registry: empty,
    quarantineExport: fixture.exportPage([], addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22) }),
  /EXPORT_INVALID/);
  assert.equal(empty.counts.nUnique, 0);
});

test("Stage 1 registry verifies source chain links across separate export pages", () => {
  const fixture = contributionFixture({ domains: [["domain-a", 2]] });
  let registry = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20) });
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage([fixture.entries[0]], addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22) }).registry;
  const damaged = structuredClone(fixture.entries[1]);
  damaged.registry.previousEntryHash = `sha256:${"0".repeat(64)}`;
  const { entryHash: ignored, ...entryBody } = damaged.registry;
  damaged.registry.entryHash = contributionDigest(entryBody);
  assert.throws(() => importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage([damaged], addSeconds(23).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(24) }),
  /SOURCE_CHAIN_BROKEN/);
  assert.equal(registry.counts.nUnique, 1);
});

test("Stage 1 registry is hash-bound, optionally signed and CLI-verifiable", () => {
  const fixture = contributionFixture({ domains: [["domain-a", 1]] });
  const signer = keys();
  let registry = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20),
    privateKeyPem: signer.privateKey });
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage(fixture.entries, addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22),
    privateKeyPem: signer.privateKey }).registry;
  const signedCheck = verifyEvidenceRegistry(registry, { now: addSeconds(23) });
  assert.equal(signedCheck.signed, true);
  assert.equal(signedCheck.signatureCryptographicallyValid, true);
  assert.equal(signedCheck.signatureTrustedByPolicy, false);
  const stripped = structuredClone(registry);
  stripped.signature = false;
  assert.equal(verifyEvidenceRegistry(stripped, { now: addSeconds(23) }).ok, false);
  const malleatedSignature = structuredClone(registry);
  malleatedSignature.signature.value += "!!";
  assert.equal(verifyEvidenceRegistry(malleatedSignature, { now: addSeconds(23) }).ok, false);
  const forged = structuredClone(registry);
  forged.evidenceRecords[0].outcomes.SAFE_DELIVERY = 99;
  assert.equal(verifyEvidenceRegistry(forged, { now: addSeconds(23) }).ok, false);

  const exportFile = path.join(fixture.root, "export.json");
  const stateFile = path.join(fixture.root, "registry.json");
  const publicKeyFile = path.join(fixture.root, "server-public.pem");
  writeFileSync(exportFile, JSON.stringify(
    fixture.exportPage(fixture.entries, addSeconds(24).toISOString())));
  writeFileSync(publicKeyFile, fixture.server.publicKey);
  const cli = path.resolve("bin/outsider.mjs");
  const imported = spawnSync(process.execPath, [cli, "registry", "import", exportFile,
    "--state", stateFile, "--server-public-key", publicKeyFile,
    "--registry-id", "cli-stage1", "--now", addSeconds(25).toISOString()],
  { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).nUnique, 1);
  const stateBeforeLockProbe = readFileSync(stateFile, "utf8");
  writeFileSync(`${stateFile}.lock`, "held by another importer\n");
  const locked = spawnSync(process.execPath, [cli, "registry", "import", exportFile,
    "--state", stateFile, "--server-public-key", publicKeyFile,
    "--now", addSeconds(25).toISOString()], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(locked.status, 1);
  assert.match(locked.stderr, /STATE_LOCKED/);
  assert.equal(readFileSync(stateFile, "utf8"), stateBeforeLockProbe);
  rmSync(`${stateFile}.lock`);
  for (const args of [["registry", "report", "--state", stateFile,
    "--now", addSeconds(26).toISOString()], ["registry", "verify", "--state", stateFile,
    "--now", addSeconds(26).toISOString()], ["verify", stateFile,
    "--now", addSeconds(26).toISOString()]]) {
    const result = spawnSync(process.execPath, [cli, ...args],
      { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, `${args.join(" ")}: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).ok, true);
  }
  const pruneAt = new Date(Date.parse(T0) + 31 * 86_400_000).toISOString();
  const pruned = spawnSync(process.execPath, [cli, "registry", "prune-expired",
    "--state", stateFile, "--now", pruneAt], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(pruned.status, 0, pruned.stderr);
  assert.equal(JSON.parse(pruned.stdout).payloadsPurged, 1);
  const prunedState = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(prunedState.imports.length, 0);
  assert.equal(prunedState.retentionTombstones.length, 1);
  const verifiedAfterPrune = spawnSync(process.execPath, [cli, "registry", "verify",
    "--state", stateFile, "--now", pruneAt], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(verifiedAfterPrune.status, 0, verifiedAfterPrune.stderr);
});

test("Stage 1 standalone EvidenceRecord verifier enforces bounded privacy-safe occurrences", () => {
  const fixture = contributionFixture({ domains: [["domain-a", 1]] });
  let registry = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20) });
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage(fixture.entries, addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22) }).registry;
  const valid = registry.evidenceRecords[0];
  assert.equal(verifyEvidenceRecord(valid).ok, true);
  assert.equal(valid.included[0].evidenceLevel,
    "L1_UNRECOGNIZED_INSTRUMENT_SELF_ATTESTED");

  const rawLeak = structuredClone(valid);
  rawLeak.included[0].rawPrompt = "private prompt must not enter Stage 1";
  resealEvidenceRecord(rawLeak);
  assert.equal(verifyEvidenceRecord(rawLeak).ok, false);

  const invalidGroup = structuredClone(valid);
  invalidGroup.groupKey.extractorId = "not a bounded token";
  resealEvidenceRecord(invalidGroup);
  assert.equal(verifyEvidenceRecord(invalidGroup).ok, false);
});

test("Stage 1 rejects non-Ed25519 keys instead of mislabelling their signatures", () => {
  const ec = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  assert.throws(() => createEvidenceRegistry({ registryId: "stage1-test",
    createdAt: addSeconds(20), privateKeyPem: ec.privateKey }), /NOT_ED25519/);

  const fixture = contributionFixture({ domains: [["domain-a", 1]], serverKeys: ec });
  const registry = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20) });
  assert.throws(() => importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage(fixture.entries, addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22) }),
  /SERVER_KEY_INVALID/);
});

test("Stage 1 retention pruning removes copied payloads and keeps only hash tombstones", () => {
  const fixture = contributionFixture({ domains: [["domain-a", 1]] });
  const signer = keys();
  let registry = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20),
    privateKeyPem: signer.privateKey });
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage(fixture.entries, addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22),
    privateKeyPem: signer.privateKey }).registry;
  const afterRetention = new Date(Date.parse(T0) + 31 * 86_400_000);
  assert.equal(verifyEvidenceRegistry(registry, { now: afterRetention }).ok, false);
  assert.throws(() => pruneExpiredEvidenceRegistry({ registry, prunedAt: afterRetention }),
    /SIGNING_KEY_REQUIRED/);

  const result = pruneExpiredEvidenceRegistry({ registry, prunedAt: afterRetention,
    privateKeyPem: signer.privateKey });
  assert.equal(result.pruned, true);
  assert.equal(result.pagesPurged, 1);
  assert.equal(result.payloadsPurged, 1);
  assert.equal(result.registry.imports.length, 0);
  assert.equal(result.registry.evidenceRecords.length, 0);
  assert.equal(result.registry.retentionTombstones.length, 1);
  assert.equal(verifyEvidenceRegistry(result.registry, { now: afterRetention }).ok, true);
  const retained = JSON.stringify(result.registry.retentionTombstones[0]);
  assert.doesNotMatch(retained, /contributionRecord|quarantineExport|publicKeyPem|reasonCodes/);

  const damaged = structuredClone(result.registry);
  damaged.retentionTombstones[0].expiredRecordHashes[0] = `sha256:${"0".repeat(64)}`;
  assert.equal(verifyEvidenceRegistry(damaged, { now: afterRetention }).ok, false);
});

test("Stage 1 retention compaction re-derives active evidence without expired pages", () => {
  const fixture = contributionFixture({ domains: [["domain-a", 2]] });
  let registry = createEvidenceRegistry({ registryId: "stage1-test", createdAt: addSeconds(20) });
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage([fixture.entries[0]], addSeconds(21).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(22) }).registry;
  registry = importQuarantineExport({ registry,
    quarantineExport: fixture.exportPage([fixture.entries[1]], addSeconds(23).toISOString()),
    serverPublicKeyPem: fixture.server.publicKey, importedAt: addSeconds(24) }).registry;
  assert.equal(registry.counts.nUnique, 2);

  const betweenExpiries = new Date(Date.parse(T0) + 30 * 86_400_000 + 4_000);
  const compacted = pruneExpiredEvidenceRegistry({ registry, prunedAt: betweenExpiries });
  assert.equal(compacted.pagesPurged, 1);
  assert.equal(compacted.payloadsPurged, 1);
  assert.equal(compacted.registry.imports.length, 1);
  assert.equal(compacted.registry.counts.nUnique, 1);
  assert.equal(compacted.registry.evidenceRecords[0].nUnique, 1);
  assert.equal(compacted.registry.claimBoundary.retentionEnforcement,
    "MANUAL_PRUNE_REQUIRED");
  assert.equal(compacted.registry.claimBoundary.verifiesLiveRevocationAfterImport, false);
  assert.equal(verifyEvidenceRegistry(compacted.registry, { now: betweenExpiries }).ok, true);
  assert.throws(() => pruneExpiredEvidenceRegistry({ registry: compacted.registry,
    prunedAt: addSeconds(23) }), /TIME_ROLLBACK/);
});
