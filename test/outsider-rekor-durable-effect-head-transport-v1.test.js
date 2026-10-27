import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash, generateKeyPairSync, sign,
} from "node:crypto";
import {
  chmodSync, mkdtempSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  publishDurableEffectLedgerExternalHeadV1,
} from "../src/outsider-durable-effect-ledger-external-head-publication-v1.js";
import {
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import {
  createNetworkLifecycleRekorTrustPolicy,
} from "../src/outsider-network-lifecycle-rekor-anchor-v2.js";
import {
  createRekorDurableEffectHeadTransportV1,
  readCapturedRekorDurableEffectHeadBundleV1,
  verifyRekorDurableEffectHeadBundleV1,
} from "../src/outsider-rekor-durable-effect-head-transport-v1.js";

const REKOR_ORIGIN = "https://rekor.fixture.test";
const CHECKPOINT_ORIGIN = "rekor.fixture.test - 4242";
const CHECKPOINT_SIGNER = "rekor.fixture.test";
const LEDGER_ID = "ledger_0123456789abcdef0123456789abcdef";
const PUBLISHED_AT = "2026-09-04T12:05:00.000Z";
const INTEGRATED_AT = "2026-09-04T12:05:01.000Z";
const OBSERVED_AT = "2026-09-04T12:05:02.000Z";
const INTEGRATED_TIME = Date.parse(INTEGRATED_AT) / 1000;

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function pair(curve = "prime256v1") {
  const generated = generateKeyPairSync("ec", { namedCurve: curve });
  return {
    privateKey: generated.privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKey: generated.publicKey.export({ type: "spki", format: "pem" }),
    publicDer: generated.publicKey.export({ type: "spki", format: "der" }),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function initialize(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-rekor-effect-head-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = path.join(parent, "ledger");
  const genesis = createDurableOneUseEndpointEffectEventV1({
    ledgerId: LEDGER_ID,
    eventType: "INTENT_ADMITTED",
    effectIdHash: h("effect-1"),
    transactionBindingHash: h("transaction-1"),
    endpointBindingHash: h("endpoint-1"),
    adapterInstanceRefHash: h("adapter-1"),
    permissionGrantHash: h("permission-1"),
    oneUseNonceHash: h("nonce-1"),
    idempotencyKeyHash: h("idempotency-1"),
    bodyHash: h("body-1"),
    effectDeadline: "2026-09-04T14:00:00.000Z",
    recordedAt: "2026-09-04T12:00:00.000Z",
    previousEffectEventHash: null,
    occurrenceNonceHash: h("occurrence:intent"),
    endpointReceiptHash: null,
    terminalEvidenceHash: null,
  });
  const verified = initializeDurableOneUseEndpointEffectLedgerV1({
    directory, ledgerId: LEDGER_ID, genesisEvent: genesis,
  });
  return { directory, verified };
}

function publicationInput(initialized) {
  return {
    localLedger: {
      directory: initialized.directory,
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: initialized.verified.head.headHash,
    },
    publishedAt: PUBLISHED_AT,
    externalChain: { expectedSequence: 1, previousReceiptHash: null },
  };
}

function trustPolicy(log) {
  return createNetworkLifecycleRekorTrustPolicy({
    rekorOrigin: REKOR_ORIGIN,
    logKeyEpochs: [{
      logID: sha256(log.publicDer).toString("hex"),
      publicKeyPem: log.publicKey,
      checkpointOrigin: CHECKPOINT_ORIGIN,
      checkpointSignerName: CHECKPOINT_SIGNER,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }],
  });
}

function checkpoint(root, log, overrides = {}) {
  const origin = overrides.origin ?? CHECKPOINT_ORIGIN;
  const signerName = overrides.signerName ?? CHECKPOINT_SIGNER;
  const signer = overrides.signer ?? log;
  const noteText = `${origin}\n2\n${root.toString("base64")}\n`;
  const keyId = sha256(signer.publicDer).subarray(0, 4);
  const signature = sign("sha256", Buffer.from(noteText), signer.privateKey);
  return `${noteText}\n— ${signerName} ${Buffer.concat([keyId, signature])
    .toString("base64")}\n`;
}

function setSignature(entry, log) {
  return sign("sha256", Buffer.from(canonicalizeStrict({
    body: entry.body,
    integratedTime: entry.integratedTime,
    logID: entry.logID,
    logIndex: entry.logIndex,
  })), log.privateKey).toString("base64");
}

function rekorResponse(proposal, policy, log, mutate = null) {
  const bodyBytes = Buffer.from(canonicalizeStrict(proposal));
  const leaf = sha256(Buffer.concat([Buffer.from([0]), bodyBytes]));
  const sibling = sha256(Buffer.from("rekor-effect-head-sibling"));
  const root = sha256(Buffer.concat([Buffer.from([1]), leaf, sibling]));
  const entry = {
    body: bodyBytes.toString("base64"),
    integratedTime: INTEGRATED_TIME,
    logID: policy.logKeyEpochs[0].logID,
    logIndex: 0,
  };
  entry.verification = {
    inclusionProof: {
      checkpoint: checkpoint(root, log),
      hashes: [sibling.toString("hex")],
      logIndex: 0,
      rootHash: root.toString("hex"),
      treeSize: 2,
    },
    signedEntryTimestamp: setSignature(entry, log),
  };
  const uuid = `0123456789abcdef${leaf.toString("hex")}`;
  const response = { [uuid]: entry };
  if (mutate) mutate({ response, entry, root, sibling, uuid });
  return JSON.stringify(response);
}

function setupAdapter({ mutate = null, status = 201, operator = pair(),
  log = pair(), fetchThrows = false } = {}) {
  const policy = trustPolicy(log);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (fetchThrows) throw new Error("fixture transport ambiguity");
    const proposal = JSON.parse(options.body);
    return new Response(rekorResponse(proposal, policy, log, mutate), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  const adapter = createRekorDurableEffectHeadTransportV1({
    rekorOrigin: REKOR_ORIGIN,
    trustPolicy: policy,
    expectedTrustPolicyHash: policy.policyHash,
    operatorPrivateKeyPem: operator.privateKey,
    fetchImpl,
    clock: () => OBSERVED_AT,
  });
  return { adapter, calls, policy, operator, log };
}

function dependencies(adapter) {
  return {
    transport: adapter.transport,
    transportId: adapter.transportId,
    transportPolicyHash: adapter.transportPolicyHash,
    timeoutMs: 1_000,
  };
}

test("signed exact commitment gains pinned-log inclusion but remains HOLD",
  async (t) => {
    const initialized = initialize(t);
    const setup = setupAdapter();
    const published = await publishDurableEffectLedgerExternalHeadV1(
      publicationInput(initialized), dependencies(setup.adapter));

    assert.equal(setup.calls.length, 1);
    assert.equal(setup.calls[0].url, `${REKOR_ORIGIN}/api/v1/log/entries`);
    assert.equal(setup.calls[0].options.method, "POST");
    assert.equal(setup.calls[0].options.redirect, "error");
    const proposal = JSON.parse(setup.calls[0].options.body);
    assert.equal(proposal.apiVersion, "0.0.1");
    assert.equal(proposal.kind, "hashedrekord");
    assert.equal(proposal.spec.data.hash.algorithm, "sha256");

    const bundle = readCapturedRekorDurableEffectHeadBundleV1(setup.adapter, {
      expectedBundleHash: published.receipt.providerReceiptHash,
    });
    const replay = verifyRekorDurableEffectHeadBundleV1(bundle, {
      trustPolicy: setup.policy,
      expectedTrustPolicyHash: setup.policy.policyHash,
      expectedTransportPolicyHash: setup.adapter.transportPolicyHash,
      expectedBundleHash: bundle.bundleHash,
      expectedPublicationRequestHash: published.request.requestHash,
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.exactCommitmentSubjectBindingVerified, true);
    assert.equal(replay.operatorP256SignatureVerified, true);
    assert.equal(replay.signedEntryTimestampVerified, true);
    assert.equal(replay.rfc6962InclusionProofVerified, true);
    assert.equal(replay.signedCheckpointRootVerified, true);
    assert.equal(replay.externalInclusionUnderPinnedLogKeyEstablished, true);
    assert.equal(replay.providerAcknowledgementIsAuthority, false);
    assert.equal(replay.providerAcknowledgementIsOutcomeTruth, false);
    assert.equal(replay.independentWitnessEstablished, false);
    assert.equal(replay.externalNonEquivocationEstablished, false);
    assert.equal(replay.authority, "NONE");
    assert.equal(replay.decisionState, "HOLD");

    const publicBytes = `${JSON.stringify(setup.adapter)}${JSON.stringify(bundle)}`;
    assert.equal(publicBytes.includes(setup.operator.privateKey), false);
    assert.equal(publicBytes.includes(LEDGER_ID), false);
    assert.equal(publicBytes.includes(initialized.directory), false);
    assert.equal(bundle.strictPrimitivePredecessorSourceHash,
      "sha256:e1594a7ba04ef4ecb55a0b65ecbfafb764ad959baa93c5d38360a324532b627f");
  });

test("SET, inclusion path, checkpoint, and stored-body attacks all fail closed",
  async (t) => {
    const initialized = initialize(t);
    const attacker = pair();
    const attacks = [
      ({ entry }) => {
        const bytes = Buffer.from(entry.verification.signedEntryTimestamp, "base64");
        bytes[bytes.length - 1] ^= 1;
        entry.verification.signedEntryTimestamp = bytes.toString("base64");
      },
      ({ entry }) => { entry.verification.inclusionProof.hashes[0] = "a".repeat(64); },
      ({ entry, root }) => {
        entry.verification.inclusionProof.checkpoint = checkpoint(root, null, {
          signer: attacker,
        });
      },
      ({ entry }) => {
        const stored = JSON.parse(Buffer.from(entry.body, "base64").toString("utf8"));
        stored.spec.data.hash.value = "f".repeat(64);
        entry.body = Buffer.from(canonicalizeStrict(stored)).toString("base64");
      },
    ];
    for (const mutate of attacks) {
      const setup = setupAdapter({ mutate });
      await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
        publicationInput(initialized), dependencies(setup.adapter)),
      /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
      assert.equal(setup.calls.length, 1);
    }
  });

test("wrong origin, non-P256 key, HTTP failure and ambiguous POST do not promote",
  async (t) => {
    const log = pair();
    const policy = trustPolicy(log);
    const noFetch = async () => { throw new Error("must not fetch"); };
    assert.throws(() => createRekorDurableEffectHeadTransportV1({
      rekorOrigin: "https://different.fixture.test",
      trustPolicy: policy,
      expectedTrustPolicyHash: policy.policyHash,
      operatorPrivateKeyPem: pair().privateKey,
      fetchImpl: noFetch,
      clock: () => OBSERVED_AT,
    }), /REKOR_ORIGIN_PIN_MISMATCH/u);
    assert.throws(() => createRekorDurableEffectHeadTransportV1({
      rekorOrigin: REKOR_ORIGIN,
      trustPolicy: policy,
      expectedTrustPolicyHash: policy.policyHash,
      operatorPrivateKeyPem: pair("secp384r1").privateKey,
      fetchImpl: noFetch,
      clock: () => OBSERVED_AT,
    }), /OPERATOR_PRIVATE_KEY_P256_REQUIRED/u);

    const initialized = initialize(t);
    for (const setup of [setupAdapter({ status: 500 }),
      setupAdapter({ fetchThrows: true })]) {
      await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
        publicationInput(initialized), dependencies(setup.adapter)),
      /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
      assert.equal(setup.calls.length, 1);
    }
  });

test("offline replay requires exact trust, transport, request, and bundle pins",
  async (t) => {
    const initialized = initialize(t);
    const setup = setupAdapter();
    const published = await publishDurableEffectLedgerExternalHeadV1(
      publicationInput(initialized), dependencies(setup.adapter));
    const bundle = readCapturedRekorDurableEffectHeadBundleV1(setup.adapter, {
      expectedBundleHash: published.receipt.providerReceiptHash,
    });
    const base = {
      trustPolicy: setup.policy,
      expectedTrustPolicyHash: setup.policy.policyHash,
      expectedTransportPolicyHash: setup.adapter.transportPolicyHash,
      expectedBundleHash: bundle.bundleHash,
      expectedPublicationRequestHash: published.request.requestHash,
    };
    for (const override of [
      { expectedTrustPolicyHash: h("wrong-trust") },
      { expectedTransportPolicyHash: h("wrong-transport") },
      { expectedBundleHash: h("wrong-bundle") },
      { expectedPublicationRequestHash: h("wrong-request") },
    ]) {
      const replay = verifyRekorDurableEffectHeadBundleV1(bundle,
        { ...base, ...override });
      assert.equal(replay.ok, false);
      assert.equal(replay.externalInclusionUnderPinnedLogKeyEstablished, false);
      assert.equal(replay.authority, "NONE");
      assert.equal(replay.decisionState, "HOLD");
    }
  });
