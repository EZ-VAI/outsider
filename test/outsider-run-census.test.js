import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync, copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";
import { startKernelRun } from "../src/outsider-kernel-runner.js";
import {
  censusPaths, createCensusAnchorCommitment, createLocalAnchorReceipt,
  defaultAnchorPolicy, importCensusExternalAnchorEvidence, importExternalAnchorReceipt,
  issueExternalAnchorReceipt, reconcileCensusRun,
  reconcileOpenCensusRun,
  registerCensusIntake, registerCensusRun, settleCensusRun, verifyAnchorReceipt,
  verifyCensusAnchorCommitment, verifyCensusExternalAnchorBundle,
  verifyCensusRegistration, verifyRunCensus,
} from "../src/outsider-run-census.js";
import {
  ANCHOR_OPERATOR_RELATIONSHIPS, EXTERNAL_ANCHOR_ASSURANCE,
  EXTERNAL_ANCHOR_PROFILES, captureExternalAnchorEvidence,
  createExternalAnchorRequest, createExternalAnchorTrustPolicy,
} from "../src/outsider-external-anchor.js";
import {
  createAttestationV2, createStage05ControlledWayBinding, finalizeStage05Evidence,
  verifyAttestationV2, verifyStage05RunDirectory,
} from "../src/outsider-stage05-evidence.js";
import { freezeContract } from "../src/outsider-work-contract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const censusModuleUrl = pathToFileURL(path.resolve(here,
  "../src/outsider-run-census.js")).href;
const seal = (letter = "a") => `sha256:${letter.repeat(64)}`;
const evidence = (letter = "e") => `sha256:${letter.repeat(64)}`;
const hash = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;

function root(label = "outsider-run-census-") {
  return mkdtempSync(path.join(tmpdir(), label));
}

function registration(stateRoot, index = 1) {
  return registerCensusRun({
    stateRoot,
    runId: `controlled-run-${String(index).padStart(4, "0")}`,
    ask: `perform controlled task ${index}`,
    contractSeal: seal(String((index % 9) + 1)),
    host: index % 2 ? "codex" : "claude-code",
  });
}

function entryFiles(stateRoot) {
  const directory = censusPaths(stateRoot).entries;
  return readdirSync(directory).sort().map((name) => path.join(directory, name));
}

test("RunStore commits STARTED before creating its run directory and binds it into v3 state", () => {
  const fixture = root();
  const cwd = path.join(fixture, "workspace");
  const stateRoot = path.join(fixture, "runs");
  mkdirSync(cwd);
  const contract = freezeContract({ cwd, ask: "do exact work", acceptance: "node --test" });
  const collidedRunId = "collision-run-0001";
  mkdirSync(stateRoot, { mode: 0o700 });
  mkdirSync(path.join(stateRoot, collidedRunId));
  assert.throws(() => RunStore.create({ cwd, contract, supervisorCommand: "judge",
    stateRoot, runId: collidedRunId, host: "codex" }), /EEXIST/);
  const afterCollision = verifyRunCensus(stateRoot);
  assert.equal(afterCollision.ok, true);
  assert.equal(afterCollision.startedCount, 1,
    "a bootstrap failure after census registration remains in the denominator");
  assert.equal(afterCollision.openCount, 1);

  const store = RunStore.create({ cwd, contract, supervisorCommand: "judge",
    stateRoot, runId: "ordinary-run-0002", host: "codex" });
  const state = store.readState();
  assert.equal(state.schema, "outsider/kernel-run/v3");
  assert.equal(state.census.runOrdinal, 2);
  assert.equal(lstatSync(store.directory).isDirectory(), true);
  assert.equal(verifyCensusRegistration({ stateRoot, registration: state.census,
    runId: state.runId, ask: contract.ask,
    contractSeal: contract.seal, host: "codex" }).ok, true);
  assert.doesNotThrow(() => RunStore.open({ directory: store.directory,
    supervisorCommand: "judge" }));
});

test("hook, worker, acceptance, contract and baseline preflight failures remain visible", async (t) => {
  const cases = [
    ["hook", /HOOK_ENTRY_NOT_FOUND/],
    ["worker", /WORKER_CLI_PREFLIGHT_FAILED/],
    ["acceptance", /ACCEPTANCE_PREFLIGHT_FAILED/],
    ["contract", /CONTRACT_COMPILATION_FAILED/],
    ["baseline", /SEMANTIC_CONTROL_PREFLIGHT_FAILED/],
  ];
  for (const [kind, expected] of cases) {
    await t.test(kind, async () => {
      const fixture = root(`outsider-census-${kind}-`);
      const cwd = path.join(fixture, "workspace");
      const stateRoot = path.join(fixture, "runs");
      mkdirSync(cwd);
      writeFileSync(path.join(cwd, "value.js"), "export const value = 1;\n");
      const runId = `preflight-${kind}-0001`;
      const ask = `PRIVATE OPERATOR GOAL ${kind}`;
      await assert.rejects(startKernelRun({
        runId,
        cwd,
        ask,
        acceptance: "node --test",
        supervisorCommand: "private-supervisor",
        hookEntry: kind === "hook" ? path.join(fixture, "missing-hook.mjs")
          : path.resolve("bin/outsider-hook.mjs"),
        stateRoot,
        host: "codex",
        workerPreflight: () => kind === "worker"
          ? { ok: false, error: "worker unavailable" } : { ok: true },
        acceptancePreflight: () => kind === "acceptance"
          ? { ran: false, error: "acceptance unavailable" }
          : { ran: true, passed: true, exit: 0, output: "green" },
        contractCompiler: () => kind === "contract"
          ? { ok: false, error: "compiler unavailable" }
          : { ok: true, semantic: { objective: "preserve value",
            successCriteria: ["value remains usable"], architecturalConstraints: [],
            forbiddenShortcuts: [], scope: { in: ["value.js"], out: [] }, uncertainties: [] } },
        contractAuditor: ({ semantic }) => ({ ok: true,
          packet: { semantic }, verdict: { passed: true, errors: [],
            verifiedFacts: ["operator meaning preserved"] } }),
        baselineVerifier: () => kind === "baseline"
          ? { ok: false, error: "baseline judge unavailable" }
          : { ok: true, verdict: { passed: false, insufficient: false, gaps: ["work remains"],
            evidence: [] }, packet: {} },
        spawnWorker: () => { throw new Error("worker must not start"); },
      }), expected);
      const verified = verifyRunCensus(stateRoot);
      assert.equal(verified.ok, true);
      assert.equal(verified.startedCount, 1);
      assert.equal(verified.contractBoundCount, 0);
      assert.equal(verified.openCount, 1);
      assert.equal(verified.runs[0].contractBinding, null);
      assert.doesNotMatch(readFileSync(entryFiles(stateRoot)[0], "utf8"),
        /PRIVATE OPERATOR GOAL/, "the local census stores a goal commitment, not raw words");
      reconcileOpenCensusRun({ stateRoot, runOrdinal: verified.runs[0].runOrdinal,
        terminalStatus: "UNFINALIZED", evidenceCommitment: evidence("d"),
        reasonCode: "PREFLIGHT_FAILURE_EVIDENCE" });
      const reconciled = verifyRunCensus(stateRoot);
      assert.equal(reconciled.openCount, 0);
      assert.equal(reconciled.runs[0].terminal.terminalStatus, "UNFINALIZED");
    });
  }
});

test("continuous ordinals retain SAFE, BLOCKED and explicit ABANDONED/UNFINALIZED terminals", () => {
  const stateRoot = root();
  const registrations = [1, 2, 3, 4].map((index) => registration(stateRoot, index));
  settleCensusRun({ stateRoot, registration: registrations[0], terminalStatus: "SAFE",
    evidenceCommitment: evidence("a"), reasonCode: "SEALED_SAFE_DELIVERY" });
  settleCensusRun({ stateRoot, registration: registrations[1], terminalStatus: "BLOCKED",
    evidenceCommitment: evidence("b"), reasonCode: "SEALED_CONTROL_BOUNDARY_CONTAINMENT" });
  reconcileCensusRun({ stateRoot, registration: registrations[2], terminalStatus: "ABANDONED",
    evidenceCommitment: evidence("c"), reasonCode: "OPERATOR_ABANDONMENT_EVIDENCE" });
  reconcileCensusRun({ stateRoot, registration: registrations[3], terminalStatus: "UNFINALIZED",
    evidenceCommitment: evidence("d"), reasonCode: "CRASH_RECONCILIATION_EVIDENCE" });
  const verified = verifyRunCensus(stateRoot);
  assert.equal(verified.ok, true);
  assert.deepEqual(verified.runs.map((run) => run.runOrdinal), [1, 2, 3, 4]);
  assert.deepEqual(verified.runs.map((run) => run.terminal.terminalStatus),
    ["SAFE", "BLOCKED", "ABANDONED", "UNFINALIZED"]);
  assert.equal(verified.entryCount, 12);
  assert.equal(verified.openCount, 0);
  assert.throws(() => reconcileCensusRun({ stateRoot, registration: registrations[0],
    terminalStatus: "BLOCKED", evidenceCommitment: evidence("f"),
    reasonCode: "CONFLICTING_TERMINAL" }), /RECONCILIATION_STATUS_INVALID|CONFLICTING_TERMINAL/);
  assert.throws(() => reconcileCensusRun({ stateRoot, registration: registration(stateRoot, 5),
    terminalStatus: "UNFINALIZED", reasonCode: "TIMEOUT_GUESS" }),
  /EVIDENCE_COMMITMENT_REQUIRED/, "elapsed time alone cannot close an open run");
});

test("tamper, gaps, duplicates and tail deletion all fail closed", async (t) => {
  const make = () => {
    const stateRoot = root();
    registration(stateRoot, 1);
    registration(stateRoot, 2);
    registration(stateRoot, 3);
    return stateRoot;
  };
  await t.test("tamper", () => {
    const stateRoot = make();
    const [first] = entryFiles(stateRoot);
    const changed = JSON.parse(readFileSync(first, "utf8"));
    changed.hostClass = "tampered";
    writeFileSync(first, JSON.stringify(changed), { mode: 0o600 });
    assert.match(verifyRunCensus(stateRoot).error, /HASH_CHAIN_BROKEN/);
  });
  await t.test("gap", () => {
    const stateRoot = make();
    rmSync(entryFiles(stateRoot)[1]);
    assert.match(verifyRunCensus(stateRoot).error, /ENTRY_SEQUENCE_GAP/);
  });
  await t.test("duplicate", () => {
    const stateRoot = make();
    const entries = entryFiles(stateRoot);
    const duplicate = path.join(censusPaths(stateRoot).entries, "00000000000000000004.json");
    copyFileSync(entries[2], duplicate);
    chmodSync(duplicate, 0o600);
    assert.match(verifyRunCensus(stateRoot).error, /HASH_CHAIN_BROKEN/);
  });
  await t.test("tail deletion", () => {
    const stateRoot = make();
    rmSync(entryFiles(stateRoot).at(-1));
    assert.match(verifyRunCensus(stateRoot).error, /HEAD_MISMATCH/);
  });
});

test("O_EXCL lock serializes concurrent STARTED allocation without missing ordinals", async () => {
  const stateRoot = root();
  const children = Array.from({ length: 8 }, (_, index) => new Promise((resolve, reject) => {
    const script = `import {registerCensusRun} from ${JSON.stringify(censusModuleUrl)};`
      + `registerCensusRun({stateRoot:process.argv[1],runId:'parallel-run-'+process.argv[2].padStart(4,'0'),`
      + `ask:'parallel task '+process.argv[2],`
      + `contractSeal:'sha256:'+String((Number(process.argv[2])%9)+1).repeat(64),host:'codex'});`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script,
      stateRoot, String(index + 1)], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  }));
  await Promise.all(children);
  const verified = verifyRunCensus(stateRoot);
  assert.equal(verified.ok, true);
  assert.equal(verified.startedCount, 8);
  assert.deepEqual(verified.runs.map((run) => run.runOrdinal), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("head recovery accepts one exact committed append lag and rejects a wider rewrite", () => {
  const stateRoot = root();
  const intake = (index) => registerCensusIntake({ stateRoot,
    runId: `intake-only-${String(index).padStart(4, "0")}`,
    ask: `intake task ${index}`, host: "codex" });
  intake(1);
  const headFile = censusPaths(stateRoot).head;
  const oneEntryHead = readFileSync(headFile, "utf8");
  intake(2);
  writeFileSync(headFile, oneEntryHead, { mode: 0o600 });
  assert.doesNotThrow(() => intake(3));
  assert.equal(verifyRunCensus(stateRoot).startedCount, 3);

  writeFileSync(headFile, oneEntryHead, { mode: 0o600 });
  assert.throws(() => intake(4), /RUN_CENSUS_HEAD_MISMATCH/,
    "a head more than one committed entry behind is not guessed forward");
});

test("unsafe symlink census roots are rejected instead of followed", () => {
  const stateRoot = root();
  const elsewhere = root("outsider-run-census-elsewhere-");
  symlinkSync(elsewhere, censusPaths(stateRoot).root);
  assert.throws(() => registration(stateRoot, 1), /RUN_CENSUS_ROOT_UNSAFE_TYPE/);
});

test("anchor commits an exact historical prefix and external trust is explicit", () => {
  const stateRoot = root();
  const first = registration(stateRoot, 1);
  settleCensusRun({ stateRoot, registration: first, terminalStatus: "SAFE",
    evidenceCommitment: evidence("a"), reasonCode: "SEALED_SAFE_DELIVERY" });
  const commitment = createCensusAnchorCommitment({ stateRoot });
  assert.equal(commitment.entryCount, 3);
  assert.equal(commitment.startedCount, 1);
  assert.equal(commitment.contractBoundCount, 1);
  assert.equal(commitment.terminalCount, 1);
  const serialized = JSON.stringify(commitment);
  assert.doesNotMatch(serialized, /controlled-run|prompt|workspace|command-output/);

  registration(stateRoot, 2);
  assert.equal(verifyCensusAnchorCommitment({ stateRoot, commitment }).ok, true,
    "an exact earlier prefix remains independently verifiable after append");
  const local = createLocalAnchorReceipt({ commitment });
  const localVerification = verifyAnchorReceipt({ stateRoot, receipt: local });
  assert.equal(localVerification.ok, true);
  assert.equal(localVerification.external, false);
  assert.throws(() => importExternalAnchorReceipt({ stateRoot, receipt: local }),
    /LOCAL_RECEIPT_NOT_EXTERNAL_ANCHOR/);

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const receipt = issueExternalAnchorReceipt({ commitment, providerId: "witness.example",
    privateKeyPem, observedAt: "2026-08-24T00:00:00.000Z" });
  const trustedPublicKeys = { [receipt.provider.keyId]: publicKeyPem };
  const checked = verifyAnchorReceipt({ stateRoot, receipt, trustedPublicKeys });
  assert.equal(checked.ok, true);
  assert.equal(checked.external, true);
  assert.equal(checked.providerId, "witness.example");
  const imported = importExternalAnchorReceipt({ stateRoot, receipt, trustedPublicKeys });
  assert.equal(imported.idempotent, false);
  assert.equal(importExternalAnchorReceipt({ stateRoot, receipt,
    trustedPublicKeys }).idempotent, true);

  const changedProvider = structuredClone(receipt);
  changedProvider.provider.providerId = "other.example";
  assert.match(verifyAnchorReceipt({ stateRoot, receipt: changedProvider,
    trustedPublicKeys }).error, /RECEIPT_HASH_BROKEN/);
  assert.match(verifyAnchorReceipt({ stateRoot, receipt,
    trustedPublicKeys: {} }).error, /UNTRUSTED/);

  assert.throws(() => issueExternalAnchorReceipt({ commitment, providerId: "witness.example",
    privateKeyPem, observedAt: "tomorrow" }), /OBSERVED_AT_INVALID/);
  const malformed = structuredClone(receipt);
  malformed.signature.value = `${malformed.signature.value}AAAA`;
  const { receiptHash: ignored, ...malformedBody } = malformed;
  malformed.receiptHash = hash(malformedBody);
  assert.match(verifyAnchorReceipt({ stateRoot, receipt: malformed,
    trustedPublicKeys }).error, /EXTERNAL_RECEIPT_SHAPE_INVALID/);
  const extra = structuredClone(receipt);
  extra.rawPrompt = "must never be accepted";
  const { receiptHash: ignoredExtra, ...extraBody } = extra;
  extra.receiptHash = hash(extraBody);
  assert.match(verifyAnchorReceipt({ stateRoot, receipt: extra,
    trustedPublicKeys }).error, /RECEIPT_SHAPE_INVALID/);

  assert.match(verifyAnchorReceipt({ stateRoot, receipt, externalVerifier: () => true }).error,
    /VERIFIER_PIN_REQUIRED/);
  const externalVerifierPin = evidence("9");
  assert.equal(verifyAnchorReceipt({ stateRoot, receipt, externalVerifierPin,
    externalVerifier: ({ verifierPin }) => ({ ok: true, verifierPin }) }).external, true);
});

test("caller policy and SCITT callback verify a bundle without promoting externality or independence",
  () => {
    const stateRoot = root("outsider-census-provider-neutral-anchor-");
    registration(stateRoot, 1);
    const policy = defaultAnchorPolicy();
    assert.notEqual(policy.requiredAssurance, "INDEPENDENT_PROVIDER_VERIFIED_EVIDENCE");
    const commitment = createCensusAnchorCommitment({ stateRoot, policy });
    const request = createExternalAnchorRequest({ commitment,
      profile: EXTERNAL_ANCHOR_PROFILES.SCITT });
    const providerId = "caller-labelled-independent.fixture";
    const externalEvidence = captureExternalAnchorEvidence({ request, providerId,
      artifact: Buffer.from([0xd2, 0x84, 0x40, 0xa0]),
      receivedAtLocal: "2026-08-26T01:02:03.000Z" });
    const trustPolicy = createExternalAnchorTrustPolicy({
      providerId,
      operatorRelationship: ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER,
      profile: EXTERNAL_ANCHOR_PROFILES.SCITT,
      endpointOrigin: "https://caller-labelled-independent.fixture",
      relationshipEvidenceHash: hash({ selfAuthoredClaim: "independent" }),
      trustMaterial: {
        kind: "SCITT_RFC9943_VERIFIER",
        transparencyServiceIssuer: "https://caller-labelled-independent.fixture",
        trustedKeysHash: hash({ keys: "selected by caller" }),
        verifierPin: hash({ callback: "selected by caller" }),
        witnessPolicyHash: null,
      },
    });
    const scittVerifier = ({ subjectDigest, transparencyServiceIssuer, verifierPin }) => ({
      ok: true,
      verifierPin,
      subjectDigest,
      transparencyServiceIssuer,
      inclusionVerified: true,
      consistencyVerified: false,
      existenceTimeVerified: false,
      providerProofTime: null,
      providerProofTimeVerified: false,
      independentWitnessesVerified: 0,
    });
    const options = { stateRoot, commitment, request, evidence: externalEvidence, policy,
      trustPolicy, trustedPolicyHash: trustPolicy.policyHash, scittVerifier };

    const imported = importCensusExternalAnchorEvidence(options);
    assert.equal(imported.idempotent, false);
    assert.equal(imported.externalAnchorBundleVerified, true);
    assert.equal(imported.external, false);
    assert.equal(imported.providerExternalityEstablished, false);
    assert.equal(imported.verificationDecisionAccepted, true);
    assert.equal(imported.builtInCryptographicVerification, false);
    assert.equal(imported.cryptographicArtifactVerified, false);
    assert.equal(imported.assurance, EXTERNAL_ANCHOR_ASSURANCE.VERIFICATION_DECISION_ONLY);
    assert.equal(imported.operatorRelationshipClaimed,
      ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER);
    assert.equal(imported.remoteClaimed, true);
    assert.equal(imported.independent, false);
    assert.equal(imported.operatorIndependenceEstablished, false);
    assert.equal(imported.externalPreselectionEstablished, false);
    assert.equal(imported.trustBoundary,
      "CALLER_SUPPLIED_POLICY_AND_TRUST_ROOT_NO_MAINTAINER_EXTERNAL_REGISTRY");
    assert.equal(imported.bundle.verification.independent, false);
    assert.equal(imported.bundle.verification.operatorIndependenceEstablished, false);
    assert.equal(imported.bundle.verification.providerExternalityEstablished, false);
    assert.equal(imported.bundle.verification.cryptographicArtifactVerified, false);
    assert.equal(importCensusExternalAnchorEvidence(options).idempotent, true);

    const replayed = verifyCensusExternalAnchorBundle({ stateRoot,
      bundle: imported.bundle, policy, trustPolicy,
      trustedPolicyHash: trustPolicy.policyHash, scittVerifier });
    assert.equal(replayed.ok, true, replayed.error);
    assert.equal(replayed.externalAnchorBundleVerified, true);
    assert.equal(replayed.external, false);
    assert.equal(replayed.providerExternalityEstablished, false);
    assert.equal(replayed.cryptographicArtifactVerified, false);
    assert.equal(replayed.independent, false);
    assert.equal(replayed.operatorIndependenceEstablished, false);
    assert.equal(replayed.externalPreselectionEstablished, false);

    const promoted = structuredClone(imported.bundle);
    promoted.verification.independent = true;
    const { verificationHash: ignoredVerificationHash, ...verificationBody }
      = promoted.verification;
    promoted.verification.verificationHash = hash(verificationBody);
    const { bundleHash: ignoredBundleHash, ...bundleBody } = promoted;
    promoted.bundleHash = hash(bundleBody);
    const promotedReplay = verifyCensusExternalAnchorBundle({ stateRoot,
      bundle: promoted, policy, trustPolicy,
      trustedPolicyHash: trustPolicy.policyHash, scittVerifier });
    assert.equal(promotedReplay.ok, false);
    assert.match(promotedReplay.error, /EXTERNAL_ANCHOR_VERIFICATION_MISMATCH/);
  });

test("a previously anchored tail deletion invalidates both ledger and receipt", () => {
  const stateRoot = root();
  registration(stateRoot, 1);
  registration(stateRoot, 2);
  const commitment = createCensusAnchorCommitment({ stateRoot });
  rmSync(entryFiles(stateRoot).at(-1));
  assert.equal(verifyRunCensus(stateRoot).ok, false);
  assert.equal(verifyCensusAnchorCommitment({ stateRoot, commitment }).ok, false);
});

function finalizableRun({ proofComplete = true, deliveryComplete = true } = {}) {
  const fixture = root("outsider-census-finalize-");
  const cwd = path.join(fixture, "workspace");
  const stateRoot = path.join(fixture, "runs");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "answer.js"), "export const answer = 42;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: "return exactly 42", acceptance: "node --test",
    semantic: { objective: "return 42", successCriteria: ["answer is 42"],
      architecturalConstraints: [], forbiddenShortcuts: [], scope: { in: [], out: [] },
      uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: evidence("f") },
    baselineEvidence: baseline });
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/private/worker", supervisorCommand: "private judge" });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "private judge",
    stateRoot, binding, host: "codex", runId: "finalizable-run-0001" });
  store.writeJson("baseline.json", baseline);
  store.append("contract_frozen", { baselineFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete, deliveryComplete,
    finalFingerprint: baseline.fingerprint });
  store.saveState({ status: "finalized", proof: {
    complete: proofComplete, deliveryComplete,
  } });
  return { fixture, stateRoot, store };
}

function legacyFinalizableRun() {
  const fixture = root("outsider-census-legacy-finalize-");
  const cwd = path.join(fixture, "workspace");
  const stateRoot = path.join(fixture, "runs");
  const runId = "legacy-finalizable-run-0001";
  const directory = path.join(stateRoot, runId);
  mkdirSync(cwd);
  mkdirSync(stateRoot, { mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(path.join(cwd, "answer.js"), "export const answer = 42;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({ cwd, ask: "legacy return exactly 42",
    acceptance: "node --test",
    semantic: { objective: "return 42", successCriteria: ["answer is 42"],
      architecturalConstraints: [], forbiddenShortcuts: [], scope: { in: [], out: [] },
      uncertainties: [] },
    semanticAudit: { passed: true, evidenceHash: evidence("e") },
    baselineEvidence: baseline });
  const supervisorCommand = "private legacy judge";
  const binding = createStage05ControlledWayBinding({ contract,
    workerExecutable: "/private/legacy-worker", supervisorCommand });
  /* Construct the historical v2 shape directly. Using RunStore.create and
     deleting its v3 census registration is not a legacy fixture. */
  const store = new RunStore({ runId, directory, cwd, contract, supervisorCommand,
    host: "codex", eventSchema: "outsider/kernel-event/v2", stateRoot, census: null });
  store.writeJson("contract.json", contract);
  store.writeJson("stage05-binding.json", binding);
  store.writeJson("baseline.json", baseline);
  store.saveState({
    schema: "outsider/kernel-run/v2",
    cwd,
    host: "codex",
    contractSeal: contract.seal,
    bindingHash: binding.bindingHash,
    workspaceIdentityHash: null,
    eventSchema: "outsider/kernel-event/v2",
    supervisorCommandHash: hash(supervisorCommand),
    status: "starting",
    openIntervention: null,
  });
  store.append("contract_frozen", { baselineFingerprint: baseline.fingerprint });
  store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
    finalFingerprint: baseline.fingerprint });
  store.saveState({ status: "finalized", proof: {
    complete: true, deliveryComplete: true,
  } });
  return { fixture, stateRoot, store };
}

function copyOpenCensus(stateRoot) {
  const source = censusPaths(stateRoot).root;
  const backup = `${source}.open-backup`;
  cpSync(source, backup, { recursive: true, preserveTimestamps: true });
  const secureCopiedTree = (current) => {
    const stat = lstatSync(current);
    chmodSync(current, stat.isDirectory() ? 0o700 : 0o600);
    if (stat.isDirectory()) {
      for (const name of readdirSync(current)) secureCopiedTree(path.join(current, name));
    }
  };
  secureCopiedTree(backup);
  return backup;
}

function restoreCensus(stateRoot, backup) {
  const destination = censusPaths(stateRoot).root;
  rmSync(destination, { recursive: true });
  renameSync(backup, destination);
}

test("successful Stage0.5 evidence sealing settles the pre-existing census registration", () => {
  const fixture = finalizableRun();
  assert.equal(verifyRunCensus(fixture.stateRoot).openCount, 1);
  const finalized = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(finalized.census.entry.terminalStatus, "SAFE");
  assert.equal(finalized.census.entry.evidenceCommitment, finalized.manifest.manifestHash);
  const verified = verifyRunCensus(fixture.stateRoot);
  assert.equal(verified.ok, true);
  assert.equal(verified.openCount, 0);
  assert.equal(verified.runs[0].terminal.terminalStatus, "SAFE");
  const stage05 = verifyStage05RunDirectory(fixture.store.directory);
  assert.equal(stage05.ok, true);
  assert.equal(stage05.census.terminal.terminalStatus, "SAFE");
  assert.equal(stage05.census.terminal.terminalClass, "SAFE_DELIVERY");
  assert.equal(stage05.census.terminal.terminalFactsHash, hash({
    terminalClass: "SAFE_DELIVERY", proofComplete: true, deliveryComplete: true,
  }));
  assert.equal(stage05.census.terminal.evidenceCommitment, finalized.manifest.manifestHash);
  assert.equal("run" in stage05, false);
  assert.equal("contract" in stage05, false);
  const privateRun = JSON.parse(readFileSync(path.join(fixture.store.directory, "run.json"),
    "utf8"));
  const privateContract = JSON.parse(readFileSync(
    path.join(fixture.store.directory, "contract.json"), "utf8"));
  const publicVerificationBytes = JSON.stringify(stage05);
  assert.equal(publicVerificationBytes.includes(privateContract.ask), false);
  assert.equal(publicVerificationBytes.includes(privateRun.cwd), false);
  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory] });
  const selfContainedAttestation = verifyAttestationV2(attestation);
  assert.equal(selfContainedAttestation.ok, true);
  assert.equal(selfContainedAttestation.sourceReverified, false,
    "default ATTEST verification checks the historical self-contained record only");
  const sourceVerifiedAttestation = verifyAttestationV2(attestation,
    { runDirectories: [fixture.store.directory] });
  assert.equal(sourceVerifiedAttestation.ok, true);
  assert.equal(sourceVerifiedAttestation.sourceReverified, true);
  assert.equal(verifyAttestationV2(attestation,
    { runDirectories: [fixture.store.directory, fixture.store.directory] }).ok, false,
    "source-aware verification must bind the exact source-run multiplicity");
});

test("a pre-existing census terminal rejects Stage0.5 sealing before any artifact write", () => {
  const fixture = finalizableRun();
  const state = fixture.store.readState();
  settleCensusRun({ stateRoot: fixture.stateRoot, registration: state.census,
    terminalStatus: "BLOCKED", evidenceCommitment: evidence("b"),
    terminalFacts: { terminalClass: "CONTROL_BOUNDARY_CONTAINMENT",
      proofComplete: false, deliveryComplete: false },
    reasonCode: "SEALED_CONTROL_BOUNDARY_CONTAINMENT" });
  assert.throws(() => finalizeStage05Evidence({ directory: fixture.store.directory }),
    /RUN_CENSUS_ALREADY_TERMINAL_BEFORE_EVIDENCE_SEAL/);
  for (const name of ["stage05-canonical-projection.json", "stage05-public-evidence.json",
    "stage05-evidence-manifest.json", "stage05-supervised-experience.json"]) {
    assert.equal(readdirSync(fixture.store.directory).includes(name), false, name);
  }
});

test("a manifest-before-census crash settles on retry, then repeats idempotently", () => {
  const fixture = finalizableRun();
  const openBackup = copyOpenCensus(fixture.stateRoot);
  const first = finalizeStage05Evidence({ directory: fixture.store.directory });
  restoreCensus(fixture.stateRoot, openBackup);
  assert.equal(verifyRunCensus(fixture.stateRoot).openCount, 1);
  assert.match(verifyStage05RunDirectory(fixture.store.directory).error,
    /RUN_CENSUS_TERMINAL_MISSING/,
    "artifact integrity alone must not report a census-covered v3 run as verified");

  const recovered = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(recovered.manifest.manifestHash, first.manifest.manifestHash);
  assert.equal(recovered.census.idempotent, false);
  assert.equal(recovered.census.entry.evidenceCommitment, first.manifest.manifestHash);
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);

  const repeated = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(repeated.manifest.manifestHash, first.manifest.manifestHash);
  assert.equal(repeated.census.idempotent, true);
});

test("an opposite census terminal keeps the manifest unverifiable and unattestable", () => {
  const fixture = finalizableRun();
  const openBackup = copyOpenCensus(fixture.stateRoot);
  const sealed = finalizeStage05Evidence({ directory: fixture.store.directory });
  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory] });
  restoreCensus(fixture.stateRoot, openBackup);
  const registration = fixture.store.readState().census;
  settleCensusRun({ stateRoot: fixture.stateRoot, registration,
    terminalStatus: "BLOCKED", evidenceCommitment: sealed.manifest.manifestHash,
    terminalFacts: { terminalClass: "CONTROL_BOUNDARY_CONTAINMENT",
      proofComplete: false, deliveryComplete: false },
    reasonCode: "SEALED_CONTROL_BOUNDARY_CONTAINMENT" });
  assert.match(verifyStage05RunDirectory(fixture.store.directory).error,
    /RUN_CENSUS_TERMINAL_MANIFEST_MISMATCH/);
  assert.throws(() => createAttestationV2({ runDirectories: [fixture.store.directory] }),
    /RUN_CENSUS_TERMINAL_MANIFEST_MISMATCH/);
  assert.equal(verifyAttestationV2(attestation,
    { runDirectories: [fixture.store.directory] }).ok, false,
    "source-aware ATTEST verification must replay the current census terminal");
  assert.throws(() => finalizeStage05Evidence({ directory: fixture.store.directory }),
    /RUN_CENSUS_CONFLICTING_TERMINAL/);
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, false,
    "artifact-only verification must never hide a conflicting census terminal");
});

test("v3 finalization rejects a removed census registration without backfilling one", () => {
  const fixture = finalizableRun();
  const stateFile = path.join(fixture.store.directory, "run.json");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  delete state.census;
  writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  assert.throws(() => finalizeStage05Evidence({ directory: fixture.store.directory }),
    /RUN_CENSUS_REGISTRATION_MISSING/);
  assert.equal(verifyRunCensus(fixture.stateRoot).openCount, 1);
  assert.equal(readdirSync(fixture.store.directory)
    .includes("stage05-evidence-manifest.json"), false);
});

test("verified-but-unattributed delivery keeps its exact census class", () => {
  const fixture = finalizableRun({ proofComplete: false, deliveryComplete: true });
  const finalized = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(finalized.manifest.terminal.terminalClass, "VERIFIED_DELIVERY_UNATTRIBUTED");
  assert.equal(finalized.census.entry.terminalStatus, "DELIVERED_UNATTRIBUTED");
  assert.equal(finalized.census.entry.proofComplete, false);
  assert.equal(finalized.census.entry.deliveryComplete, true);
  assert.equal(finalized.census.entry.reasonCode, "SEALED_DELIVERY_UNATTRIBUTED");
});

test("a genuine v2 run with no matching intake remains explicitly outside census", () => {
  const fixture = legacyFinalizableRun();
  const finalized = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.deepEqual(finalized.census, {
    legacy: true, covered: false, status: "LEGACY_NOT_CENSUS_COVERED",
  });
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory] });
  assert.equal(verifyAttestationV2(attestation,
    { runDirectories: [fixture.store.directory] }).sourceReverified, true);
});

test("relabeling a census-registered v3 run as v2 is a detected downgrade", () => {
  const fixture = finalizableRun();
  const stateFile = path.join(fixture.store.directory, "run.json");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  state.schema = "outsider/kernel-run/v2";
  delete state.census;
  writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  assert.throws(() => finalizeStage05Evidence({ directory: fixture.store.directory }),
    /RUN_CENSUS_SCHEMA_DOWNGRADE_DETECTED/);
  assert.equal(readdirSync(fixture.store.directory)
    .includes("stage05-evidence-manifest.json"), false);
});
