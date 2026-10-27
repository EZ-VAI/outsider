import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import {
  createEpisodeAttemptSetExternalWitnessKeyPolicyV3,
  createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3,
  replayEpisodeAttemptSetExternalWitnessTrustMaterialV3,
} from "../src/outsider-episode-attempt-set-external-witness-trust-material-v3.js";
import {
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY,
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_PROOF_MATRIX,
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS,
  createEpisodeAttemptSetExternalWitnessTrustBindingPolicyV4,
  replayEpisodeAttemptSetExternalWitnessTrustBoundV4,
} from "../src/outsider-episode-attempt-set-external-witness-trust-bound-v4.js";
import {
  cloneTrustBoundV4FixtureValue,
  createEpisodeAttemptSetExternalWitnessTrustBoundV4Fixture,
  trustBoundV4Hash,
} from "./helpers/outsider-episode-attempt-set-external-witness-trust-bound-v4-fixture.js";

const cleanup = [];
let baseline;
let sixteenWitnessBaseline;

before(() => {
  baseline = createEpisodeAttemptSetExternalWitnessTrustBoundV4Fixture({
    after(callback) { cleanup.push(callback); },
  });
  sixteenWitnessBaseline = createEpisodeAttemptSetExternalWitnessTrustBoundV4Fixture({
    after(callback) { cleanup.push(callback); },
  }, {
    witnessCount: 16,
    witnessQuorum: 15,
    localHead: baseline.externalWitnessV2.context.localHead,
  });
});

after(() => {
  for (let index = cleanup.length - 1; index >= 0; index -= 1) cleanup[index]();
});

function replay(built = baseline) {
  return replayEpisodeAttemptSetExternalWitnessTrustBoundV4(
    built.record, built.context);
}

function policyFromInput(input) {
  return createEpisodeAttemptSetExternalWitnessTrustBindingPolicyV4(input);
}

function withBindingPolicyInput(built, mutate) {
  const input = cloneTrustBoundV4FixtureValue(built.bindingPolicyInput);
  mutate(input);
  const bindingPolicy = policyFromInput(input);
  return {
    ...built,
    bindingPolicyInput: input,
    bindingPolicy,
    record: { ...built.record, bindingPolicy },
    context: { ...built.context, expectedBindingPolicyHash: bindingPolicy.policyHash },
  };
}

function witnessInputFromPolicy(policy) {
  return {
    providerOrigin: policy.providerOrigin,
    providerOperator: policy.providerOperator,
    quorum: policy.quorum,
    witnesses: policy.witnesses.map((witness) => ({
      name: witness.name,
      operator: witness.operator,
      publicKey: {
        keyDetails: witness.publicKey.keyDetails,
        rawBytes: witness.publicKey.rawBytes,
      },
    })),
  };
}

function rebuildTrustMaterialWithWitnessMutation(built, mutate) {
  const witnessInput = witnessInputFromPolicy(built.trustMaterialV3.witnessPolicy);
  mutate(witnessInput);
  const witnessPolicy = createEpisodeAttemptSetExternalWitnessKeyPolicyV3(witnessInput);
  const oldPolicy = built.trustMaterialV3.policy;
  const policy = createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3({
    repositoryId: oldPolicy.repositoryId,
    tufSpecVersion: oldPolicy.tuf.specVersion,
    updateStartTime: oldPolicy.tuf.updateStartTime,
    bootstrapRootHash: oldPolicy.tuf.bootstrapRootHash,
    bootstrapRootVersion: oldPolicy.tuf.bootstrapRootVersion,
    expectedFinalRootVersion: oldPolicy.tuf.expectedFinalRootVersion,
    expectedTimestampVersion: oldPolicy.tuf.expectedTimestampVersion,
    expectedSnapshotVersion: oldPolicy.tuf.expectedSnapshotVersion,
    expectedTargetsVersion: oldPolicy.tuf.expectedTargetsVersion,
    trustedRootTargetPath: oldPolicy.tuf.trustedRootTargetPath,
    signingConfigTargetPath: oldPolicy.tuf.signingConfigTargetPath,
    rekor: {
      endpointOrigin: oldPolicy.rekor.endpointOrigin,
      operator: oldPolicy.rekor.operator,
      logIdBase64: oldPolicy.rekor.logIdBase64,
      checkpointKeyIdBase64: oldPolicy.rekor.checkpointKeyIdBase64,
    },
    witnessPolicy,
    expectedWitnessPolicyHash: witnessPolicy.policyHash,
  });
  const record = { ...built.trustMaterialV3.record, policy };
  const context = { expectedPolicyHash: policy.policyHash };
  const report = replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(record, context);
  assert.equal(report.ok, true, report.error);

  const bindingInput = cloneTrustBoundV4FixtureValue(built.bindingPolicyInput);
  bindingInput.parentPins.trustMaterialV3VerificationHash = report.verificationHash;
  bindingInput.parentPins.trustMaterialV3PolicyHash = policy.policyHash;
  bindingInput.parentPins.localWitnessPolicyV3Hash = witnessPolicy.policyHash;
  const bindingPolicy = policyFromInput(bindingInput);
  return {
    ...built,
    bindingPolicyInput: bindingInput,
    bindingPolicy,
    trustMaterialV3: { ...built.trustMaterialV3, record, context, report,
      policy, witnessPolicy },
    record: { ...built.record, bindingPolicy, trustMaterialRecordV3: record },
    context: { ...built.context, trustMaterialV3: context,
      expectedBindingPolicyHash: bindingPolicy.policyHash },
  };
}

function p256ExactSpkiDerHash(pair) {
  return `sha256:${createHash("sha256").update(pair.der).digest("hex")}`;
}

function assertMonotonicAndNativeSafetyBoundary(value) {
  for (const field of [
    "sourceReplayVerified",
    "directParticipantConfirmationEstablished",
    "rightsPrivacyAdjudicationEstablished",
    "networkOrderEstablished",
    "independentOutcomeTruthEstablished",
    "causalAttributionEstablished",
    "recoveryExternallyVerified",
    "obligationClosureEstablished",
    "outsiderCanOverrideNativeSafetyVeto",
  ]) assert.equal(value[field], false, field);
  assert.equal(value.nativeSafetyUnconditionalVetoPreserved, true);
}

test("freshly replays both parents and binds one exact private P-256 trust crosswalk",
  () => {
    const report = replay();
    assert.equal(report.ok, true, report.error);
    assert.equal(report.schema,
      EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.verification);
    assert.equal(report.replayClass,
      "TWO_PARENT_ATTEMPT_TUF_REKOR_TRUST_CROSSWALK_REPLAY_HOLD_ONLY");
    assert.equal(report.bindingPolicyHash, baseline.bindingPolicy.policyHash);
    assert.equal(report.externalWitnessV2VerificationHash,
      baseline.externalWitnessV2.report.verificationHash);
    assert.equal(report.trustMaterialV3VerificationHash,
      baseline.trustMaterialV3.report.verificationHash);
    assert.equal(report.candidateHash, baseline.externalWitnessV2.report.candidateHash);
    assert.equal(report.requestHash, baseline.externalWitnessV2.report.requestHash);
    assert.equal(report.headBindingHash, baseline.externalWitnessV2.report.headBindingHash);
    assert.equal(report.localHeadHash, baseline.externalWitnessV2.report.localHeadHash);
    assert.equal(report.localHeadVerificationHash,
      baseline.externalWitnessV2.report.localHeadVerificationHash);
    assert.equal(report.externalWitnessTrustPolicyHash,
      baseline.externalWitnessV2.trustPolicy.policyHash);
    assert.equal(report.externalWitnessTransportPolicyHash,
      baseline.externalWitnessV2.transportPolicy.policyHash);
    assert.equal(report.trustMaterialV3PolicyHash,
      baseline.trustMaterialV3.policy.policyHash);
    assert.equal(report.witnessPolicyV3Hash,
      baseline.trustMaterialV3.witnessPolicy.policyHash);
    assert.equal(report.bothParentsFreshReplayVerified, true);
    assert.equal(report.attemptFullAncestryAndHeadBindingVerified, true);
    assert.equal(report.exactEndpointAndTransportPolicyMapped, true);
    assert.equal(report.exactTufSelectedLogKeyCommitmentMapped, true);
    assert.equal(report.exactLocalWitnessKeyPolicyMapped, true);
    assert.equal(
      report.tufTrustedRootAndSigningConfigReplayVerifiedUnderCallerBootstrap, true);
    assert.equal(report.rekorBinding.endpointOrigin,
      baseline.trustMaterialV3.policy.rekor.endpointOrigin);
    assert.equal(report.rekorBinding.endpointPath, "/api/v2/log/entries");
    assert.equal(report.rekorBinding.endpointUrl,
      `${baseline.trustMaterialV3.policy.rekor.endpointOrigin}/api/v2/log/entries`);
    assert.equal(report.rekorBinding.method, "POST");
    assert.equal(report.rekorBinding.redirectPolicy, "ERROR");
    assert.equal(report.rekorBinding.externalWitnessProviderId,
      baseline.bindingPolicy.providerOperatorMapping.externalWitnessProviderId);
    assert.equal(report.rekorBinding.sigstoreOperator,
      baseline.bindingPolicy.providerOperatorMapping.sigstoreOperator);
    assert.equal(report.rekorBinding.keyDetails, "PKIX_ECDSA_P256_SHA_256");
    assert.equal(report.rekorBinding.exactSpkiDerHash,
      p256ExactSpkiDerHash(baseline.log));
    assert.equal(report.rekorBinding.logIdBase64,
      createHash("sha256").update(baseline.log.der).digest("base64"));
    assert.equal(report.rekorBinding.checkpointKeyIdBase64,
      createHash("sha256").update(baseline.log.der).digest()
        .subarray(0, 4).toString("base64"));
    assert.equal(report.witnessQuorum, 2);
    assert.equal(report.witnessCount, 2);
    assert.equal(report.status, "PARTIAL");
    assert.equal(report.decisionState, "HOLD");
    assert.equal(report.authority, "NONE");
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.rekorBinding), true);
  });

test("aggregate key-parse usage includes the nested v3 witness-policy replay", () => {
  const report = replay();
  assert.equal(report.ok, true, report.error);
  assert.equal(report.crosswalkOperationBudgetEnforced, true);
  assert.equal(report.nestedWitnessPolicyReplayIncludedInCrosswalkBudget, true);
  assert.equal(report.crosswalkOperationUsage.publicKeyParseOperations, 5);
  assert.equal(report.crosswalkOperationUsage.witnessesMapped, 2);
  assert.equal(
    report.crosswalkOperationUsage.nestedWitnessPolicyReplayPublicKeyParseOperations,
    2);
  assert.equal(report.crosswalkOperationUsage.exactSpkiDerBytes > 0, true);

  const maximum = replay(sixteenWitnessBaseline);
  assert.equal(maximum.ok, true, maximum.error);
  assert.equal(maximum.witnessCount, 16);
  assert.equal(maximum.witnessQuorum, 15);
  assert.equal(maximum.crosswalkOperationBudgetEnforced, true);
  assert.equal(maximum.nestedWitnessPolicyReplayIncludedInCrosswalkBudget, true);
  assert.equal(maximum.crosswalkOperationUsage.publicKeyParseOperations, 33);
  assert.equal(maximum.crosswalkOperationUsage.witnessesMapped, 16);
  assert.equal(maximum.crosswalkOperationUsage
    .nestedWitnessPolicyReplayPublicKeyParseOperations, 16);
  assert.equal(maximum.boundary.maximumWitnessCount, 16);
});

test("policy fixes endpoint, transport, P-256 profile, count, and HOLD boundary", () => {
  const invalidMutations = [
    (input) => { input.requirements.profile = "SIGSTORE_REKOR_V1"; },
    (input) => { input.requirements.endpointPath = "/api/v1/log/entries"; },
    (input) => { input.requirements.method = "GET"; },
    (input) => { input.requirements.redirectPolicy = "FOLLOW"; },
    (input) => { input.requirements.maximumWitnessCount = 17; },
    (input) => { input.requirements.bothParentsFreshReplayRequired = false; },
    (input) => { input.callerMappingIsExternalProvenance = true; },
    (input) => { input.status = "READY"; },
    (input) => { input.decisionState = "PASS"; },
    (input) => { input.authority = "CALLER"; },
  ];
  for (const mutate of invalidMutations) {
    const input = cloneTrustBoundV4FixtureValue(baseline.bindingPolicyInput);
    mutate(input);
    assert.throws(() => policyFromInput(input),
      /EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_/u);
  }
});

test("P-384, Ed25519, and RSA log-key declarations are rejected", () => {
  const alternatives = [
    "PKIX_ECDSA_P384_SHA_384",
    "PKIX_ED25519",
    "PKIX_RSA_PKCS1V15_2048_SHA256",
  ];
  for (const keyDetails of alternatives) {
    const input = cloneTrustBoundV4FixtureValue(baseline.bindingPolicyInput);
    input.requirements.logKeyDetails = keyDetails;
    assert.throws(() => policyFromInput(input),
      /EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_/u);
  }

  const alternateKeys = [
    generateKeyPairSync("ec", { namedCurve: "secp384r1" }).publicKey,
    generateKeyPairSync("ed25519").publicKey,
    generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey,
  ];
  for (const key of alternateKeys) {
    const changed = cloneTrustBoundV4FixtureValue(baseline);
    const pem = key.export({ type: "spki", format: "pem" });
    changed.context.externalWitnessV2.trustPolicy.trustMaterial.logPublicKeyPem = pem;
    const report = replay(changed);
    assert.equal(report.ok, false);
    assert.equal(report.exactTufSelectedLogKeyCommitmentMapped, false);
    assert.equal(JSON.stringify(report).includes(pem), false);
  }
});

test("full log ID and truncated checkpoint ID pins cannot be changed independently", () => {
  for (const field of ["logIdBase64", "checkpointKeyIdBase64"]) {
    const changed = cloneTrustBoundV4FixtureValue(baseline);
    const length = field === "logIdBase64" ? 32 : 4;
    changed.record.trustMaterialRecordV3.policy.rekor[field]
      = Buffer.alloc(length, 0xa5).toString("base64");
    const report = replay(changed);
    assert.equal(report.ok, false);
    assert.equal(report.exactTufSelectedLogKeyCommitmentMapped, false);
    assert.equal(report.externalAnchorEstablished, false);
    assert.equal(report.stage1Complete, false);
  }
});

test("both parent replays and all parent pins are mandatory on every call", () => {
  const candidateChanged = cloneTrustBoundV4FixtureValue(baseline);
  candidateChanged.record.externalWitnessCandidateV2.candidateHash
    = trustBoundV4Hash("different-candidate");
  let report = replay(candidateChanged);
  assert.equal(report.ok, false);
  assert.equal(report.bothParentsFreshReplayVerified, false);

  const trustBytesChanged = cloneTrustBoundV4FixtureValue(baseline);
  trustBytesChanged.record.trustMaterialRecordV3.trustedRootBytes[0] ^= 1;
  report = replay(trustBytesChanged);
  assert.equal(report.ok, false);
  assert.equal(report.bothParentsFreshReplayVerified, false);

  const v2PinChanged = cloneTrustBoundV4FixtureValue(baseline);
  v2PinChanged.context.externalWitnessV2.expectedCandidateHash
    = trustBoundV4Hash("different-v2-pin");
  report = replay(v2PinChanged);
  assert.equal(report.ok, false);

  const v3PinChanged = cloneTrustBoundV4FixtureValue(baseline);
  v3PinChanged.context.trustMaterialV3.expectedPolicyHash
    = trustBoundV4Hash("different-v3-pin");
  report = replay(v3PinChanged);
  assert.equal(report.ok, false);

  const bindingPinChanged = cloneTrustBoundV4FixtureValue(baseline);
  bindingPinChanged.context.expectedBindingPolicyHash
    = trustBoundV4Hash("different-binding-pin");
  report = replay(bindingPinChanged);
  assert.equal(report.ok, false);
});

test("one deep v2-context snapshot prevents a delegated parent side effect from A/B splicing",
  () => {
    const changed = {
      record: cloneTrustBoundV4FixtureValue(baseline.record),
      context: cloneTrustBoundV4FixtureValue(baseline.context),
    };
    const replacement = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const replacementPem = replacement.publicKey.export({ type: "spki", format: "pem" });
    assert.notEqual(replacementPem, baseline.log.pem);
    const publicKeyPrototype = Object.getPrototypeOf(replacement.publicKey);
    const exportDescriptor = Object.getOwnPropertyDescriptor(publicKeyPrototype, "export");
    let delegatedSideEffects = 0;
    let report;
    try {
      Object.defineProperty(publicKeyPrototype, "export", {
        configurable: true,
        writable: true,
        value(...args) {
          delegatedSideEffects += 1;
          changed.context.externalWitnessV2.trustPolicy.trustMaterial.logPublicKeyPem
            = replacementPem;
          return Reflect.apply(exportDescriptor.value, this, args);
        },
      });
      report = replay(changed);
    } finally {
      Object.defineProperty(publicKeyPrototype, "export", exportDescriptor);
    }
    assert.equal(delegatedSideEffects > 0, true);
    assert.equal(changed.context.externalWitnessV2.trustPolicy.trustMaterial.logPublicKeyPem,
      replacementPem);
    assert.equal(report.ok, true, report.error);
    assert.equal(report.externalWitnessV2ContextSnapshotUsed, true);
    assert.equal(report.parentAndCrosswalkSameV2ContextSnapshotVerified, true);
    assert.equal(report.rekorBinding.exactSpkiDerHash,
      p256ExactSpkiDerHash(baseline.log));
    assert.equal(report.boundary.externalWitnessV2ContextSnapshottedBeforeParentReplay,
      true);
    assert.equal(report.boundary.sameFrozenV2ContextSnapshotUsedByParentAndCrosswalk,
      true);
    assert.equal(report.boundary.callerContextPostSnapshotMutationAffectsCrosswalk, false);
  });

test("provider and Sigstore operator identifiers must match their replayed parents", () => {
  for (const mutate of [
    (input) => {
      input.providerOperatorMapping.externalWitnessProviderId
        = "different-provider.trust-bound.fixture.test";
    },
    (input) => {
      input.providerOperatorMapping.sigstoreOperator
        = "different-operator.trust-bound.fixture.test";
    },
  ]) {
    const changed = withBindingPolicyInput(baseline, mutate);
    const report = replay(changed);
    assert.equal(report.ok, false);
    assert.equal(report.bothParentsFreshReplayVerified, false);
    assert.equal(report.exactEndpointAndTransportPolicyMapped, false);
  }

  const changedEvidence = withBindingPolicyInput(baseline, (input) => {
    input.providerOperatorMapping.evidenceHash
      = trustBoundV4Hash("another-caller-only-crosswalk-claim");
  });
  const report = replay(changedEvidence);
    assert.equal(report.ok, true, report.error);
    assert.equal(report.callerMappingIsExternalProvenance, false);
    assert.equal(report.providerIdentityEstablished, false);
    assert.equal(report.operatorIndependenceEstablished, false);
  assert.equal(report.decisionState, "HOLD");
});

test("witness name, operator, key, quorum, and order are exact crosswalk fields", () => {
  const replacement = generateKeyPairSync("ed25519").publicKey
    .export({ type: "spki", format: "der" }).toString("base64");
  const mutations = [
    (input) => { input.witnesses[0].name = "renamed-witness.fixture.test"; },
    (input) => { input.witnesses[0].operator = "renamed-operator.fixture.test"; },
    (input) => { input.witnesses[0].publicKey.rawBytes = replacement; },
    (input) => { input.quorum = 1; },
    (input) => { input.witnesses.reverse(); },
  ];
  for (const mutate of mutations) {
    const changed = rebuildTrustMaterialWithWitnessMutation(baseline, mutate);
    const report = replay(changed);
    assert.equal(changed.trustMaterialV3.report.ok, true,
      changed.trustMaterialV3.report.error);
    assert.equal(report.ok, false);
    assert.equal(report.exactLocalWitnessKeyPolicyMapped, false);
  }
});

test("a 17-witness request is rejected before any crosswalk replay", () => {
  const input = cloneTrustBoundV4FixtureValue(baseline.bindingPolicyInput);
  input.requirements.maximumWitnessCount = 17;
  assert.throws(() => policyFromInput(input),
    /EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_/u);

  const witnessInput = witnessInputFromPolicy(baseline.trustMaterialV3.witnessPolicy);
  for (let index = witnessInput.witnesses.length; index < 17; index += 1) {
    const key = generateKeyPairSync("ed25519").publicKey
      .export({ type: "spki", format: "der" }).toString("base64");
    witnessInput.witnesses.push({
      name: `witness-${index}.fixture.test`,
      operator: `witness-${index}-operator.fixture.test`,
      publicKey: { keyDetails: "PKIX_ED25519", rawBytes: key },
    });
  }
  witnessInput.quorum = 17;
  assert.throws(() => createEpisodeAttemptSetExternalWitnessKeyPolicyV3(witnessInput),
    /WITNESS_POLICY_WITNESSES_(?:LENGTH|ARRAY)_INVALID/u);
});

test("proxy and accessor inputs fail closed without invoking attacker code", () => {
  let trapCalls = 0;
  const proxied = new Proxy(baseline.record, {
    get() { trapCalls += 1; throw new Error("SECRET_PROXY_TRAP"); },
    getOwnPropertyDescriptor() {
      trapCalls += 1; throw new Error("SECRET_PROXY_DESCRIPTOR_TRAP");
    },
    ownKeys() { trapCalls += 1; throw new Error("SECRET_PROXY_KEYS_TRAP"); },
  });
  let report = replayEpisodeAttemptSetExternalWitnessTrustBoundV4(
    proxied, baseline.context);
  assert.equal(report.ok, false);
  assert.equal(trapCalls, 0);
  assert.doesNotMatch(report.error, /SECRET/u);

  const accessorRecord = { ...baseline.record };
  Object.defineProperty(accessorRecord, "bindingPolicy", {
    enumerable: true,
    get() { trapCalls += 1; throw new Error("SECRET_RECORD_GETTER"); },
  });
  report = replayEpisodeAttemptSetExternalWitnessTrustBoundV4(
    accessorRecord, baseline.context);
  assert.equal(report.ok, false);
  assert.equal(trapCalls, 0);
  assert.doesNotMatch(report.error, /SECRET/u);

  const accessorContext = { ...baseline.context };
  Object.defineProperty(accessorContext, "expectedBindingPolicyHash", {
    enumerable: true,
    get() { trapCalls += 1; throw new Error("SECRET_CONTEXT_GETTER"); },
  });
  report = replayEpisodeAttemptSetExternalWitnessTrustBoundV4(
    baseline.record, accessorContext);
  assert.equal(report.ok, false);
  assert.equal(trapCalls, 0);
  assert.doesNotMatch(report.error, /SECRET/u);

  const accessorPolicy = cloneTrustBoundV4FixtureValue(baseline.bindingPolicyInput);
  Object.defineProperty(accessorPolicy, "requirements", {
    enumerable: true,
    get() { trapCalls += 1; throw new Error("SECRET_POLICY_GETTER"); },
  });
  assert.throws(() => policyFromInput(accessorPolicy),
    /EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_/u);
  assert.equal(trapCalls, 0);
});

test("primitive snapshot leaves reject Proxy and 100k-wide objects without traps or freeze",
  () => {
    let trapCalls = 0;
    const leafProxy = new Proxy({}, {
      get() { trapCalls += 1; throw new Error("SECRET_LEAF_PROXY_GET"); },
      getOwnPropertyDescriptor() {
        trapCalls += 1; throw new Error("SECRET_LEAF_PROXY_DESCRIPTOR");
      },
      getPrototypeOf() {
        trapCalls += 1; throw new Error("SECRET_LEAF_PROXY_PROTOTYPE");
      },
      ownKeys() { trapCalls += 1; throw new Error("SECRET_LEAF_PROXY_KEYS"); },
      preventExtensions() {
        trapCalls += 1; throw new Error("SECRET_LEAF_PROXY_FREEZE");
      },
    });
    let getterCalls = 0;
    const wideLeaf = {};
    for (let index = 0; index < 100_000; index += 1) {
      Object.defineProperty(wideLeaf, `unknown_${index}`, {
        enumerable: true,
        configurable: true,
        get() { getterCalls += 1; throw new Error("SECRET_WIDE_LEAF_GETTER"); },
      });
    }
    const mutations = [
      (context, value) => {
        context.externalWitnessV2.trustPolicy.provider.providerId = value;
      },
      (context, value) => {
        context.externalWitnessV2.trustPolicy.requirements.inclusionProofRequired = value;
      },
      (context, value) => {
        context.externalWitnessV2.trustPolicy.requirements.independentWitnessQuorum = value;
      },
      (context, value) => {
        context.externalWitnessV2.expectedTrustPolicyHash = value;
      },
      (context, value) => {
        context.externalWitnessV2.trustPolicy.trustMaterial.logPublicKeyPem = value;
      },
    ];
    for (const value of [leafProxy, wideLeaf]) {
      for (const mutate of mutations) {
        const context = cloneTrustBoundV4FixtureValue(baseline.context);
        mutate(context, value);
        const report = replayEpisodeAttemptSetExternalWitnessTrustBoundV4(
          baseline.record, context);
        assert.equal(report.ok, false);
        assert.match(report.error,
          /^EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_[A-Z0-9_:]+$/u);
        assert.doesNotMatch(report.error, /SECRET/u);
        assert.equal(report.externalWitnessV2ContextSnapshotUsed, false);
        assert.equal(report.rawParentRecordsProjected, false);
        assert.equal(report.rawPemOrDerBytesProjected, false);
        assert.equal(report.localDirectoryPathsProjected, false);
      }
    }
    assert.equal(trapCalls, 0);
    assert.equal(getterCalls, 0);
    assert.equal(Object.isFrozen(wideLeaf), false);
  });

test("100k-wide negative input reads no unknown accessor", () => {
  let getterCalls = 0;
  const wide = { ...baseline.record, schema: "invalid-schema" };
  for (let index = 0; index < 100_000; index += 1) {
    Object.defineProperty(wide, `unknown_${index}`, {
      enumerable: true,
      configurable: true,
      get() { getterCalls += 1; throw new Error("SECRET_WIDE_GETTER"); },
    });
  }
  const report = replayEpisodeAttemptSetExternalWitnessTrustBoundV4(
    wide, baseline.context);
  assert.equal(report.ok, false);
  assert.equal(getterCalls, 0);
  assert.doesNotMatch(report.error, /SECRET/u);
  assert.equal(report.rawParentRecordsProjected, false);
  assert.equal(report.localDirectoryPathsProjected, false);
});

test("v4 policy RegExp validation ignores post-import RegExp.exec poison", () => {
  const regexpExec = Object.getOwnPropertyDescriptor(RegExp.prototype, "exec");
  let touches = 0;
  let policy;
  try {
    Object.defineProperty(RegExp.prototype, "exec", {
      configurable: true,
      writable: true,
      value() { touches += 1; throw new Error("SECRET_REGEXP_EXEC"); },
    });
    policy = policyFromInput(cloneTrustBoundV4FixtureValue(
      baseline.bindingPolicyInput));
  } finally {
    Object.defineProperty(RegExp.prototype, "exec", regexpExec);
  }
  assert.equal(policy.policyHash, baseline.bindingPolicy.policyHash);
  assert.equal(touches, 0);
});

test("Buffer hasInstance poison exposes only the fixed sanitized parent limit", () => {
  const bufferHasInstance = Object.getOwnPropertyDescriptor(Buffer, Symbol.hasInstance);
  let touches = 0;
  let report;
  try {
    Object.defineProperty(Buffer, Symbol.hasInstance, {
      configurable: true,
      value() { touches += 1; throw new Error("SECRET_BUFFER_HAS_INSTANCE"); },
    });
    report = replay();
  } finally {
    if (bufferHasInstance) {
      Object.defineProperty(Buffer, Symbol.hasInstance, bufferHasInstance);
    } else {
      delete Buffer[Symbol.hasInstance];
    }
  }
  assert.equal(report.ok, false);
  assert.match(report.error,
    /(?:EXTERNAL_WITNESS_V2_PARENT_REPLAY_FAILED|UNTRUSTED_FAILURE)$/u);
  assert.equal(touches > 0, true);
  assert.equal(report.rawParentRecordsProjected, false);
  assert.equal(report.rawPemOrDerBytesProjected, false);
  assert.equal(report.localDirectoryPathsProjected, false);
  assert.equal(report.parentV2PostImportBufferPrototypeIsolationEstablished, false);
  assert.equal(report.compositePostImportPrototypeIsolationEstablished, false);
  assert.equal(report.boundary.parentV2PostImportBufferPrototypeIsolationEstablished,
    false);
});

test("post-import KeyObject poison is sanitized under the explicit composite limit", () => {
  const probe = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey;
  const publicKeyPrototype = Object.getPrototypeOf(probe);
  const asymmetricKeyPrototype = Object.getPrototypeOf(publicKeyPrototype);
  const exportDescriptor = Object.getOwnPropertyDescriptor(publicKeyPrototype, "export");
  const typeDescriptor = Object.getOwnPropertyDescriptor(
    asymmetricKeyPrototype, "asymmetricKeyType");
  const detailsDescriptor = Object.getOwnPropertyDescriptor(
    asymmetricKeyPrototype, "asymmetricKeyDetails");
  let report;
  try {
    Object.defineProperty(publicKeyPrototype, "export", {
      configurable: true,
      writable: true,
      value() { throw new Error("SECRET_KEY_EXPORT"); },
    });
    Object.defineProperty(asymmetricKeyPrototype, "asymmetricKeyType", {
      configurable: true,
      get() { throw new Error("SECRET_KEY_TYPE"); },
    });
    Object.defineProperty(asymmetricKeyPrototype, "asymmetricKeyDetails", {
      configurable: true,
      get() { throw new Error("SECRET_KEY_DETAILS"); },
    });
    report = replay();
  } finally {
    Object.defineProperty(publicKeyPrototype, "export", exportDescriptor);
    Object.defineProperty(asymmetricKeyPrototype, "asymmetricKeyType", typeDescriptor);
    Object.defineProperty(asymmetricKeyPrototype, "asymmetricKeyDetails", detailsDescriptor);
  }
  assert.equal(report.ok, false);
  assert.doesNotMatch(report.error, /SECRET|BEGIN PUBLIC KEY|\/private\//u);
  assert.equal(report.rawPemOrDerBytesProjected, false);
  assert.equal(report.localDirectoryPathsProjected, false);
  assert.equal(report.parentV2PostImportKeyObjectPrototypeIsolationEstablished, false);
  assert.equal(report.compositePostImportPrototypeIsolationEstablished, false);
  assert.equal(report.boundary.parentV2PostImportKeyObjectPrototypeIsolationEstablished,
    false);
  assert.equal(report.boundary.compositePostImportPrototypeIsolationEstablished, false);
});

test("malformed PEM and DER material fail closed without projection", () => {
  const malformedPem = cloneTrustBoundV4FixtureValue(baseline);
  malformedPem.context.externalWitnessV2.trustPolicy.trustMaterial.logPublicKeyPem
    = "-----BEGIN PUBLIC KEY-----\nSECRET_INVALID\n-----END PUBLIC KEY-----\n";
  let report = replay(malformedPem);
  assert.equal(report.ok, false);
  assert.doesNotMatch(JSON.stringify(report), /SECRET_INVALID|BEGIN PUBLIC KEY/u);

  const malformedWitnessPem = cloneTrustBoundV4FixtureValue(baseline);
  malformedWitnessPem.context.externalWitnessV2.trustPolicy.trustMaterial
    .witnesses[0].publicKeyPem = "SECRET_WITNESS_PEM";
  report = replay(malformedWitnessPem);
  assert.equal(report.ok, false);
  assert.doesNotMatch(JSON.stringify(report), /SECRET_WITNESS_PEM/u);

  const malformedDer = cloneTrustBoundV4FixtureValue(baseline);
  malformedDer.record.trustMaterialRecordV3.trustedRootBytes
    = Buffer.from("{\"malformedDer\":\"SECRET_DER\"}");
  report = replay(malformedDer);
  assert.equal(report.ok, false);
  assert.doesNotMatch(JSON.stringify(report), /SECRET_DER/u);
  assert.equal(report.rawPemOrDerBytesProjected, false);
  assert.equal(report.rawTufMetadataOrTargetBytesProjected, false);
});

test("verification redacts parent records, raw bytes, keys, local paths, and wire data", () => {
  const report = replay();
  assert.equal(report.ok, true, report.error);
  const encoded = JSON.stringify(report);
  const forbidden = [
    baseline.log.pem,
    baseline.log.der.toString("base64"),
    baseline.witnesses[0].key.pem,
    baseline.witnesses[0].key.der.toString("base64"),
    baseline.externalWitnessV2.artifactBytes.toString("base64"),
    baseline.externalWitnessV2.transportProofBytes.toString("base64"),
    baseline.trustMaterialV3.record.bootstrapRootBytes.toString("base64"),
    baseline.externalWitnessV2.context.localHead.directory,
  ];
  for (const secret of forbidden) assert.equal(encoded.includes(secret), false);
  assert.equal(Object.hasOwn(report, "externalWitnessCandidateV2"), false);
  assert.equal(Object.hasOwn(report, "trustMaterialRecordV3"), false);
  assert.equal(Object.hasOwn(report.rekorBinding, "publicKeyPem"), false);
  assert.equal(Object.hasOwn(report.rekorBinding, "publicKeyDer"), false);
  assert.equal(report.rawParentRecordsProjected, false);
  assert.equal(report.rawAnchorOrTransportProofBytesProjected, false);
  assert.equal(report.rawTufMetadataOrTargetBytesProjected, false);
  assert.equal(report.rawPemOrDerBytesProjected, false);
  assert.equal(report.localDirectoryPathsProjected, false);
  assert.equal(report.localEntryCommitmentsProjected, false);
  assert.equal(report.wireBytesProjected, false);
  assert.equal(report.verificationPublicationNetworkSafe, false);
});

test("the v4 layer has no direct I/O primitive and reports the parent-read boundary", () => {
  const source = readFileSync(new URL(
    "../src/outsider-episode-attempt-set-external-witness-trust-bound-v4.js",
    import.meta.url), "utf8");
  assert.doesNotMatch(source,
    /from\s+["']node:(?:fs|fs\/promises|http|https|net|tls|dgram|child_process)["']/u);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u);
  assert.doesNotMatch(source, /\bBuffer\.isBuffer\b|instanceof\s+Buffer\b/u);
  const report = replay();
  assert.equal(report.ok, true, report.error);
  assert.equal(report.networkOrTransportPerformed, false);
  assert.equal(report.networkOrFilesystemWritePerformed, false);
  assert.equal(report.parentV2LocalHeadFilesystemReadRequired, true);
  assert.equal(report.compositeCallMayPerformParentFilesystemRead, true);
  assert.equal(report.v4AddsNoNetworkOrFilesystemIoBeyondFreshParents, true);
  assert.equal(report.boundary.parentV2LocalHeadFilesystemReadRequired, true);
  assert.equal(report.boundary.compositeCallMayPerformParentFilesystemRead, true);
  assert.equal(report.boundary.v4AddsNoNetworkOrFilesystemIoBeyondFreshParents, true);
  assert.equal(report.parentV2PostImportKeyObjectPrototypeIsolationEstablished, false);
  assert.equal(report.compositePostImportPrototypeIsolationEstablished, false);
});

test("monotonic Stage-1 facts and the native-safety veto are identical on all paths",
  () => {
    const success = replay();
    assert.equal(success.ok, true, success.error);
    const failure = replayEpisodeAttemptSetExternalWitnessTrustBoundV4({}, {});
    assert.equal(failure.ok, false);
    assertMonotonicAndNativeSafetyBoundary(
      EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY);
    assertMonotonicAndNativeSafetyBoundary(success);
    assertMonotonicAndNativeSafetyBoundary(failure);
  });

test("all external, authority, action, training, economics, and Stage gates stay fixed false",
  () => {
    const report = replay();
    assert.equal(report.ok, true, report.error);
    const falseFields = [
      "callerMappingIsExternalProvenance",
      "callerBootstrapAcceptedAsIndependentTrustAnchor",
      "callerPinsAcceptedAsExternalProvenance",
      "independentlySourcedTrustMaterialEstablished",
      "independentBootstrapEstablished",
      "officialSourceBytesEstablished",
      "actualPublishedSigstoreTargetBytesReplayed",
      "currentPublicSigningConfigSelectsRekorV2",
      "rekorV2TrustRootIdProfileInteroperabilityEstablished",
      "sourceProvenanceEstablished",
      "transportProvenanceEstablished",
      "publicProviderInteroperabilityObserved",
      "publicProviderLiveArtifactEstablished",
      "providerResponseEstablished",
      "operatorIndependenceEstablished",
      "witnessOperatorIndependenceEstablished",
      "witnessOperationalIndependenceEstablished",
      "physicalCryptographicKeyIndependenceEstablished",
      "organizationalIndependenceEstablished",
      "mathematicalPublicKeyCanonicalizationEstablished",
      "independentWitnessEstablished",
      "independentPinProvenanceEstablished",
      "externalHeadPinVerified",
      "crossCheckpointConsistencyVerified",
      "splitViewExcluded",
      "nonEquivocationEstablished",
      "nonOmissionProofEstablished",
      "longTermMonitoringEstablished",
      "wormStorageEstablished",
      "ownerRollbackOrDirectoryReplacementExcluded",
      "parallelGenesisExclusionEstablished",
      "forkExclusionEstablished",
      "durableAppendOnlyHistoryEstablished",
      "tufRollbackProtectionEstablished",
      "tufLatestRootEstablished",
      "tufPriorTrustedMetadataStateReplayed",
      "crossParentTemporalAtomicityEstablished",
      "storageDurabilityEstablished",
      "globalAttemptAndReportDenominatorComplete",
      "sourceReplayVerified",
      "directParticipantConfirmationEstablished",
      "rightsPrivacyAdjudicationEstablished",
      "networkOrderEstablished",
      "independentOutcomeTruthEstablished",
      "causalAttributionEstablished",
      "recoveryExternallyVerified",
      "obligationClosureEstablished",
      "outsiderCanOverrideNativeSafetyVeto",
      "durableExternalHeadEstablished",
      "externalAnchorEstablished",
      "stage1EngineeringGatePassed",
      "stage1ExternalFactGatePassed",
      "stage1Complete",
      "stage2Eligible",
      "stage2Permitted",
      "actionReady",
      "actionAuthorized",
      "authorityEstablished",
      "executable",
      "automaticTraining",
      "productionTrainingAuthorized",
      "actorCredit",
      "moneyMovementEnabled",
      "custodyEstablished",
      "fundsVerified",
      "platformAdvanceEnabled",
      "capitalAvailabilityEstablished",
      "pricingAuthorized",
      "permitsPricing",
      "guaranteeEstablished",
      "permitsGuarantee",
      "insuranceEstablished",
      "permitsInsurance",
      "settlementAuthorized",
      "permitsSettlement",
      "externalContractAcceptanceEstablished",
      "externalAdoptionEstablished",
      "verificationPublicationNetworkSafe",
      "verificationPublicationAuthorized",
    ];
    for (const field of falseFields) assert.equal(report[field], false, field);
    assert.equal(report.authority, "NONE");
    assert.equal(report.authorityGrants, 0);
    assert.equal(report.enabledCapabilityCount, 0);
    assert.equal(report.provenAuthorityCount, 0);
    assert.equal(report.enabledCapabilitiesSubsetOfProvenAuthority, true);
    assert.equal(report.rekorV2TrustRootIdSpecificationConflictAcknowledged, true);
    assert.equal(report.nativeSafetyUnconditionalVetoPreserved, true);
    assert.equal(report.consequenceReach, "NONE");
    assert.equal(report.actionAdmissions, 0);
    assert.equal(report.trainingRows, 0);
    assert.equal(report.causalExperienceUnits, 0);
    assert.equal(report.status, "PARTIAL");
    assert.equal(report.decisionState, "HOLD");
    assert.equal(report.disposition, "QUARANTINED");
  });

test("boundary and proof matrix preserve the exact non-proofs", () => {
  assert.equal(Object.isFrozen(
    EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY), true);
  assert.equal(Object.isFrozen(
    EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_PROOF_MATRIX), true);
  assert.equal(
    EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY.stage2Permitted,
    false);
  const matrix = EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_PROOF_MATRIX;
  assert.equal(matrix.freshParentReplay.externalWitnessV2, "REQUIRED_IN_SAME_CALL");
  assert.equal(matrix.freshParentReplay.trustMaterialV3, "REQUIRED_IN_SAME_CALL");
  assert.equal(matrix.freshParentReplay.staleParentVerificationObjectsAccepted, false);
  assert.equal(matrix.privateCrosswalk.logKey,
    "P256_SPKI_DER_SHA256_AND_TRUNCATED_CHECKPOINT_ID");
  assert.equal(matrix.privateCrosswalk.witnesses,
    "EXACT_ORDERED_NAME_OPERATOR_ED25519_SPKI_AND_QUORUM_MAX_16");
  for (const value of Object.values(matrix.externalFactClaims)) {
    assert.equal(value, false);
  }
});
