import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { NETWORK_INTAKE_BOUNDARY } from "../src/outsider-network-intake.js";
import {
  NETWORK_LIFECYCLE_EVENT_GENESIS,
  createNetworkLifecycleAnchorOutboxRequest,
  createNetworkLifecycleHeadCheckpoint,
} from "../src/outsider-network-lifecycle-head-checkpoint.js";
import {
  NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY,
  NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS,
  assertNetworkLifecycleRekorAnchorRequest,
  assertNetworkLifecycleRekorTrustPolicy,
  createNetworkLifecycleRekorAnchorRequest,
  createNetworkLifecycleRekorTrustPolicy,
  sendNetworkLifecycleRekorAnchor,
  verifyNetworkLifecycleRekorAnchorBundle,
} from "../src/outsider-network-lifecycle-rekor-anchor.js";

const ENDPOINT = "https://rekor.fixture.test";
const CHECKPOINT_CREATED_AT = "2026-08-28T00:00:01.000Z";
const STATEMENT_CREATED_AT = "2026-08-28T00:00:02.000Z";
const INTEGRATED_AT = "2026-08-28T00:00:03.000Z";
const OBSERVED_AT = "2026-08-28T00:00:04.000Z";
const INTEGRATED_TIME = Date.parse(INTEGRATED_AT) / 1000;
const CHECKPOINT_ORIGIN = "rekor.fixture.test - 4242";
const CHECKPOINT_SIGNER_NAME = "rekor.fixture.test";
const SOURCE_BOUNDARY = {
  ...NETWORK_INTAKE_BOUNDARY,
  disposition: "QUARANTINED",
  automaticTraining: false,
  trainingRows: 0,
  authorityGrants: 0,
  actionAdmissions: 0,
  ceuUnits: 0,
  permitsAuthority: false,
  permitsAction: false,
  permitsCeu: false,
  permitsCuratePromotion: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
};

function pair() {
  const generated = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey: generated.privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKey: generated.publicKey.export({ type: "spki", format: "pem" }),
    publicDer: generated.publicKey.export({ type: "spki", format: "der" }),
  };
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest();
}

function sha256Hex(value) {
  return sha256Bytes(value).toString("hex");
}

function addressed(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:network-lifecycle-rekor-anchor:${domain}:v1\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function rawHash(bytes) {
  return `sha256:${sha256Hex(bytes)}`;
}

function lifecycleArtifacts() {
  const page = {
    schema: "outsider/network-quarantine-export/v1",
    registryId: "rekor-anchor-fixture-registry",
    generatedAt: "2026-08-28T00:00:00.000Z",
    lane: null,
    count: 0,
    items: [],
    nextCursor: null,
    eventChain: {
      eventCount: 0,
      tailHash: NETWORK_LIFECYCLE_EVENT_GENESIS,
      appendOnlyReplayVerified: true,
    },
    derivedLedgerAudit: { verified: true, sourceClaimOnly: true },
    occurrencePolicy:
      "CONTENT_IS_CAS_DEDUPLICATED_OCCURRENCES_ARE_NEVER_DEDUPLICATED",
    useBoundary: SOURCE_BOUNDARY,
  };
  const pageBytes = Buffer.from(`${JSON.stringify(page)}\n`, "utf8");
  const checkpoint = createNetworkLifecycleHeadCheckpoint({
    exportPageBytes: [pageBytes], createdAt: CHECKPOINT_CREATED_AT,
  });
  const outboxRequest = createNetworkLifecycleAnchorOutboxRequest({ checkpoint });
  return { checkpoint, outboxRequest };
}

function policyFor(log) {
  return createNetworkLifecycleRekorTrustPolicy({
    rekorOrigin: ENDPOINT,
    logKeyEpochs: [{
      logID: sha256Hex(log.publicDer),
      publicKeyPem: log.publicKey,
      checkpointOrigin: CHECKPOINT_ORIGIN,
      checkpointSignerName: CHECKPOINT_SIGNER_NAME,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }],
  });
}

function signedCheckpoint({ root, treeSize, signer, origin = CHECKPOINT_ORIGIN,
  signerName = CHECKPOINT_SIGNER_NAME }) {
  const noteText = `${origin}\n${treeSize}\n${root.toString("base64")}\n`;
  const keyId = sha256Bytes(signer.publicDer).subarray(0, 4);
  const signature = sign("sha256", Buffer.from(noteText, "utf8"), signer.privateKey);
  const encoded = Buffer.concat([keyId, signature]).toString("base64");
  return `${noteText}\n— ${signerName} ${encoded}\n`;
}

function setSignature(entry, privateKey) {
  return sign("sha256", Buffer.from(canonicalizeStrict({
    body: entry.body,
    integratedTime: entry.integratedTime,
    logID: entry.logID,
    logIndex: entry.logIndex,
  }), "utf8"), privateKey).toString("base64");
}

function rekorResponse({ request, policy, log, integratedTime = INTEGRATED_TIME }) {
  const bodyBytes = Buffer.from(canonicalizeStrict(request.proposal), "utf8");
  const leaf = sha256Bytes(Buffer.concat([Buffer.from([0x00]), bodyBytes]));
  const sibling = sha256Bytes(Buffer.from("rekor-fixture-sibling", "utf8"));
  const root = sha256Bytes(Buffer.concat([Buffer.from([0x01]), leaf, sibling]));
  const entry = {
    body: bodyBytes.toString("base64"),
    integratedTime,
    logID: policy.logKeyEpochs[0].logID,
    logIndex: 0,
  };
  const signedEntryTimestamp = setSignature(entry, log.privateKey);
  entry.verification = {
    inclusionProof: {
      checkpoint: signedCheckpoint({ root, treeSize: 2, signer: log }),
      hashes: [sibling.toString("hex")],
      logIndex: 0,
      rootHash: root.toString("hex"),
      treeSize: 2,
    },
    signedEntryTimestamp,
  };
  const uuid = `0123456789abcdef${leaf.toString("hex")}`;
  return { text: JSON.stringify({ [uuid]: entry }), uuid, root, sibling };
}

function fixture() {
  const source = lifecycleArtifacts();
  const operator = pair();
  const log = pair();
  const trustPolicy = policyFor(log);
  const request = createNetworkLifecycleRekorAnchorRequest({
    ...source,
    statementCreatedAt: STATEMENT_CREATED_AT,
    operatorPrivateKeyPem: operator.privateKey,
  });
  const response = rekorResponse({ request, policy: trustPolicy, log });
  return { ...source, operator, log, trustPolicy, request, response };
}

function mockFetch(fixtureValue, calls) {
  return async (url, options) => {
    calls.push({ url, options });
    assert.equal(url, `${ENDPOINT}/api/v1/log/entries`);
    assert.deepEqual(options, {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: canonicalizeStrict(fixtureValue.request.proposal),
    });
    return new Response(fixtureValue.response.text, {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
}

async function sendFixture(fixtureValue = fixture()) {
  const calls = [];
  let clockCalls = 0;
  const bundle = await sendNetworkLifecycleRekorAnchor({
    checkpoint: fixtureValue.checkpoint,
    outboxRequest: fixtureValue.outboxRequest,
    request: fixtureValue.request,
    trustPolicy: fixtureValue.trustPolicy,
    expectedTrustPolicyHash: fixtureValue.trustPolicy.policyHash,
    endpoint: ENDPOINT,
    fetchImpl: mockFetch(fixtureValue, calls),
    clock() { clockCalls += 1; return OBSERVED_AT; },
  });
  return { ...fixtureValue, calls, clockCalls, bundle };
}

function verifyInput(value, overrides = {}) {
  return {
    checkpoint: value.checkpoint,
    outboxRequest: value.outboxRequest,
    trustPolicy: value.trustPolicy,
    expectedTrustPolicyHash: value.trustPolicy.policyHash,
    expectedBundleHash: value.bundle.bundleHash,
    ...overrides,
  };
}

function resealBundle(bundle, mutateResponse) {
  const copy = structuredClone(bundle);
  const response = JSON.parse(Buffer.from(copy.response.utf8Base64, "base64")
    .toString("utf8"));
  mutateResponse(response, copy);
  const bytes = Buffer.from(JSON.stringify(response), "utf8");
  copy.response.utf8Base64 = bytes.toString("base64");
  copy.response.byteLength = bytes.length;
  copy.response.responseHash = rawHash(bytes);
  delete copy.bundleHash;
  copy.bundleHash = addressed("bundle", copy);
  return copy;
}

function resealClaims(bundle, mutate) {
  const copy = structuredClone(bundle);
  mutate(copy);
  delete copy.bundleHash;
  copy.bundleHash = addressed("bundle", copy);
  return copy;
}

function flipBase64(value) {
  const bytes = Buffer.from(value, "base64");
  bytes[bytes.length - 1] ^= 1;
  return bytes.toString("base64");
}

test("creates a digest-only P-256 hashedrekord/0.0.1 request without persisting the key",
  () => {
    const value = fixture();
    const checkedPolicy = assertNetworkLifecycleRekorTrustPolicy(value.trustPolicy, {
      expectedTrustPolicyHash: value.trustPolicy.policyHash,
    });
    const checkedRequest = assertNetworkLifecycleRekorAnchorRequest(value.request, {
      checkpoint: value.checkpoint, outboxRequest: value.outboxRequest,
    });
    assert.equal(checkedPolicy.rekorOrigin, ENDPOINT);
    assert.equal(checkedRequest.schema, NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.request);
    assert.equal(checkedRequest.proposal.apiVersion, "0.0.1");
    assert.equal(checkedRequest.proposal.kind, "hashedrekord");
    assert.equal(checkedRequest.proposal.spec.data.hash.algorithm, "sha256");
    assert.equal(checkedRequest.statement.checkpointHash, value.checkpoint.checkpointHash);
    assert.equal(checkedRequest.statement.anchorOutboxRequestHash,
      value.outboxRequest.requestHash);
    assert.equal(checkedRequest.statement.rawEventsIncluded, false);
    assert.equal(checkedRequest.statement.rawObjectsIncluded, false);
    assert.equal(checkedRequest.statement.rawPayloadsIncluded, false);
    assert.equal(checkedRequest.statement.exportPageBytesIncluded, false);
    assert.equal("registryId" in checkedRequest.statement, false);
    assert.equal("eventCount" in checkedRequest.statement, false);
    assert.equal("tailHash" in checkedRequest.statement, false);
    assert.equal("exportSetRoot" in checkedRequest.statement, false);
    assert.equal(JSON.stringify(checkedRequest).includes(value.operator.privateKey), false);
    assert.deepEqual(checkedRequest.boundary, NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY);
  });

test("local Rekor fixture yields only a replayable caller-policy crypto-response PARTIAL/HOLD bundle",
  async () => {
    const value = await sendFixture();
    assert.equal(value.calls.length, 1);
    assert.equal(value.clockCalls, 1);
    assert.equal(value.calls[0].options.redirect, "error");
    assert.equal(value.bundle.entryUUID, value.response.uuid);
    assert.equal(value.bundle.networkSubmissionPerformed, false);
    assert.equal(value.bundle.injectedTransportCallbackAccepted, true);
    assert.equal(value.bundle.cryptographicResponseVerifiedUnderCallerSuppliedPolicy, true);
    assert.equal(value.bundle.trustPolicyExternalPinProvenanceEstablished, false);
    assert.equal(value.bundle.transportProvenanceEstablished, false);
    assert.equal(value.bundle.integratedTimeWithinCallerObservedUpperBoundVerified, true);
    assert.equal(value.bundle.externalAnchorEstablishedWithinPinnedProviderScope, false);
    assert.equal(value.bundle.publicProviderInteroperabilityObserved, false);
    assert.equal(value.bundle.publicProviderLiveAnchorArtifactEstablished, false);
    assert.equal(value.bundle.independentWitnessEstablished, false);
    assert.equal(value.bundle.wormStorageEstablished, false);
    assert.equal(value.bundle.nonOmissionProofEstablished, false);
    assert.equal(value.bundle.nonEquivocationEstablished, false);
    assert.equal(value.bundle.longTermMonitoringEstablished, false);
    assert.equal(value.bundle.publicDeploymentReady, false);
    assert.equal(value.bundle.status, "PARTIAL");
    assert.equal(value.bundle.decision, "HOLD");
    assert.equal(value.bundle.authority, "NONE");
    assert.equal(value.bundle.authorityGrants, 0);
    assert.equal(value.bundle.actionReady, false);
    assert.equal(value.bundle.actionAuthorized, false);
    assert.equal(value.bundle.actionAdmissions, 0);
    assert.equal(value.bundle.executable, false);
    assert.equal(value.bundle.automaticTraining, false);
    assert.equal(value.bundle.productionTrainingAuthorized, false);
    assert.equal(value.bundle.trainingRows, 0);
    assert.equal(value.bundle.causalExperienceUnits, 0);
    assert.equal(value.bundle.pricingAuthorized, false);
    assert.equal(value.bundle.permitsPricing, false);
    assert.equal(value.bundle.guaranteeEstablished, false);
    assert.equal(value.bundle.permitsGuarantee, false);
    assert.equal(value.bundle.settlementAuthorized, false);
    assert.equal(value.bundle.permitsSettlement, false);
    assert.equal(value.bundle.boundary.releaseTestEvidenceClass,
      "LOCAL_SELF_GENERATED_CRYPTO_FIXTURE_ONLY");
    assert.equal(JSON.stringify(value.bundle).includes(value.operator.privateKey), false);

    const certificate = verifyNetworkLifecycleRekorAnchorBundle(value.bundle,
      verifyInput(value));
    assert.equal(certificate.ok, true);
    assert.equal(certificate.expectedBundleHash, value.bundle.bundleHash);
    assert.equal(certificate.exactBodyBindingVerified, true);
    assert.equal(certificate.operatorSignatureVerified, true);
    assert.equal(certificate.logKeyEpochPinVerified, true);
    assert.equal(certificate.signedEntryTimestampVerified, true);
    assert.equal(certificate.entryUUIDLeafSuffixVerified, true);
    assert.equal(certificate.rfc6962InclusionProofVerified, true);
    assert.equal(certificate.signedCheckpointRootVerified, true);
    assert.equal(certificate.integratedTimeChronologyVerified, true);
    assert.equal(certificate.networkSubmissionPerformed, false);
    assert.equal(certificate.injectedTransportCallbackAccepted, true);
    assert.equal(certificate.cryptographicResponseVerifiedUnderCallerSuppliedPolicy, true);
    assert.equal(certificate.trustPolicyExternalPinProvenanceEstablished, false);
    assert.equal(certificate.transportProvenanceEstablished, false);
    assert.equal(certificate.integratedTimeWithinCallerObservedUpperBoundVerified, true);
    assert.equal(certificate.externalAnchorEstablishedWithinPinnedProviderScope, false);
    assert.equal(certificate.status, "PARTIAL");
    assert.equal(certificate.decision, "HOLD");
    assert.equal(certificate.authority, "NONE");
    assert.equal(certificate.trainingRows, 0);
    assert.equal(certificate.causalExperienceUnits, 0);
    assert.equal(certificate.permitsPricing, false);
    assert.equal(certificate.permitsGuarantee, false);
    assert.equal(certificate.permitsSettlement, false);
  });

test("offline replay requires independent trust-policy and bundle hash pins", async () => {
  const value = await sendFixture();
  const missing = verifyNetworkLifecycleRekorAnchorBundle(value.bundle, {
    ...verifyInput(value), expectedBundleHash: undefined,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.externalAnchorEstablishedWithinPinnedProviderScope, false);
  assert.match(missing.error, /EXPECTED_BUNDLE_HASH_INVALID/u);

  const wrong = verifyNetworkLifecycleRekorAnchorBundle(value.bundle, {
    ...verifyInput(value), expectedBundleHash: `sha256:${"0".repeat(64)}`,
  });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /EXPECTED_BUNDLE_HASH_MISMATCH/u);

  const wrongPolicyPin = verifyNetworkLifecycleRekorAnchorBundle(value.bundle, {
    ...verifyInput(value), expectedTrustPolicyHash: `sha256:${"1".repeat(64)}`,
  });
  assert.equal(wrongPolicyPin.ok, false);
  assert.match(wrongPolicyPin.error, /EXPECTED_TRUST_POLICY_HASH_MISMATCH/u);
});

test("self-resealed network-submission or external-anchor true claims fail closed", async () => {
  const value = await sendFixture();
  const attacks = [
    resealClaims(value.bundle, (bundle) => { bundle.networkSubmissionPerformed = true; }),
    resealClaims(value.bundle, (bundle) => {
      bundle.externalAnchorEstablishedWithinPinnedProviderScope = true;
    }),
  ];
  for (const attacked of attacks) {
    const report = verifyNetworkLifecycleRekorAnchorBundle(attacked,
      verifyInput(value, { expectedBundleHash: attacked.bundleHash }));
    assert.equal(report.ok, false);
    assert.match(report.error, /BUNDLE_STATE_INVALID/u);
    assert.equal(report.networkSubmissionPerformed, false);
    assert.equal(report.externalAnchorEstablishedWithinPinnedProviderScope, false);
    assert.equal(report.cryptographicResponseVerifiedUnderCallerSuppliedPolicy, false);
  }
});

test("body, SET, inclusion path, UUID, and integrated-time splices remain HOLD", async () => {
  const value = await sendFixture();
  const attacks = [];
  attacks.push(["body", resealBundle(value.bundle, (response) => {
    const uuid = Object.keys(response)[0];
    const entry = response[uuid];
    const stored = JSON.parse(Buffer.from(entry.body, "base64").toString("utf8"));
    stored.spec.data.hash.value = "f".repeat(64);
    entry.body = Buffer.from(canonicalizeStrict(stored), "utf8").toString("base64");
  }), /REKOR_BODY_BINDING_INVALID/u]);
  attacks.push(["SET", resealBundle(value.bundle, (response) => {
    const entry = response[Object.keys(response)[0]];
    entry.verification.signedEntryTimestamp = flipBase64(
      entry.verification.signedEntryTimestamp);
  }), /SIGNED_ENTRY_TIMESTAMP_INVALID/u]);
  attacks.push(["inclusion path", resealBundle(value.bundle, (response) => {
    const entry = response[Object.keys(response)[0]];
    entry.verification.inclusionProof.hashes[0] = "a".repeat(64);
  }), /INCLUSION_PROOF_INVALID/u]);
  attacks.push(["inclusion position", resealBundle(value.bundle, (response) => {
    const entry = response[Object.keys(response)[0]];
    entry.verification.inclusionProof.logIndex = 1;
  }), /REKOR_ENTRY_POSITION_OR_TIME_INVALID/u]);
  attacks.push(["UUID leaf suffix", resealBundle(value.bundle, (response, bundle) => {
    const uuid = Object.keys(response)[0];
    const forged = `${uuid.slice(0, -1)}${uuid.endsWith("0") ? "1" : "0"}`;
    response[forged] = response[uuid];
    delete response[uuid];
    bundle.entryUUID = forged;
  }), /ENTRY_UUID_LEAF_SUFFIX_MISMATCH/u]);
  attacks.push(["integrated time", resealBundle(value.bundle, (response, bundle) => {
    const entry = response[Object.keys(response)[0]];
    entry.integratedTime = Date.parse("2026-08-28T00:00:01.000Z") / 1000;
    entry.verification.signedEntryTimestamp = setSignature(entry, value.log.privateKey);
    bundle.integratedTime = entry.integratedTime;
  }), /INTEGRATED_TIME_CHRONOLOGY_INVALID/u]);

  for (const [label, attacked, expectedError] of attacks) {
    const report = verifyNetworkLifecycleRekorAnchorBundle(attacked,
      verifyInput(value, { expectedBundleHash: attacked.bundleHash }));
    assert.equal(report.ok, false, label);
    assert.equal(report.externalAnchorEstablishedWithinPinnedProviderScope, false, label);
    assert.match(report.error, expectedError, label);
    assert.equal(report.status, "PARTIAL", label);
    assert.equal(report.decision, "HOLD", label);
  }
});

test("a self-consistent root/path splice fails the pinned signed-checkpoint key", async () => {
  const value = await sendFixture();
  const attacker = pair();
  const attacked = resealBundle(value.bundle, (response, bundle) => {
    const entry = response[Object.keys(response)[0]];
    const bodyBytes = Buffer.from(entry.body, "base64");
    const leaf = sha256Bytes(Buffer.concat([Buffer.from([0x00]), bodyBytes]));
    const sibling = sha256Bytes(Buffer.from("attacker-sibling", "utf8"));
    const root = sha256Bytes(Buffer.concat([Buffer.from([0x01]), leaf, sibling]));
    entry.verification.inclusionProof.hashes = [sibling.toString("hex")];
    entry.verification.inclusionProof.rootHash = root.toString("hex");
    entry.verification.inclusionProof.checkpoint = signedCheckpoint({
      root, treeSize: 2, signer: attacker,
    });
    bundle.inclusionRootHash = root.toString("hex");
  });
  const report = verifyNetworkLifecycleRekorAnchorBundle(attacked,
    verifyInput(value, { expectedBundleHash: attacked.bundleHash }));
  assert.equal(report.ok, false);
  assert.match(report.error, /PINNED_CHECKPOINT_SIGNATURE_NOT_FOUND/u);
  assert.equal(report.externalAnchorEstablishedWithinPinnedProviderScope, false);
});

test("endpoint and injected-transport/clock validation happen before any POST", async () => {
  const value = fixture();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("SHOULD_NOT_FETCH"); };
  const base = {
    checkpoint: value.checkpoint,
    outboxRequest: value.outboxRequest,
    request: value.request,
    trustPolicy: value.trustPolicy,
    expectedTrustPolicyHash: value.trustPolicy.policyHash,
    endpoint: ENDPOINT,
    fetchImpl,
    clock: () => OBSERVED_AT,
  };
  await assert.rejects(sendNetworkLifecycleRekorAnchor({
    ...base, endpoint: "https://other.fixture.test",
  }), /ENDPOINT_PINNED_ORIGIN_MISMATCH/u);
  await assert.rejects(sendNetworkLifecycleRekorAnchor({
    ...base, endpoint: "http://rekor.fixture.test",
  }), /ENDPOINT_EXACT_HTTPS_ORIGIN_REQUIRED/u);
  await assert.rejects(sendNetworkLifecycleRekorAnchor({
    ...base, fetchImpl: undefined,
  }), /INJECTED_FETCH_REQUIRED/u);
  await assert.rejects(sendNetworkLifecycleRekorAnchor({
    ...base, clock: undefined,
  }), /INJECTED_CLOCK_REQUIRED/u);
  await assert.rejects(sendNetworkLifecycleRekorAnchor({
    ...base, clock: new Proxy(() => OBSERVED_AT, {}),
  }), /INJECTED_CLOCK_REQUIRED/u);
  assert.equal(calls, 0);
});

test("clock identity is captured before await and invoked exactly once after the response",
  async () => {
    const value = fixture();
    let originalClockCalls = 0;
    let replacementClockCalls = 0;
    let responseDelivered = false;
    const originalClock = () => {
      originalClockCalls += 1;
      assert.equal(responseDelivered, true);
      return OBSERVED_AT;
    };
    const sendInput = {
      checkpoint: value.checkpoint,
      outboxRequest: value.outboxRequest,
      request: value.request,
      trustPolicy: value.trustPolicy,
      expectedTrustPolicyHash: value.trustPolicy.policyHash,
      endpoint: ENDPOINT,
      fetchImpl: async () => {
        sendInput.clock = () => {
          replacementClockCalls += 1;
          return "2027-12-31T23:59:59.000Z";
        };
        responseDelivered = true;
        return new Response(value.response.text, { status: 201,
          headers: { "content-type": "application/json" } });
      },
      clock: originalClock,
    };
    const bundle = await sendNetworkLifecycleRekorAnchor(sendInput);
    assert.equal(originalClockCalls, 1);
    assert.equal(replacementClockCalls, 0);
    assert.equal(bundle.receivedAtLocallyObserved, OBSERVED_AT);
    assert.equal(bundle.networkSubmissionPerformed, false);
    assert.equal(bundle.externalAnchorEstablishedWithinPinnedProviderScope, false);
  });

test("a trusted, fully signed future Rekor entry is rejected against observed clock time",
  async () => {
    const value = fixture();
    value.response = rekorResponse({
      request: value.request,
      policy: value.trustPolicy,
      log: value.log,
      integratedTime: Date.parse("2026-08-28T00:00:05.000Z") / 1000,
    });
    let calls = 0;
    await assert.rejects(sendNetworkLifecycleRekorAnchor({
      checkpoint: value.checkpoint,
      outboxRequest: value.outboxRequest,
      request: value.request,
      trustPolicy: value.trustPolicy,
      expectedTrustPolicyHash: value.trustPolicy.policyHash,
      endpoint: ENDPOINT,
      fetchImpl: async () => {
        calls += 1;
        return new Response(value.response.text, { status: 201,
          headers: { "content-type": "application/json" } });
      },
      clock: () => OBSERVED_AT,
    }), /INTEGRATED_TIME_CHRONOLOGY_INVALID/u);
    assert.equal(calls, 1);
  });

test("log-ID/public-key and externally pinned key-policy splices fail closed", async () => {
  const value = await sendFixture();
  const otherLog = pair();
  assert.throws(() => createNetworkLifecycleRekorTrustPolicy({
    rekorOrigin: ENDPOINT,
    logKeyEpochs: [{
      ...value.trustPolicy.logKeyEpochs[0],
      publicKeyPem: otherLog.publicKey,
    }],
  }), /LOG_ID_PUBLIC_KEY_MISMATCH/u);

  const otherPolicy = policyFor(otherLog);
  const report = verifyNetworkLifecycleRekorAnchorBundle(value.bundle, {
    ...verifyInput(value),
    trustPolicy: otherPolicy,
    expectedTrustPolicyHash: otherPolicy.policyHash,
  });
  assert.equal(report.ok, false);
  assert.match(report.error, /BUNDLE_POLICY_BINDING_INVALID/u);
  assert.equal(report.externalAnchorEstablishedWithinPinnedProviderScope, false);
});

test("captured JSON, Buffer, hash, Set, URL, and Response intrinsics survive replacement",
  async () => {
    const value = fixture();
    const NativeSet = globalThis.Set;
    const NativeResponse = globalThis.Response;
    const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
    const methodReplacements = [
      [JSON, "parse"], [JSON, "stringify"],
      [Buffer, "from"], [Buffer.prototype, "toString"],
      [Buffer.prototype, "equals"], [Buffer.prototype, "subarray"],
      [hashPrototype, "update"], [hashPrototype, "digest"],
      [NativeSet.prototype, "add"], [NativeSet.prototype, "delete"],
      [NativeSet.prototype, "has"],
      [String.prototype, "endsWith"], [String.prototype, "indexOf"],
      [String.prototype, "slice"], [String.prototype, "split"],
      [String.prototype, "trimEnd"],
      [Response.prototype, "text"], [Headers.prototype, "get"],
    ].map(([object, key]) => ({ object, key, descriptor:
      Object.getOwnPropertyDescriptor(object, key) }));
    const urlNames = ["protocol", "origin", "username", "password", "pathname",
      "search", "hash"];
    const urlDescriptors = urlNames.map((key) => ({ key,
      descriptor: Object.getOwnPropertyDescriptor(URL.prototype, key) }));
    let bundle;
    let failure;
    try {
      globalThis.Set = class PoisonedSet {
        constructor() { throw new Error("POISONED_SET"); }
      };
      globalThis.Response = class PoisonedResponse {
        constructor() { throw new Error("POISONED_RESPONSE"); }
      };
      for (const replacement of methodReplacements) {
        Object.defineProperty(replacement.object, replacement.key, {
          ...replacement.descriptor,
          value() { throw new Error("POISONED_INTRINSIC"); },
        });
      }
      for (const replacement of urlDescriptors) {
        Object.defineProperty(URL.prototype, replacement.key, {
          ...replacement.descriptor,
          get() { throw new Error("POISONED_URL_INTRINSIC"); },
        });
      }
      bundle = await sendNetworkLifecycleRekorAnchor({
        checkpoint: value.checkpoint,
        outboxRequest: value.outboxRequest,
        request: value.request,
        trustPolicy: value.trustPolicy,
        expectedTrustPolicyHash: value.trustPolicy.policyHash,
        endpoint: ENDPOINT,
        fetchImpl: async () => new NativeResponse(value.response.text, {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
        clock: () => OBSERVED_AT,
      });
    } catch (error) {
      failure = error;
    } finally {
      for (const replacement of methodReplacements) {
        Object.defineProperty(replacement.object, replacement.key, replacement.descriptor);
      }
      for (const replacement of urlDescriptors) {
        Object.defineProperty(URL.prototype, replacement.key, replacement.descriptor);
      }
      globalThis.Set = NativeSet;
      globalThis.Response = NativeResponse;
    }
    assert.ifError(failure);
    const report = verifyNetworkLifecycleRekorAnchorBundle(bundle, {
      checkpoint: value.checkpoint,
      outboxRequest: value.outboxRequest,
      trustPolicy: value.trustPolicy,
      expectedTrustPolicyHash: value.trustPolicy.policyHash,
      expectedBundleHash: bundle.bundleHash,
    });
    assert.equal(report.ok, true);
  });
