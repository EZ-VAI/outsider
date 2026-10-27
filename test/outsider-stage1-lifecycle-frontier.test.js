import assert from "node:assert/strict";
import {
  createPrivateKey, generateKeyPairSync, sign as cryptoSign,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  DurableStage1CurateCorpusRegistry, createCorpusArtifactSet,
} from "../src/outsider-corpus-registry.js";
import { buildNhtsaSgoIncidentCorpusArtifactSetFromSource } from
  "../src/outsider-nhtsa-corpus-registry-intake.js";
import { snapshotWorkspace, RunStore } from "../src/outsider-kernel-store.js";
import { freezeContract } from "../src/outsider-work-contract.js";
import {
  createStage05ControlledWayBinding, finalizeStage05Evidence,
} from "../src/outsider-stage05-evidence.js";
import {
  STAGE1_CORPUS_PROFILE_IDS, STAGE1_CORPUS_PROFILES,
  STAGE1_LIFECYCLE_SCHEMAS, STAGE1_PROVIDER_INTERFACES,
  STAGE1_PROVIDER_RECEIPT_GENESIS, STAGE1_SOURCE_RECEIPT_GENESIS,
  Stage1ProviderVerifierRegistry,
  commitStage1LifecycleEvaluation, createDefaultStage1ProviderVerifierRegistry,
  createSignedStage1ProviderReceipt, createStage1LifecyclePolicy,
  createStage1LifecycleState, createStage1SourceVerifierReceipt,
  finalizeStage1LifecyclePoll, prepareStage1LifecyclePoll,
  stage1ExactCorpusProfile,
  stage1LifecycleDigest, stage1LifecycleKeyId, stage1SourceVerifierImplementationHash,
  verifyStage1CorpusRegistryLifecycleStructure, verifyStage1LifecycleState,
  verifyStage1ExactCorpusProfile, verifyStage1SourceVerifierReceipt,
} from "../src/outsider-stage1-lifecycle-frontier.js";

const T0 = "2036-01-01T00:00:00.000Z";
const at = (seconds) => new Date(Date.parse(T0) + seconds * 1_000).toISOString();
const h = (value) => stage1LifecycleDigest(String(value));

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function history(key, validFrom = at(-100), validUntil = at(10_000), revokedAt = null) {
  return [{ keyId: stage1LifecycleKeyId(key.publicKey), publicKeyPem: key.publicKey,
    validFrom, validUntil, revokedAt }];
}

function sealedRun() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stage1-lifecycle-"));
  const cwd = path.join(root, "workspace");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 2;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: "deliver independently verified work",
    acceptance: "node --test", semantic: { objective: "deliver verified work",
      successCriteria: ["tests pass"], architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: h("audit") }, baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/test/worker", supervisorCommand: "test supervisor" });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "test supervisor",
    stateRoot: path.join(root, "runs"), binding });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash,
    createdBeforeWorker: true });
  store.append("contract_compiled", { objective: "deliver verified work" });
  store.append("contract_audited", { passed: true, evidenceHash: h("audit") });
  store.append("contract_frozen", { acceptance: "node --test" });
  store.append("worker_launch", { executable: "test" });
  store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0 });
  store.append("outcome_verdict", { phase: "stop", passed: true,
    finalFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: true,
    acceptancePassed: true, finalFingerprint: baseline.fingerprint, errors: [] });
  store.saveState({ status: "complete", proof: { complete: true, deliveryComplete: true,
    interventionRequired: false, interventionComplete: true } });
  finalizeStage05Evidence({ directory: store.directory });
  return { root, runDirectory: store.directory };
}

function setup({ sourceKeyHistory = null, providerKeyHistory = null } = {}) {
  const run = sealedRun();
  const sourceOld = keys();
  const providerKeys = {
    TIMESTAMP: keys(), MEMBERSHIP: keys(), REVOCATION: keys(), RETENTION: keys(),
  };
  const registry = createDefaultStage1ProviderVerifierRegistry();
  const interfaceFor = {
    TIMESTAMP: STAGE1_PROVIDER_INTERFACES.timestamp,
    MEMBERSHIP: STAGE1_PROVIDER_INTERFACES.membership,
    REVOCATION: STAGE1_PROVIDER_INTERFACES.revocation,
    RETENTION: STAGE1_PROVIDER_INTERFACES.retention,
  };
  const providers = Object.keys(providerKeys).map((capability) => {
    const interfaceId = interfaceFor[capability];
    const profile = registry.describe(interfaceId, "1.0.0");
    return { providerId: `${capability.toLowerCase()}-provider`, capability,
      interfaceId, adapterVersion: "1.0.0", interfaceProfileHash: profile.profileHash,
      required: true, maxReceiptAgeSeconds: 300,
      keyHistory: providerKeyHistory?.[capability] ?? history(providerKeys[capability]) };
  });
  const policy = createStage1LifecyclePolicy({ policyId: "stage1-test-policy",
    policyVersion: "1.0.0", effectiveFrom: at(-50), effectiveUntil: at(5_000),
    sourceVerifiers: [{ verifierId: "operator-source-verifier",
      interfaceId: STAGE1_PROVIDER_INTERFACES.sourceReplay, adapterVersion: "1.0.0",
      allowedImplementationHashes: [stage1SourceVerifierImplementationHash()],
      maxReceiptAgeSeconds: 300,
      keyHistory: sourceKeyHistory ?? history(sourceOld) }], providers });
  const state = createStage1LifecycleState({ frontierId: "stage1-test-frontier",
    policy, createdAt: at(0) });
  return { ...run, sourceOld, providerKeys, registry, policy, state };
}

function sourceReceipt(fixture, { key = fixture.sourceOld, verifiedAt = at(1),
  validUntil = at(200), sequence = 1, previousReceiptHash = STAGE1_SOURCE_RECEIPT_GENESIS } = {}) {
  return createStage1SourceVerifierReceipt({ directory: fixture.runDirectory,
    policy: fixture.policy, verifierId: "operator-source-verifier", privateKeyPem: key.privateKey,
    verifiedAt, validUntil, sequence, previousReceiptHash });
}

function payload(capability, challenge, options = {}) {
  if (capability === "TIMESTAMP") return { timestamp: options.timestamp ?? challenge.issuedAt,
    logRootHash: h(`log-${options.sequence ?? 1}`) };
  if (capability === "MEMBERSHIP") return { memberSubjectHash: challenge.subjectHash,
    status: options.membership ?? "ACTIVE", membershipEpoch: options.sequence ?? 1,
    scopeHash: h("membership-scope") };
  if (capability === "REVOCATION") {
    const status = options.revocation ?? "NOT_REVOKED";
    return { status, effectiveAt: status === "REVOKED" ? options.effectiveAt ?? at(2) : null,
      reasonCode: status === "REVOKED" ? "SOURCE_WITHDRAWN" : null,
      registryEpoch: options.sequence ?? 1 };
  }
  const status = options.retention ?? "ACTIVE";
  return { status, retainUntil: status === "UNKNOWN" ? null
    : options.retainUntil ?? (status === "EXPIRED" ? at(3) : at(500)),
  policyReferenceHash: h("retention-policy") };
}

function providerReceipts(fixture, challenge, { observedAt = at(3), validUntil = at(100),
  sequence = 1, prior = {}, overrides = {} } = {}) {
  return Object.keys(fixture.providerKeys).map((capability) => {
    const providerId = `${capability.toLowerCase()}-provider`;
    return createSignedStage1ProviderReceipt({ policy: fixture.policy,
      registry: fixture.registry, providerId, capability, challenge,
      privateKeyPem: fixture.providerKeys[capability].privateKey, sequence,
      previousReceiptHash: prior[capability]?.receiptHash ?? STAGE1_PROVIDER_RECEIPT_GENESIS,
      pollId: h(`${challenge.challengeHash}-${capability}-${sequence}`), observedAt, validUntil,
      payload: payload(capability, challenge, { sequence, ...overrides }) });
  });
}

function receiptByCapability(receipts) {
  return Object.fromEntries(receipts.map((receipt) => [receipt.capability, receipt]));
}

function commitContext(source, challenge, providerReceipts, registry) {
  return { source, challenge, providerReceipts, registry };
}

test("an exact operator-side replay receipt closes the source interface without creating authority",
  () => {
    const fixture = setup();
    try {
      const receipt = sourceReceipt(fixture);
      const checked = verifyStage1SourceVerifierReceipt(receipt,
        { policy: fixture.policy, now: at(2) });
      assert.equal(checked.ok, true, checked.error);
      assert.equal(checked.cryptographicallyValid, true);
      assert.equal(checked.trustedByConfiguredPolicy, true);
      assert.equal(checked.institutionallyTrusted, false);
      rmSync(fixture.runDirectory, { recursive: true, force: true });
      const source = { mode: "OPERATOR_VERIFIER_RECEIPT", receipt };
      const challenge = prepareStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, issuedAt: at(2), expiresAt: at(20), nonce: "poll-1" });
      const receipts = providerReceipts(fixture, challenge);
      const evaluation = finalizeStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, challenge, providerReceipts: receipts,
        registry: fixture.registry, now: at(4) });
      assert.equal(evaluation.source.replayStatus, "SOURCE_REPLAY_VERIFIED");
      assert.equal(evaluation.source.cryptographicStatus, "VALID");
      assert.equal(evaluation.axes.freshness, "FRESH");
      assert.equal(evaluation.axes.externalTime.status, "WITNESSED");
      assert.equal(evaluation.axes.membership.status, "ACTIVE");
      assert.equal(evaluation.axes.revocation.status, "NOT_REVOKED");
      assert.equal(evaluation.axes.retention.status, "ACTIVE");
      assert.equal(evaluation.axes.rights.status,
        "NOT_ESTABLISHED_BY_LIFECYCLE_RECEIPTS");
      assert.equal(evaluation.axes.institutionalTrust.status,
        "NOT_ESTABLISHED_BY_LOCAL_POLICY_OR_KEYS");
      assert.equal(evaluation.disposition, "ADMIT_STAGE1_LIFECYCLE_BOUNDED");
      assert.equal(evaluation.use.stage1LifecycleEligible, true);
      assert.equal(evaluation.use.causalExperienceUnits, 0);
      assert.equal(evaluation.use.automaticTraining, false);
      assert.equal(evaluation.use.pricingEligible, false);
      assert.equal(evaluation.use.authority, "none");
      const committed = commitStage1LifecycleEvaluation({ state: fixture.state,
        policy: fixture.policy, evaluation,
        verificationContext: commitContext(source, challenge, receipts, fixture.registry) });
      assert.equal(verifyStage1LifecycleState(committed, { policy: fixture.policy }).ok, true);
      assert.equal(committed.sequence, 1);
      assert.equal(committed.sourceReceiptWatermark.receiptHash, receipt.receiptHash);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

test("direct source replay works, while unavailable live polling and caller labels stay HOLD",
  () => {
    const fixture = setup();
    try {
      const source = { mode: "DIRECT_SEALED_RUN", directory: fixture.runDirectory };
      const challenge = prepareStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, issuedAt: at(2), expiresAt: at(20) });
      const generic = { receiptHash: h("generic-hash"), pollId: h("generic-poll"),
        status: "NOT_REVOKED", sourceReplay: true };
      const evaluation = finalizeStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, challenge, providerReceipts: [generic],
        registry: fixture.registry, now: at(4) });
      assert.equal(evaluation.source.replayStatus, "SOURCE_REPLAY_VERIFIED");
      assert.equal(evaluation.source.cryptographicStatus,
        "NOT_APPLICABLE_DIRECT_SOURCE_REPLAY");
      assert.equal(evaluation.axes.freshness, "UNKNOWN");
      assert.equal(evaluation.providers.every((provider) =>
        provider.status === "LIVE_POLL_UNAVAILABLE"), true);
      assert.equal(evaluation.unverifiedSubmissions.length, 1);
      assert.equal(evaluation.unverifiedSubmissions[0].cryptographicallyValid, false);
      assert.equal(evaluation.disposition, "HOLD_STALE_OR_UNKNOWN_PROVIDER_STATE");
      assert.equal(evaluation.use.stage1LifecycleEligible, false);
      assert.equal(evaluation.use.automaticTraining, false);
      assert.equal(evaluation.use.causalExperienceUnits, 0);
      assert.equal(evaluation.use.pricingEligible, false);
      assert.throws(() => prepareStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source: { mode: "CALLER_ASSERTED", sourceReplay: true,
          sourceCommitment: h("fake") }, issuedAt: at(2) }), /SOURCE_MODE_INVALID/);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

test("receipt cryptography, configured policy scope, freshness, and standing remain separate",
  () => {
    const sourceOld = keys();
    const sourceNew = keys();
    const fixture = setup({ sourceKeyHistory: [
      ...history(sourceOld, at(-10), at(10)),
      ...history(sourceNew, at(10), at(1_000)),
    ] });
    try {
      fixture.sourceOld = sourceOld;
      const oldReceipt = sourceReceipt(fixture,
        { key: sourceOld, verifiedAt: at(5), validUntil: at(8) });
      const stale = verifyStage1SourceVerifierReceipt(oldReceipt,
        { policy: fixture.policy, now: at(9) });
      assert.equal(stale.ok, false);
      assert.equal(stale.cryptographicallyValid, true);
      assert.equal(stale.trustedByConfiguredPolicy, true);
      assert.equal(stale.fresh, false);
      assert.match(stale.error, /SOURCE_RECEIPT_STALE/);
      assert.throws(() => sourceReceipt(fixture,
        { key: sourceOld, verifiedAt: at(15), validUntil: at(30) }),
      /SOURCE_VERIFIER_KEY_OUT_OF_SCOPE/);
      const rotated = sourceReceipt(fixture,
        { key: sourceNew, verifiedAt: at(15), validUntil: at(30) });
      const checked = verifyStage1SourceVerifierReceipt(rotated,
        { policy: fixture.policy, now: at(16) });
      assert.equal(checked.ok, true, checked.error);
      assert.equal(checked.signerKeyId, stage1LifecycleKeyId(sourceNew.publicKey));
      assert.equal(checked.institutionallyTrusted, false);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

test("provider signer rotation and verifier implementation pinning reject stale or substituted code",
  () => {
    const oldTimestamp = keys();
    const newTimestamp = keys();
    const fixture = setup({ providerKeyHistory: { TIMESTAMP: [
      ...history(oldTimestamp, at(-10), at(10)),
      ...history(newTimestamp, at(10), at(1_000)),
    ] } });
    try {
      const source = { mode: "DIRECT_SEALED_RUN", directory: fixture.runDirectory };
      const challenge = prepareStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, issuedAt: at(12), expiresAt: at(30) });
      const make = (key) => createSignedStage1ProviderReceipt({ policy: fixture.policy,
        registry: fixture.registry, providerId: "timestamp-provider", capability: "TIMESTAMP",
        challenge, privateKeyPem: key.privateKey, observedAt: at(13), validUntil: at(30),
        payload: payload("TIMESTAMP", challenge) });
      assert.throws(() => make(oldTimestamp), /PROVIDER_KEY_OUT_OF_SCOPE/);
      assert.equal(make(newTimestamp).signature.keyId,
        stage1LifecycleKeyId(newTimestamp.publicKey));

      const substituted = new Stage1ProviderVerifierRegistry();
      substituted.register({ interfaceId: STAGE1_PROVIDER_INTERFACES.timestamp,
        adapterVersion: "1.0.0", capability: "TIMESTAMP",
        payloadSchema: "timestamp+log-root/v1",
        verifyPayload: () => ({ timestamp: at(12), logRootHash: h("fabricated") }) });
      assert.notEqual(substituted.describe(STAGE1_PROVIDER_INTERFACES.timestamp, "1.0.0")
        .profileHash, fixture.registry.describe(
        STAGE1_PROVIDER_INTERFACES.timestamp, "1.0.0").profileHash);
      assert.throws(() => createSignedStage1ProviderReceipt({ policy: fixture.policy,
        registry: substituted, providerId: "timestamp-provider", capability: "TIMESTAMP",
        challenge, privateKeyPem: newTimestamp.privateKey, observedAt: at(13),
        validUntil: at(30), payload: payload("TIMESTAMP", challenge) }),
      /PROVIDER_INTERFACE_POLICY_MISMATCH/);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

test("a semantically invalid provider receipt can be cryptographically valid but cannot satisfy membership",
  () => {
    const fixture = setup();
    try {
      const source = { mode: "DIRECT_SEALED_RUN", directory: fixture.runDirectory };
      const challenge = prepareStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, issuedAt: at(2), expiresAt: at(20) });
      const receipts = providerReceipts(fixture, challenge);
      const index = receipts.findIndex((receipt) => receipt.capability === "MEMBERSHIP");
      const bad = structuredClone(receipts[index]);
      bad.payload.memberSubjectHash = h("wrong-subject");
      delete bad.receiptHash;
      delete bad.signature;
      const receiptHash = stage1LifecycleDigest(`${STAGE1_LIFECYCLE_SCHEMAS.providerReceipt}\0${canonicalizeStrict(bad)}`);
      const membershipKey = fixture.providerKeys.MEMBERSHIP;
      bad.receiptHash = receiptHash;
      bad.signature = { algorithm: "Ed25519",
        keyId: stage1LifecycleKeyId(membershipKey.publicKey),
        value: cryptoSign(null, Buffer.from(receiptHash),
          createPrivateKey(membershipKey.privateKey)).toString("base64") };
      receipts[index] = bad;
      const evaluation = finalizeStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, challenge, providerReceipts: receipts,
        registry: fixture.registry, now: at(4) });
      assert.equal(evaluation.unverifiedSubmissions.length, 1);
      assert.equal(evaluation.unverifiedSubmissions[0].cryptographicallyValid, true);
      assert.match(evaluation.unverifiedSubmissions[0].error, /MEMBERSHIP_PAYLOAD_INVALID/);
      assert.equal(evaluation.axes.membership.status, "UNKNOWN");
      assert.equal(evaluation.axes.cryptographicValidity, "PARTIAL_OR_INVALID");
      assert.equal(evaluation.use.stage1LifecycleEligible, false);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

test("two independently signed receipts for one provider stream cannot satisfy one poll", () => {
  const fixture = setup();
  try {
    const source = { mode: "DIRECT_SEALED_RUN", directory: fixture.runDirectory };
    const challenge = prepareStage1LifecyclePoll({ state: fixture.state,
      policy: fixture.policy, source, issuedAt: at(2), expiresAt: at(20) });
    const receipts = providerReceipts(fixture, challenge);
    receipts.push(createSignedStage1ProviderReceipt({ policy: fixture.policy,
      registry: fixture.registry, providerId: "timestamp-provider", capability: "TIMESTAMP",
      challenge, privateKeyPem: fixture.providerKeys.TIMESTAMP.privateKey,
      pollId: h("second-timestamp-same-stream"), observedAt: at(3), validUntil: at(100),
      payload: payload("TIMESTAMP", challenge) }));
    const evaluation = finalizeStage1LifecyclePoll({ state: fixture.state,
      policy: fixture.policy, source, challenge, providerReceipts: receipts,
      registry: fixture.registry, now: at(4) });
    assert.equal(evaluation.disposition, "HOLD_STALE_OR_UNKNOWN_PROVIDER_STATE");
    assert.equal(evaluation.use.stage1LifecycleEligible, false);
    assert.equal(evaluation.unverifiedSubmissions.some((entry) =>
      /DUPLICATE_PROVIDER_STREAM_IN_POLL/.test(entry.error)
        && entry.cryptographicallyValid), true);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("CAS challenges, provider watermarks, receipt replay, and wall-time rollback fail closed",
  () => {
    const fixture = setup();
    try {
      const source = { mode: "DIRECT_SEALED_RUN", directory: fixture.runDirectory };
      const challenge1 = prepareStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, issuedAt: at(2), expiresAt: at(20), nonce: "one" });
      const receipts1 = providerReceipts(fixture, challenge1);
      const evaluation1 = finalizeStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, challenge: challenge1, providerReceipts: receipts1,
        registry: fixture.registry, now: at(4) });
      assert.throws(() => commitStage1LifecycleEvaluation({ state: fixture.state,
        policy: fixture.policy, evaluation: evaluation1 }),
      /COMMIT_REVERIFICATION_CONTEXT_REQUIRED/);
      const forged = structuredClone(evaluation1);
      forged.use.automaticTraining = true;
      delete forged.evaluationHash;
      forged.evaluationHash = stage1LifecycleDigest(
        `${STAGE1_LIFECYCLE_SCHEMAS.evaluation}\0${canonicalizeStrict(forged)}`);
      assert.throws(() => commitStage1LifecycleEvaluation({ state: fixture.state,
        policy: fixture.policy, evaluation: forged,
        verificationContext: commitContext(source, challenge1, receipts1, fixture.registry) }),
      /EVALUATION_REVERIFICATION_MISMATCH/);
      const state1 = commitStage1LifecycleEvaluation({ state: fixture.state,
        policy: fixture.policy, evaluation: evaluation1,
        verificationContext: commitContext(source, challenge1, receipts1, fixture.registry) });
      assert.throws(() => commitStage1LifecycleEvaluation({ state: state1,
        policy: fixture.policy, evaluation: evaluation1,
        verificationContext: commitContext(source, challenge1, receipts1, fixture.registry) }),
      /CONCURRENT_STALE_BASE/);
      assert.throws(() => prepareStage1LifecyclePoll({ state: state1,
        policy: fixture.policy, source, issuedAt: at(3), expiresAt: at(20) }),
      /CHALLENGE_TIME_ROLLBACK/);
      const challenge2 = prepareStage1LifecyclePoll({ state: state1,
        policy: fixture.policy, source, issuedAt: at(10), expiresAt: at(30), nonce: "two" });
      const replayEvaluation = finalizeStage1LifecyclePoll({ state: state1,
        policy: fixture.policy, source, challenge: challenge2, providerReceipts: receipts1,
        registry: fixture.registry, now: at(12) });
      assert.equal(replayEvaluation.use.stage1LifecycleEligible, false);
      assert.equal(replayEvaluation.unverifiedSubmissions.length, 4);
      assert.throws(() => commitStage1LifecycleEvaluation({ state: state1,
        policy: fixture.policy, evaluation: replayEvaluation,
        verificationContext: commitContext(source, challenge2, receipts1, fixture.registry) }),
      /RECEIPT_REPLAY|POLL_ID_REPLAY/);

      const prior = receiptByCapability(receipts1);
      const receipts2 = providerReceipts(fixture, challenge2,
        { observedAt: at(11), validUntil: at(40), sequence: 2, prior });
      const timestampIndex = receipts2.findIndex((receipt) => receipt.capability === "TIMESTAMP");
      receipts2[timestampIndex] = createSignedStage1ProviderReceipt({ policy: fixture.policy,
        registry: fixture.registry, providerId: "timestamp-provider", capability: "TIMESTAMP",
        challenge: challenge2, privateKeyPem: fixture.providerKeys.TIMESTAMP.privateKey,
        sequence: 1, previousReceiptHash: STAGE1_PROVIDER_RECEIPT_GENESIS,
        pollId: h("new-but-rolled-back-timestamp"), observedAt: at(11), validUntil: at(40),
        payload: payload("TIMESTAMP", challenge2, { timestamp: at(10), sequence: 1 }) });
      const rollback = finalizeStage1LifecyclePoll({ state: state1,
        policy: fixture.policy, source, challenge: challenge2, providerReceipts: receipts2,
        registry: fixture.registry, now: at(12) });
      assert.equal(rollback.use.stage1LifecycleEligible, false);
      assert.equal(rollback.unverifiedSubmissions.some((entry) =>
        /PROVIDER_RECEIPT_REPLAY_OR_ROLLBACK/.test(entry.error)
          && entry.cryptographicallyValid), true);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }
  });

test("revocation is monotonic, retention expiration is distinct, and neither can enable use",
  () => {
    const fixture = setup();
    try {
      const source = { mode: "DIRECT_SEALED_RUN", directory: fixture.runDirectory };
      const challenge1 = prepareStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, issuedAt: at(2), expiresAt: at(20), nonce: "revoke" });
      const revokedReceipts = providerReceipts(fixture, challenge1,
        { overrides: { revocation: "REVOKED", effectiveAt: at(2) } });
      const revokedEvaluation = finalizeStage1LifecyclePoll({ state: fixture.state,
        policy: fixture.policy, source, challenge: challenge1,
        providerReceipts: revokedReceipts, registry: fixture.registry, now: at(4) });
      assert.equal(revokedEvaluation.disposition, "HOLD_REVOKED");
      const state1 = commitStage1LifecycleEvaluation({ state: fixture.state,
        policy: fixture.policy, evaluation: revokedEvaluation,
        verificationContext: commitContext(source, challenge1, revokedReceipts,
          fixture.registry) });
      assert.equal(state1.permanentlyRevokedAt, at(2));
      const prior = receiptByCapability(revokedReceipts);
      const challenge2 = prepareStage1LifecyclePoll({ state: state1,
        policy: fixture.policy, source, issuedAt: at(10), expiresAt: at(30), nonce: "undo" });
      const notRevoked = providerReceipts(fixture, challenge2,
        { observedAt: at(11), validUntil: at(40), sequence: 2, prior,
          overrides: { revocation: "NOT_REVOKED" } });
      const second = finalizeStage1LifecyclePoll({ state: state1, policy: fixture.policy,
        source, challenge: challenge2, providerReceipts: notRevoked,
        registry: fixture.registry, now: at(12) });
      assert.equal(second.axes.revocation.status, "REVOKED");
      assert.equal(second.disposition, "HOLD_REVOKED");
      assert.equal(second.use.stage1LifecycleEligible, false);
    } finally { rmSync(fixture.root, { recursive: true, force: true }); }

    const expiredFixture = setup();
    try {
      const source = { mode: "DIRECT_SEALED_RUN", directory: expiredFixture.runDirectory };
      const challenge = prepareStage1LifecyclePoll({ state: expiredFixture.state,
        policy: expiredFixture.policy, source, issuedAt: at(2), expiresAt: at(20) });
      const receipts = providerReceipts(expiredFixture, challenge,
        { overrides: { retention: "EXPIRED", retainUntil: at(3) } });
      const evaluation = finalizeStage1LifecyclePoll({ state: expiredFixture.state,
        policy: expiredFixture.policy, source, challenge, providerReceipts: receipts,
        registry: expiredFixture.registry, now: at(4) });
      assert.equal(evaluation.axes.retention.status, "EXPIRED");
      assert.equal(evaluation.disposition, "HOLD_RETENTION_EXPIRED");
      assert.equal(evaluation.use.automaticTraining, false);
    } finally { rmSync(expiredFixture.root, { recursive: true, force: true }); }
  });

test("a source mutation during provider verification is detected as TOCTOU", () => {
  const fixture = setup();
  try {
    const source = { mode: "DIRECT_SEALED_RUN", directory: fixture.runDirectory };
    const challenge = prepareStage1LifecyclePoll({ state: fixture.state,
      policy: fixture.policy, source, issuedAt: at(2), expiresAt: at(20) });
    const receipts = providerReceipts(fixture, challenge);
    let mutated = false;
    receipts[0] = new Proxy(receipts[0], {
      get(target, property, receiver) {
        if (!mutated && property === "providerId") {
          mutated = true;
          appendFileSync(path.join(fixture.runDirectory, "events.jsonl"), " \n");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    assert.throws(() => finalizeStage1LifecyclePoll({ state: fixture.state,
      policy: fixture.policy, source, challenge, providerReceipts: receipts,
      registry: fixture.registry, now: at(4) }), /SOURCE_TOCTOU_DETECTED/);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("versioned corpus profiles freeze exact source, partition, D2, and rights commitments",
  () => {
    const six = stage1ExactCorpusProfile(STAGE1_CORPUS_PROFILE_IDS.SIX_SET_V1);
    const seven = stage1ExactCorpusProfile(STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2);
    assert.equal(six, STAGE1_CORPUS_PROFILES.SIX_SET_V1);
    assert.equal(seven, STAGE1_CORPUS_PROFILES.SEVEN_SET_NHTSA_V2);
    assert.equal(verifyStage1ExactCorpusProfile(six).ok, true);
    assert.equal(verifyStage1ExactCorpusProfile(seven).ok, true);
    assert.equal(Object.isFrozen(seven), true);
    assert.equal(Object.isFrozen(seven.expected.sourceKinds), true);
    assert.deepEqual(six.expected.counts, {
      artifactSets: 6, activeArtifactSets: 6, revokedArtifactSets: 0,
      expiredArtifactSets: 0, candidates: 11_318, d2Groups: 6,
    });
    assert.deepEqual(seven.expected.counts, {
      artifactSets: 7, activeArtifactSets: 7, revokedArtifactSets: 0,
      expiredArtifactSets: 0, candidates: 12_642, d2Groups: 7,
    });
    assert.deepEqual(six.expected.sourceClassCounts, {
      fullSourceArtifactSets: 5, fullSourceCandidates: 11_046,
      metadataOnlyArtifactSets: 1, metadataOnlyCandidates: 272,
      privacyProjectionArtifactSets: 0, privacyProjectionCandidates: 0,
    });
    assert.deepEqual(seven.expected.sourceClassCounts, {
      fullSourceArtifactSets: 6, fullSourceCandidates: 12_370,
      metadataOnlyArtifactSets: 1, metadataOnlyCandidates: 272,
      privacyProjectionArtifactSets: 0, privacyProjectionCandidates: 0,
    });
    assert.equal(six.expected.sourceKinds.length, 6);
    assert.equal(seven.expected.sourceKinds.length, 7);
    const nhtsa = seven.expected.sourceKinds.find(({ sourceKind }) =>
      sourceKind === "NHTSA_SGO_INCIDENT_TAXONOMY_QUARANTINE");
    assert.ok(nhtsa);
    assert.equal(nhtsa.candidates, 1_324);
    assert.equal(nhtsa.rightsBasisClass, "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY");
    assert.equal(nhtsa.rightsStatus, "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY");
    assert.deepEqual(nhtsa.licenseIds, []);
    assert.equal(seven.expected.rightsStatus.anyRegistryGrantsRights, false);
    assert.equal(six.profileHash,
      "sha256:dd79635cfef9a60f9e82830925b754d0bc75cf1cbf811b87aba85ca5c59fc917");
    assert.equal(seven.profileHash,
      "sha256:476cf01dc6298e58ea86fc34655ac9b8e3fe297ed4ac792a6c87fad8c0d824e0");

    const resealedPromotion = structuredClone(seven);
    const promotedNhtsa = resealedPromotion.expected.sourceKinds.find(({ sourceKind }) =>
      sourceKind === "NHTSA_SGO_INCIDENT_TAXONOMY_QUARANTINE");
    promotedNhtsa.rightsBasisClass = "PUBLIC_DATASET_LICENSE_DECLARATIONS";
    promotedNhtsa.rightsStatus = "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS";
    promotedNhtsa.licenseIds = ["FAKE-PROMOTION"];
    resealedPromotion.expected.rightsStatus.rightsBasisClasses =
      ["PUBLIC_DATASET_LICENSE_DECLARATIONS"];
    const { profileHash: ignoredProfileHash, ...resealedBody } = resealedPromotion;
    void ignoredProfileHash;
    resealedPromotion.profileHash = stage1LifecycleDigest(
      `${STAGE1_LIFECYCLE_SCHEMAS.corpusProfile}\0${canonicalizeStrict(resealedBody)}`);
    const rejected = verifyStage1ExactCorpusProfile(resealedPromotion);
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /CORPUS_PROFILE_DERIVATION_INVALID/);
    assert.throws(() => stage1ExactCorpusProfile("SEVEN_OPTIONAL_NHTSA"),
      /CORPUS_PROFILE_UNKNOWN/);
  });

test("the combined six-set registry ordinary verifier remains read-only and does not claim source replay",
  { skip: !existsSync(path.resolve(
    "artifacts/stage1-curate-corpus-registry-all-evidence-20260821/index.json")) }, () => {
    const directory = path.resolve(
      "artifacts/stage1-curate-corpus-registry-all-evidence-20260821");
    const files = ["config.json", "events.jsonl", "index.json"];
    const before = files.map((name) => stage1LifecycleDigest(readFileSync(path.join(directory, name))));
    const checked = verifyStage1CorpusRegistryLifecycleStructure({ directory,
      now: "2026-08-21T23:59:59.000Z" });
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.counts.artifactSets, 6);
    assert.equal(checked.counts.candidates, 11_318);
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.sourceReplayStatus,
      "NOT_PERFORMED_BY_ORDINARY_REGISTRY_VERIFY");
    assert.equal(checked.operatorSignedSourceClaimsTrustedAsSourceReplay, false);
    const after = files.map((name) => stage1LifecycleDigest(readFileSync(path.join(directory, name))));
    assert.deepEqual(after, before);
  });

test("the lifecycle CLI requires and enforces exact six-, seven-, or eight-set profiles",
  { timeout: 420_000, skip: [
    "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902/index.json",
    "artifacts/public-agent-corpus-20260820/source",
    "artifacts/public-agent-wave2-20260821/source",
    "artifacts/public-agent-wave3-20260821/source/cuarewardbench",
    "artifacts/public-agent-wave4-20260821/source/agentrx-tau",
    "artifacts/curate-public-robotics-20260820/source",
    "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay/report.json",
    "artifacts/curate-droid100-20260819/source/r2d2_faceblur-train.tfrecord-00000-of-00031",
    "artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv",
    "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf",
  ].some((file) => !existsSync(path.resolve(file))) }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-stage1-seven-set-cli-"));
    const pair = keys();
    const directory = path.join(root, "registry");
    const sourceRegistry = path.resolve(
      "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902");
    try {
      const storedSets = readdirSync(path.join(sourceRegistry, "artifact-sets"))
        .filter((name) => name.endsWith(".json"))
        .map((name) => JSON.parse(readFileSync(path.join(sourceRegistry,
          "artifact-sets", name), "utf8")))
        .filter((artifactSet) => artifactSet.sourceProof.sourceKind
          !== "NHTSA_SGO_INCIDENT_TAXONOMY_QUARANTINE")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      assert.equal(storedSets.length, 6);
      const resign = (stored, overrides = {}) => createCorpusArtifactSet({
          artifactSetId: stored.artifactSetId,
          stage: overrides.stage ?? stored.stage,
          stream: overrides.stream ?? stored.stream,
          createdAt: stored.createdAt,
          instrument: overrides.instrument ?? stored.instrument,
          datasetIds: overrides.datasetIds ?? stored.datasetIds,
          licenseIds: overrides.licenseIds ?? stored.licenseIds,
          rightsBasis: overrides.rightsBasis ?? stored.rightsBasis,
          sourceProof: overrides.sourceProof ?? stored.sourceProof,
          units: stored.units,
          retention: stored.retention,
        }, { privateKeyPem: pair.privateKey });
      const appendSix = (registry) => {
        for (const stored of storedSets) {
          const resigned = resign(stored);
          assert.equal(resigned.artifactSetHash, stored.artifactSetHash);
          registry.appendArtifactSet(resigned, { recordedAt: stored.createdAt });
        }
      };
      const registry = new DurableStage1CurateCorpusRegistry({ directory,
        privateKeyPem: pair.privateKey, registryId: "stage1-seven-set-cli-test",
        createdAt: "2026-09-02T14:20:00.000Z" });
      appendSix(registry);

      const sourceArgs = [
        "--agent-artifact-dir", path.resolve("artifacts/public-agent-corpus-20260820"),
        "--wave2-source-root", path.resolve("artifacts/public-agent-wave2-20260821/source"),
        "--robotics-source-root", path.resolve("artifacts/curate-public-robotics-20260820/source"),
        "--droid-artifact-dir", path.resolve(
          "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay"),
        "--droid-source-root", path.resolve("artifacts/curate-droid100-20260819/source"),
        "--wave4-source-root", path.resolve(
          "artifacts/public-agent-wave4-20260821/source/agentrx-tau"),
        "--wave3-source-root", path.resolve(
          "artifacts/public-agent-wave3-20260821/source/cuarewardbench"),
        "--now", "2026-09-02T14:20:08.000Z",
      ];
      const cliArgs = (target, ...extra) => [
        path.resolve("scripts/stage1-lifecycle-frontier.mjs"), "replay-corpus",
        "--dir", target, ...sourceArgs, ...extra,
      ];

      const missingProfile = spawnSync(process.execPath, cliArgs(directory),
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
      assert.equal(missingProfile.status, 1);
      assert.match(missingProfile.stderr, /OPTION_REQUIRED:--expected-profile/);

      const sevenAgainstSix = spawnSync(process.execPath, cliArgs(directory,
        "--expected-profile", STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2),
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
      assert.equal(sevenAgainstSix.status, 1);
      assert.match(sevenAgainstSix.stdout,
        /CORPUS_PROFILE_MISMATCH:SEVEN_SET_NHTSA_V2/);

      const sixOutput = path.join(root, "six-source-replay.json");
      const sixReplay = spawnSync(process.execPath, cliArgs(directory,
        "--expected-profile", STAGE1_CORPUS_PROFILE_IDS.SIX_SET_V1,
        "--out", sixOutput),
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 240_000 });
      assert.equal(sixReplay.status, 0, sixReplay.stderr || sixReplay.stdout);
      const sixSnapshot = JSON.parse(readFileSync(sixOutput, "utf8"));
      assert.equal(sixSnapshot.ok, true);
      assert.equal(sixSnapshot.profileId, STAGE1_CORPUS_PROFILE_IDS.SIX_SET_V1);
      assert.equal(sixSnapshot.profileHash, STAGE1_CORPUS_PROFILES.SIX_SET_V1.profileHash);
      assert.equal(sixSnapshot.profileExact, true);
      assert.equal(sixSnapshot.sourceSubject.profileExact, true);
      assert.equal(sixSnapshot.ordinaryRegistryVerification.counts.artifactSets, 6);
      assert.equal(sixSnapshot.ordinaryRegistryVerification.counts.candidates, 11_318);
      assert.equal(sixSnapshot.sourceSubject.fullSourceArtifactSetsReverified, 5);
      assert.equal(sixSnapshot.sourceSubject.fullSourceCandidatesReverified, 11_046);

      const nhtsa = buildNhtsaSgoIncidentCorpusArtifactSetFromSource({
        csvPath: path.resolve("artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv"),
        dataDictionaryPath: path.resolve(
          "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf"),
        privateKeyPem: pair.privateKey,
        createdAt: "2026-09-02T14:20:07.000Z",
      });
      registry.appendArtifactSet(nhtsa, { recordedAt: "2026-09-02T14:20:07.000Z" });
      const structural = registry.verify({ now: "2026-09-02T14:20:08.000Z" });
      assert.equal(structural.ok, true, structural.error);
      assert.equal(structural.counts.artifactSets, 7);
      assert.equal(structural.counts.candidates, 12_642);
      assert.equal(structural.counts.d2Groups, 7);
      assert.equal(structural.sourceArtifactsReverified, false);

      const sixAgainstSeven = spawnSync(process.execPath, cliArgs(directory,
        "--expected-profile", STAGE1_CORPUS_PROFILE_IDS.SIX_SET_V1),
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
      assert.equal(sixAgainstSeven.status, 1);
      assert.match(sixAgainstSeven.stdout, /CORPUS_PROFILE_MISMATCH:SIX_SET_V1/);

      const optionalNhtsaPath = spawnSync(process.execPath, cliArgs(directory,
        "--expected-profile", STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2),
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
      assert.equal(optionalNhtsaPath.status, 1);
      assert.match(optionalNhtsaPath.stdout,
        /VERIFY_SOURCE_PATH_REQUIRED:nhtsaCsvPath\+nhtsaDataDictionaryPath/);

      const output = path.join(root, "seven-source-replay.json");
      const commonArgs = cliArgs(directory,
        "--expected-profile", STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2,
        "--nhtsa-csv", path.resolve(
          "artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv"),
        "--nhtsa-data-dictionary", path.resolve(
          "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf"),
        "--out", output);
      const replayed = spawnSync(process.execPath, commonArgs,
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 240_000 });
      assert.equal(replayed.status, 0, replayed.stderr);
      const snapshot = JSON.parse(readFileSync(output, "utf8"));
      assert.equal(snapshot.ok, true);
      assert.equal(snapshot.mode, "DIRECT_KNOWN_SOURCE_REPLAY");
      assert.equal(snapshot.sourceArtifactsReverified, true);
      assert.equal(snapshot.allSourceClaimsReverified, true);
      assert.equal(snapshot.profileId, STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2);
      assert.equal(snapshot.profileHash,
        STAGE1_CORPUS_PROFILES.SEVEN_SET_NHTSA_V2.profileHash);
      assert.equal(snapshot.profileExact, true);
      assert.deepEqual(snapshot.corpusProfile, {
        profileId: STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2,
        profileVersion: "2.0.0",
        profileHash: STAGE1_CORPUS_PROFILES.SEVEN_SET_NHTSA_V2.profileHash,
        matchingRule: "EXACT_SOURCE_KIND_COUNT_D2_INSTRUMENT_RIGHTS_AND_CLASS_PARTITION",
      });
      assert.equal(snapshot.sourceSubject.profileExact, true);
      assert.equal(snapshot.sourceSubject.profileHash, snapshot.profileHash);
      assert.equal(snapshot.ordinaryRegistryVerification.counts.artifactSets, 7);
      assert.equal(snapshot.ordinaryRegistryVerification.counts.candidates, 12_642);
      assert.equal(snapshot.sourceSubject.fullSourceArtifactSetsReverified, 6);
      assert.equal(snapshot.sourceSubject.fullSourceCandidatesReverified, 12_370);
      assert.equal(snapshot.sourceSubject.metadataOnlyArtifactSetsReverified, 1);
      assert.equal(snapshot.sourceSubject.metadataOnlyCandidatesReverified, 272);
      const nhtsaReplay = snapshot.fullSourceReplay.artifacts.find((artifact) =>
        artifact.sourceKind === "NHTSA_SGO_INCIDENT_TAXONOMY_QUARANTINE");
      assert.ok(nhtsaReplay);
      assert.equal(nhtsaReplay.candidates, 1_324);
      assert.equal(nhtsaReplay.canonicalBodyExact, true);
      assert.equal(snapshot.metadataOnlyReplay.candidates, 272);
      assert.equal(snapshot.rightsEstablished, false);
      assert.equal(snapshot.boundary.causalExperienceUnits, 0);
      assert.equal(snapshot.boundary.automaticTraining, false);
      assert.equal(snapshot.boundary.pricingEligible, false);

      const missingDictionary = spawnSync(process.execPath,
        commonArgs.filter((value, index, values) => value !== "--nhtsa-data-dictionary"
          && values[index - 1] !== "--nhtsa-data-dictionary"
          && value !== "--out" && values[index - 1] !== "--out"),
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
      assert.equal(missingDictionary.status, 1);
      assert.match(missingDictionary.stdout,
        /VERIFY_SOURCE_PATH_REQUIRED:nhtsaCsvPath\+nhtsaDataDictionaryPath/);

      const resealedDirectory = path.join(root, "resealed-registry");
      const resealedRegistry = new DurableStage1CurateCorpusRegistry({
        directory: resealedDirectory, privateKeyPem: pair.privateKey,
        registryId: "stage1-resealed-source-kind-test",
        createdAt: "2026-09-02T14:20:00.000Z",
      });
      appendSix(resealedRegistry);
      const relabeledNhtsa = resign(nhtsa, { sourceProof: {
        ...nhtsa.sourceProof,
        sourceKind: "NHTSA_SGO_INCIDENT_TAXONOMY_QUARANTINE_RESEALED",
      } });
      assert.notEqual(relabeledNhtsa.artifactSetHash, nhtsa.artifactSetHash);
      resealedRegistry.appendArtifactSet(relabeledNhtsa,
        { recordedAt: "2026-09-02T14:20:07.000Z" });
      assert.equal(resealedRegistry.verify({ now: "2026-09-02T14:20:08.000Z" }).ok, true);
      const resealedAttack = spawnSync(process.execPath, cliArgs(resealedDirectory,
        "--expected-profile", STAGE1_CORPUS_PROFILE_IDS.SEVEN_SET_NHTSA_V2),
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
      assert.equal(resealedAttack.status, 1);
      assert.match(resealedAttack.stdout,
        /CORPUS_PROFILE_MISMATCH:SEVEN_SET_NHTSA_V2/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("ordinary verification refuses a missing registry without creating it", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stage1-missing-registry-"));
  try {
    const missing = path.join(root, "must-not-be-created");
    const checked = verifyStage1CorpusRegistryLifecycleStructure({ directory: missing,
      now: at(1) });
    assert.equal(checked.ok, false);
    assert.match(checked.error, /CORPUS_DIRECTORY_INCOMPLETE/);
    assert.equal(existsSync(missing), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the corpus CLI writes a deterministic no-clobber verification snapshot",
  { skip: !existsSync(path.resolve(
    "artifacts/stage1-curate-corpus-registry-all-evidence-20260821/index.json")) }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-stage1-lifecycle-cli-"));
    try {
      const output = path.join(root, "ordinary.json");
      const args = ["scripts/stage1-lifecycle-frontier.mjs", "verify-corpus", "--dir",
        "artifacts/stage1-curate-corpus-registry-all-evidence-20260821", "--now",
        "2026-08-21T23:59:59.000Z", "--out", output];
      const first = spawnSync(process.execPath, args, { encoding: "utf8" });
      assert.equal(first.status, 0, first.stderr);
      const parsed = JSON.parse(readFileSync(output, "utf8"));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.sourceArtifactsReverified, false);
      assert.equal(parsed.counts.candidates, 11_318);
      const second = spawnSync(process.execPath, args, { encoding: "utf8" });
      assert.equal(second.status, 1);
      assert.match(second.stderr, /EEXIST/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
