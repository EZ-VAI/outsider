import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";
import { freezeContract } from "../src/outsider-work-contract.js";
import {
  createAttestationV2, createStage05ControlledWayBinding, finalizeStage05Evidence,
} from "../src/outsider-stage05-evidence.js";
import {
  CONTRIBUTION_PURPOSES, ExperienceContributionRegistry,
  createContributionRevocationReceipt, createContributionRevocation,
  contributionDigest, createContributionEnvelope, createContributionRecord,
  initializeShareDirectory, previewRunContribution, readShareState,
  sendContributionRevocation, sendRunContribution, setShareEnabled,
  verifyContributionEnvelope, verifyContributionReceipt, verifyContributionRecord,
  verifyContributionRevocationReceipt,
} from "../src/outsider-experience-contribution.js";

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function sealedRun() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-contribution-"));
  const cwd = path.join(root, "workspace");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 2;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: "keep value exact", acceptance: "node --test",
    semantic: { objective: "keep value exact", successCriteria: ["tests pass"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: contributionDigest("contract-audit") },
    baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/test/worker", supervisorCommand: "test supervisor" });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "test supervisor",
    stateRoot: path.join(root, "runs"), binding });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash });
  store.append("contract_compiled", { objective: "keep value exact" });
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
  const evidence = finalizeStage05Evidence({ directory: store.directory });
  return { root, store, evidence };
}

function setup() {
  const fixture = sealedRun();
  const serverKeys = keys();
  const deviceRoot = path.join(fixture.root, "share");
  const endpoint = "https://contributions.outsider.test";
  const share = initializeShareDirectory({ directory: deviceRoot, endpoint,
    serverPublicKeyPem: serverKeys.publicKey, purposes: CONTRIBUTION_PURPOSES,
    retentionDays: 90, now: "2026-08-19T00:00:00.000Z" });
  const registry = new ExperienceContributionRegistry({
    directory: path.join(fixture.root, "server"), privateKeyPem: serverKeys.privateKey,
    audience: endpoint,
    acceptedInstrumentHashes: [fixture.evidence.binding.source.controllerImplementationHash],
  });
  return { ...fixture, serverKeys, deviceRoot, endpoint, share, registry };
}

test("contribution projection is an exact privacy allowlist, not the local record", () => {
  const fixture = sealedRun();
  const sourceFile = path.join(fixture.store.directory, "stage05-supervised-experience.json");
  const experience = JSON.parse(readFileSync(sourceFile, "utf8"));
  const { recordHash: ignored, ...body } = experience;
  const extended = { ...body, rawPrompt: "PRIVATE_PROMPT_MUST_NOT_UPLOAD" };
  extended.recordHash = contributionDigest(extended);
  const record = createContributionRecord(extended);
  assert.equal(verifyContributionRecord(record).ok, true);
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE_PROMPT_MUST_NOT_UPLOAD|rawPrompt/);
  assert.equal(record.disclosure.rawContentIncluded, false);
  assert.equal(record.disclosure.permitsPricing, false);
  const injected = structuredClone(record);
  injected.capacity.rawTranscript = "secret";
  const { recordHash, ...injectedBody } = injected;
  injected.recordHash = contributionDigest(injectedBody);
  assert.equal(verifyContributionRecord(injected).ok, false,
    "unknown nested fields cannot hitchhike inside a rehashed record");
});

test("sharing is explicit, local, disableable and never enables automatic upload", () => {
  const fixture = setup();
  const state = readShareState(fixture.deviceRoot);
  assert.equal(state.ok, true);
  assert.equal(state.config.enabled, true);
  assert.equal(state.config.explicitSendOnly, true);
  assert.equal(state.consent.automaticUpload, false);
  assert.equal(state.consent.rawContentAllowed, false);
  assert.equal(state.consent.retentionDays, 90);
  const disabled = setShareEnabled(fixture.deviceRoot, false,
    { now: "2026-08-19T00:01:00.000Z" });
  assert.equal(disabled.config.enabled, false);
  assert.equal(disabled.consent.consentHash, state.consent.consentHash);
});

test("challenge-bound device envelope is quarantined, deduplicated and signed", () => {
  const fixture = setup();
  const preview = previewRunContribution(fixture.store.directory);
  const privateKeyPem = readFileSync(path.join(fixture.deviceRoot, "device-private.pem"), "utf8");
  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory],
    privateKeyPem });
  const challenge = fixture.registry.issueChallenge({
    deviceKeyId: fixture.share.config.deviceKeyId,
    experienceRecordHash: preview.contributionRecord.recordHash,
    now: "2026-08-19T00:02:00.000Z",
  });
  const envelope = createContributionEnvelope({ contributionRecord: preview.contributionRecord,
    attestation, consent: fixture.share.consent, challenge,
    devicePrivateKeyPem: privateKeyPem, createdAt: "2026-08-19T00:02:01.000Z" });
  assert.equal(verifyContributionEnvelope(envelope, { challenge,
    serverPublicKeyPem: fixture.serverKeys.publicKey,
    expectedAudience: fixture.endpoint, now: "2026-08-19T00:02:01.000Z" }).ok, true);
  const result = fixture.registry.ingest(envelope, { now: "2026-08-19T00:02:02.000Z" });
  assert.equal(result.appended, true);
  assert.equal(result.receipt.disposition, "QUARANTINED");
  assert.equal(result.receipt.evidenceLevel, "L2_RECOGNIZED_INSTRUMENT_SELF_ATTESTED");
  assert.equal(result.receipt.eligibleFor.pricing, false);
  assert.equal(verifyContributionReceipt(result.receipt,
    { serverPublicKeyPem: fixture.serverKeys.publicKey }).ok, true);
  assert.equal(fixture.registry.verify().ok, true);
  assert.throws(() => fixture.registry.ingest(envelope,
    { now: "2026-08-19T00:02:03.000Z" }), /CHALLENGE_ALREADY_USED/);

  const challenge2 = fixture.registry.issueChallenge({
    deviceKeyId: fixture.share.config.deviceKeyId,
    experienceRecordHash: preview.contributionRecord.recordHash,
    now: "2026-08-19T00:03:00.000Z",
  });
  const duplicateEnvelope = createContributionEnvelope({
    contributionRecord: preview.contributionRecord, attestation,
    consent: fixture.share.consent, challenge: challenge2,
    devicePrivateKeyPem: privateKeyPem, createdAt: "2026-08-19T00:03:01.000Z" });
  const duplicate = fixture.registry.ingest(duplicateEnvelope,
    { now: "2026-08-19T00:03:02.000Z" });
  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(fixture.registry.verify().ok, true);
});

test("send vertical slice pins the server key and persists a verified receipt", async () => {
  const fixture = setup();
  const fakeFetch = async (url, init) => {
    const input = JSON.parse(init.body);
    if (url.endsWith("/challenge")) {
      const challenge = fixture.registry.issueChallenge({ ...input,
        now: "2026-08-19T00:04:00.000Z" });
      return { ok: true, status: 200, json: async () => challenge };
    }
    const result = fixture.registry.ingest(input, { now: "2026-08-19T00:04:02.000Z" });
    return { ok: true, status: 200, json: async () => result };
  };
  const result = await sendRunContribution({ runDirectory: fixture.store.directory,
    shareDirectory: fixture.deviceRoot, fetchImpl: fakeFetch,
    now: "2026-08-19T00:04:01.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.disposition, "QUARANTINED");
  assert.equal(readShareState(fixture.deviceRoot).ok, true);
  const persisted = readFileSync(path.join(fixture.deviceRoot, "receipts",
    `${result.receipt.receiptHash.slice("sha256:".length)}.json`), "utf8");
  assert.equal(JSON.parse(persisted).receiptHash, result.receipt.receiptHash);
});

test("signed revocation acknowledgment binds erasure without claiming settlement authority", async () => {
  const fixture = setup();
  const fakeFetch = async (url, init) => {
    assert.match(url, /\/v1\/contributions\/revocations$/);
    const revocation = JSON.parse(init.body);
    const acknowledgment = createContributionRevocationReceipt({ revocation,
      deletedContributions: 3, privateKeyPem: fixture.serverKeys.privateKey,
      processedAt: "2026-08-19T00:05:01.000Z" });
    return { ok: true, status: 200, json: async () => acknowledgment };
  };
  const result = await sendContributionRevocation({ shareDirectory: fixture.deviceRoot,
    reason: "USER_REQUEST", fetchImpl: fakeFetch,
    now: "2026-08-19T00:05:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.acknowledgment.deletedContributions, 3);
  assert.equal(result.acknowledgment.futureUseBlocked, true);
  assert.equal(result.acknowledgment.authority, "none");
  assert.equal(verifyContributionRevocationReceipt(result.acknowledgment,
    { serverPublicKeyPem: fixture.serverKeys.publicKey }).ok, true);
  assert.equal(readShareState(fixture.deviceRoot).config.enabled, false);

  const forged = createContributionRevocation({ shareDirectory: fixture.deviceRoot,
    reason: "SECOND_REQUEST", now: "2026-08-19T00:06:00.000Z" });
  const wrong = createContributionRevocationReceipt({ revocation: forged,
    deletedContributions: 0, privateKeyPem: keys().privateKey,
    processedAt: "2026-08-19T00:06:01.000Z" });
  assert.equal(verifyContributionRevocationReceipt(wrong,
    { serverPublicKeyPem: fixture.serverKeys.publicKey }).ok, false);
});

test("record hashes are strict canonical commitments", () => {
  const fixture = sealedRun();
  const preview = previewRunContribution(fixture.store.directory);
  assert.equal(preview.contributionRecord.recordHash,
    contributionDigest(Object.fromEntries(Object.entries(preview.contributionRecord)
      .filter(([key]) => key !== "recordHash"))));
  assert.doesNotThrow(() => canonicalizeStrict(preview.contributionRecord));
});

test("public CLI previews before consent and requires an explicit policy acceptance", () => {
  const fixture = sealedRun();
  const cli = path.resolve("bin/outsider.mjs");
  const preview = spawnSync(process.execPath, [cli, "share", "preview", fixture.store.runId,
    "--state-root", path.join(fixture.root, "runs")], { encoding: "utf8" });
  assert.equal(preview.status, 0, preview.stderr);
  const previewRecord = JSON.parse(preview.stdout);
  assert.equal(previewRecord.disclosure.rawContentIncluded, false);
  assert.equal(previewRecord.note.includes("No network request"), true);

  const serverKeys = keys();
  const serverKeyFile = path.join(fixture.root, "server-public.pem");
  const shareRoot = path.join(fixture.root, "cli-share");
  writeFileSync(serverKeyFile, serverKeys.publicKey);
  const refused = spawnSync(process.execPath, [cli, "share", "enable",
    "--endpoint", "https://contributions.outsider.test",
    "--server-public-key", serverKeyFile, "--share-root", shareRoot],
  { encoding: "utf8" });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /explicit --accept-policy/);

  const enabled = spawnSync(process.execPath, [cli, "share", "enable",
    "--endpoint", "https://contributions.outsider.test",
    "--server-public-key", serverKeyFile, "--share-root", shareRoot,
    "--accept-policy"], { encoding: "utf8" });
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(JSON.parse(enabled.stdout).automaticUpload, false);
  const status = spawnSync(process.execPath, [cli, "share", "status",
    "--share-root", shareRoot], { encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).enabled, true);
  const disabled = spawnSync(process.execPath, [cli, "share", "disable",
    "--share-root", shareRoot], { encoding: "utf8" });
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.equal(JSON.parse(disabled.stdout).enabled, false);
});
