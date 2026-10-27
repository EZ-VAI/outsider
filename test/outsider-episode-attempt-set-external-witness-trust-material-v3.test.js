import assert from "node:assert/strict";
import {
  constants as cryptoConstants,
  createHash,
  generateKeyPairSync,
  Hash,
  sign,
} from "node:crypto";
import test from "node:test";

import {
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY,
  EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_PROOF_MATRIX,
  createEpisodeAttemptSetExternalWitnessKeyPolicyV3,
  createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3,
  replayEpisodeAttemptSetExternalWitnessTrustMaterialV3,
} from "../src/outsider-episode-attempt-set-external-witness-trust-material-v3.js";

const SPEC = "1.0";
const NOW = "2026-09-01T12:00:00Z";
const EXPIRES = "2027-09-01T12:00:00Z";
const ORIGIN = "https://log-v2.fixture.test";
const OPERATOR = "log-operator.fixture.test";
const TRUSTED_ROOT_PATH = "trusted_root.v0.2.json";
const SIGNING_CONFIG_PATH = "signing_config.v0.2.json";

function sha(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function pair() {
  const generated = generateKeyPairSync("ed25519");
  const der = generated.publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    der,
    raw: der.subarray(der.length - 32),
  };
}

function tufEcdsaPair() {
  const generated = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    der: generated.publicKey.export({ type: "spki", format: "der" }),
    pem: generated.publicKey.export({ type: "spki", format: "pem" }),
    tufAlgorithm: "ecdsa",
  };
}

function tufRsaPair() {
  const generated = generateKeyPairSync("rsa", { modulusLength: 2048,
    publicExponent: 65537 });
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    der: generated.publicKey.export({ type: "spki", format: "der" }),
    pem: generated.publicKey.export({ type: "spki", format: "pem" }),
    tufAlgorithm: "rsa",
  };
}

function logPair(keyDetails) {
  if (keyDetails === "PKIX_ED25519") return pair();
  const generated = keyDetails === "PKIX_ECDSA_P256_SHA_256"
    ? generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    : generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    der: generated.publicKey.export({ type: "spki", format: "der" }),
  };
}

function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  let hex = length.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  const encoded = Buffer.from(hex, "hex");
  return Buffer.concat([Buffer.from([0x80 | encoded.length]), encoded]);
}

function derElement(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function syntheticRsaSpkiPem(modulusBytes, exponentBytes = Buffer.from("010001", "hex")) {
  const modulus = modulusBytes[0] >= 0x80
    ? Buffer.concat([Buffer.from([0]), modulusBytes]) : modulusBytes;
  const publicKey = derElement(0x30, Buffer.concat([
    derElement(0x02, modulus),
    derElement(0x02, exponentBytes),
  ]));
  const algorithm = Buffer.from("300d06092a864886f70d0101010500", "hex");
  const spki = derElement(0x30, Buffer.concat([
    algorithm,
    derElement(0x03, Buffer.concat([Buffer.from([0]), publicKey])),
  ]));
  const base64 = spki.toString("base64");
  const lines = [];
  for (let offset = 0; offset < base64.length; offset += 64) {
    lines.push(base64.slice(offset, offset + 64));
  }
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

/* TUF's JSON POUF uses the OLPC canonical dialect implemented by
   securesystemslib: sorted keys, integers, no whitespace, and only quote and
   backslash escaping.  In particular, signed extension strings may contain
   literal newlines in the canonical signature input. */
function tufCanonicalize(value) {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") {
    return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(tufCanonicalize).join(",")}]`;
  const entries = Object.keys(value).sort((left, right) => {
    const leftPoints = [...left];
    const rightPoints = [...right];
    const length = Math.min(leftPoints.length, rightPoints.length);
    for (let index = 0; index < length; index += 1) {
      const leftPoint = leftPoints[index].codePointAt(0);
      const rightPoint = rightPoints[index].codePointAt(0);
      if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
    }
    return leftPoints.length - rightPoints.length;
  }).map(
    (key) => `${tufCanonicalize(key)}:${tufCanonicalize(value[key])}`);
  return `{${entries.join(",")}}`;
}

function tufKey(key) {
  if (key.tufAlgorithm === "ecdsa") {
    return {
      keytype: "ecdsa",
      scheme: "ecdsa-sha2-nistp256",
      keyval: { public: key.pem },
      keyid_hash_algorithms: ["sha256"],
      "x-tuf-on-ci-keyowner": "fixture owner\nsecurity@example.test",
    };
  }
  if (key.tufAlgorithm === "rsa") {
    return {
      keytype: "rsa",
      scheme: "rsassa-pss-sha256",
      keyval: { public: key.pem },
      keyid_hash_algorithms: ["sha256"],
      "x-tuf-on-ci-keyowner": "fixture owner\nsecurity@example.test",
    };
  }
  return {
    keytype: "ed25519",
    scheme: "ed25519",
    keyval: { public: key.raw.toString("hex") },
    keyid_hash_algorithms: ["sha256"],
    "x-tuf-on-ci-keyowner": "fixture owner\nsecurity@example.test",
  };
}

function tufKeyId(key) {
  return tufKeyObjectId(tufKey(key));
}

function tufKeyObjectId(key) {
  return createHash("sha256").update(tufCanonicalize(key)).digest("hex");
}

function signature(signed, key, keyid = tufKeyId(key)) {
  const signingKey = key.tufAlgorithm === "rsa" ? {
    key: key.privateKey,
    padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
    saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
  } : key.privateKey;
  return {
    keyid,
    sig: sign(key.tufAlgorithm === "ecdsa" || key.tufAlgorithm === "rsa"
      ? "sha256" : null, Buffer.from(tufCanonicalize(signed)), signingKey).toString("hex"),
  };
}

function envelope(signed, keys) {
  return { signatures: keys.map((key) => signature(signed, key)), signed };
}

function bytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function role(keyids, threshold = 1) {
  return { keyids, threshold };
}

function rootSigned(version, allKeys, rootKeys, online, rootThreshold) {
  const keys = {};
  for (const key of allKeys) keys[tufKeyId(key)] = tufKey(key);
  return {
    _type: "root",
    spec_version: SPEC,
    version,
    expires: EXPIRES,
    consistent_snapshot: true,
    keys,
    roles: {
      root: { ...role(rootKeys.map(tufKeyId), rootThreshold),
        "x-tuf-on-ci-role-note": "threshold extension\nretained in signature bytes" },
      snapshot: role([tufKeyId(online.snapshot)]),
      targets: role([tufKeyId(online.targets)]),
      timestamp: role([tufKeyId(online.timestamp)]),
    },
    "x-tuf-on-ci-root-note": "official-style signed extension\nnot semantic output",
  };
}

function description(raw, version) {
  return {
    version,
    length: raw.length,
    hashes: { sha256: sha(raw).slice("sha256:".length) },
  };
}

function targetDescription(raw) {
  return {
    length: raw.length,
    hashes: { sha256: sha(raw).slice("sha256:".length) },
  };
}

function logId(log) {
  return createHash("sha256").update(log.der).digest("base64");
}

function checkpointId(log, keyDetails) {
  let digest;
  if (keyDetails === "PKIX_ED25519") {
    digest = createHash("sha256")
      .update(ORIGIN.slice("https://".length)).update("\n")
      .update(Buffer.from([0x01])).update(log.raw).digest();
  } else if (keyDetails === "PKIX_ECDSA_P256_SHA_256") {
    digest = createHash("sha256").update(log.der).digest();
  } else {
    digest = createHash("sha256")
      .update(ORIGIN.slice("https://".length)).update("\n")
      .update(Buffer.from([0xff])).update("PKIX-RSA-PKCS#1v1.5")
      .update(log.der).digest();
  }
  return digest.subarray(0, 4).toString("base64");
}

function clone(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function fixture({ logKeyDetails = "PKIX_ED25519" } = {}) {
  const a = pair();
  const b = tufEcdsaPair();
  const c = tufEcdsaPair();
  const online1 = { snapshot: pair(), targets: pair(), timestamp: pair() };
  const online2 = { snapshot: pair(), targets: pair(), timestamp: pair() };
  const root1Signed = rootSigned(1, [a, b, ...Object.values(online1)], [a, b], online1, 2);
  const root1Bytes = bytes(envelope(root1Signed, [a, b]));
  const root2Signed = rootSigned(2, [b, c, ...Object.values(online2)], [b, c], online2, 2);
  const root2Bytes = bytes(envelope(root2Signed, [a, b, c]));

  const log = logPair(logKeyDetails);
  const rekorLogId = logId(log);
  const rekorCheckpointId = checkpointId(log, logKeyDetails);
  const trustedRootBytes = bytes({
    mediaType: "application/vnd.dev.sigstore.trustedroot.v0.2+json",
    tlogs: [{
      baseUrl: ORIGIN,
      hashAlgorithm: "SHA2_256",
      publicKey: {
        rawBytes: log.der.toString("base64"),
        keyDetails: logKeyDetails,
        validFor: { start: "2025-01-01T00:00:00Z" },
      },
      logId: { keyId: rekorLogId },
      checkpointKeyId: { keyId: rekorCheckpointId },
      operator: OPERATOR,
    }],
    certificateAuthorities: [],
    ctlogs: [],
    timestampAuthorities: [],
  });
  const signingConfigBytes = bytes({
    mediaType: "application/vnd.dev.sigstore.signingconfig.v0.2+json",
    caUrls: [],
    oidcUrls: [],
    rekorTlogUrls: [{
      url: ORIGIN,
      majorApiVersion: 2,
      validFor: { start: "2025-01-01T00:00:00Z" },
      operator: OPERATOR,
    }, {
      url: "https://legacy-log.fixture.test",
      majorApiVersion: 1,
      validFor: { start: "2021-01-01T00:00:00Z" },
      operator: OPERATOR,
    }],
    rekorTlogConfig: { selector: "ANY" },
    tsaUrls: [],
    tsaConfig: { selector: "ANY" },
  });

  const targetsSigned = {
    _type: "targets",
    spec_version: SPEC,
    version: 7,
    expires: EXPIRES,
    targets: {
      [TRUSTED_ROOT_PATH]: targetDescription(trustedRootBytes),
      [SIGNING_CONFIG_PATH]: targetDescription(signingConfigBytes),
    },
    "x-targets-extension": "targets extension\ncovered by OLPC signature bytes",
  };
  const targetsBytes = bytes(envelope(targetsSigned, [online2.targets]));
  const snapshotSigned = {
    _type: "snapshot",
    spec_version: SPEC,
    version: 8,
    expires: EXPIRES,
    meta: {
      "root.json": description(root2Bytes, 2),
      "targets.json": description(targetsBytes, 7),
    },
    "x-snapshot-extension": { note: "snapshot extension\nsigned exactly" },
  };
  const snapshotBytes = bytes(envelope(snapshotSigned, [online2.snapshot]));
  const timestampSigned = {
    _type: "timestamp",
    spec_version: SPEC,
    version: 9,
    expires: EXPIRES,
    meta: { "snapshot.json": description(snapshotBytes, 8) },
    "x-timestamp-extension": "timestamp extension\nsigned exactly",
  };
  const timestampBytes = bytes(envelope(timestampSigned, [online2.timestamp]));

  const witnessA = pair();
  const witnessB = pair();
  const witnessInput = {
    providerOrigin: ORIGIN,
    providerOperator: OPERATOR,
    quorum: 2,
    witnesses: [{
      name: "witness-a.fixture.test",
      operator: "witness-a-operator.fixture.test",
      publicKey: { keyDetails: "PKIX_ED25519", rawBytes: witnessA.der.toString("base64") },
    }, {
      name: "witness-b.fixture.test",
      operator: "witness-b-operator.fixture.test",
      publicKey: { keyDetails: "PKIX_ED25519", rawBytes: witnessB.der.toString("base64") },
    }],
  };
  const witnessPolicy = createEpisodeAttemptSetExternalWitnessKeyPolicyV3(witnessInput);
  const policyInput = {
    repositoryId: "sigstore-root.fixture.test",
    tufSpecVersion: SPEC,
    updateStartTime: NOW,
    bootstrapRootHash: sha(root1Bytes),
    bootstrapRootVersion: 1,
    expectedFinalRootVersion: 2,
    expectedTimestampVersion: 9,
    expectedSnapshotVersion: 8,
    expectedTargetsVersion: 7,
    trustedRootTargetPath: TRUSTED_ROOT_PATH,
    signingConfigTargetPath: SIGNING_CONFIG_PATH,
    rekor: {
      endpointOrigin: ORIGIN,
      operator: OPERATOR,
      logIdBase64: rekorLogId,
      checkpointKeyIdBase64: rekorCheckpointId,
    },
    witnessPolicy,
    expectedWitnessPolicyHash: witnessPolicy.policyHash,
  };
  const policy = createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3(policyInput);
  return {
    keys: { a, b, c, online1, online2, log },
    values: { root1Signed, root2Signed, targetsSigned, snapshotSigned, timestampSigned },
    inputs: { witnessInput, policyInput },
    record: {
      policy,
      bootstrapRootBytes: root1Bytes,
      rootRotationBytes: [root2Bytes],
      timestampBytes,
      snapshotBytes,
      targetsBytes,
      trustedRootBytes,
      signingConfigBytes,
    },
    context: { expectedPolicyHash: policy.policyHash },
  };
}

function replay(built) {
  return replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(
    built.record, built.context);
}

function resealTargetsAndMetadata(built) {
  built.values.targetsSigned.targets[TRUSTED_ROOT_PATH]
    = targetDescription(built.record.trustedRootBytes);
  built.values.targetsSigned.targets[SIGNING_CONFIG_PATH]
    = targetDescription(built.record.signingConfigBytes);
  built.record.targetsBytes = bytes(envelope(
    built.values.targetsSigned, [built.keys.online2.targets]));
  built.values.snapshotSigned.meta["targets.json"]
    = description(built.record.targetsBytes, 7);
  built.record.snapshotBytes = bytes(envelope(
    built.values.snapshotSigned, [built.keys.online2.snapshot]));
  built.values.timestampSigned.meta["snapshot.json"]
    = description(built.record.snapshotBytes, 8);
  built.record.timestampBytes = bytes(envelope(
    built.values.timestampSigned, [built.keys.online2.timestamp]));
}

function withGetterNoise(base, count, onRead) {
  const result = { ...base };
  for (let index = 0; index < count; index += 1) {
    Object.defineProperty(result, `unknown_${index}`, {
      enumerable: true,
      configurable: true,
      get() { onRead(); throw new Error("unknown getter must stay inert"); },
    });
  }
  return result;
}

test("offline TUF role-chain and Sigstore target replay stays PARTIAL/HOLD", () => {
  const built = fixture();
  const report = replay(built);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.tufBootstrapSelfThresholdVerified, true);
  assert.equal(report.tufRootRotationOldAndNewThresholdsVerified, true);
  assert.equal(report.tufRootChainAuthenticatedByDualThresholds, true);
  assert.equal(report.tufRootRotationsVerified, 1);
  assert.equal(report.tufTimestampThresholdVerified, true);
  assert.equal(report.tufSnapshotThresholdVerified, true);
  assert.equal(report.tufTargetsThresholdVerified, true);
  assert.equal(report.tufSnapshotBytesBoundByTimestampDescription, true);
  assert.equal(report.tufSnapshotLengthBoundByTimestampDescription, true);
  assert.equal(report.tufSnapshotSha256BoundByTimestampDescription, true);
  assert.equal(report.tufFinalRootBytesBoundBySnapshotDescription, false);
  assert.equal(report.tufTargetsBytesBoundBySnapshotDescription, true);
  assert.equal(report.tufTargetsLengthBoundBySnapshotDescription, true);
  assert.equal(report.tufTargetsSha256BoundBySnapshotDescription, true);
  assert.equal(report.tufUnknownSignedExtensionsIncludedInSignatureBytes, true);
  assert.equal(report.tufUnknownSignedExtensionsProjected, false);
  assert.equal(report.tufKeyIdDerivationVerified, true);
  assert.equal(report.tufThresholdCountsDistinctAuthorizedKeyIds, true);
  assert.equal(report.tufTargetLengthAndSha256Verified, true);
  assert.equal(report.replayOperationBudgetEnforced, true);
  assert.ok(report.replayOperationUsage.cryptoVerifyOperations > 0);
  assert.ok(report.replayOperationUsage.cryptoVerifyOperations
    < report.boundary.cryptoVerifyOperationBudget);
  assert.ok(report.replayOperationUsage.publicKeyParseOperations > 0);
  assert.ok(report.replayOperationUsage.tufCanonicalWork > 0);
  assert.equal(report.replayOperationUsage.x509ParseOperations, 0);
  assert.equal(report.sigstoreTufTrustedRootReplayVerified, true);
  assert.equal(report.sigstoreSigningConfigReplayVerified, true);
  assert.equal(report.exactRekorProviderEndpointVerified, true);
  assert.equal(report.exactRekorLogIdVerified, true);
  assert.equal(report.exactRekorCheckpointKeyVerified, true);
  assert.equal(Buffer.from(report.rekor.logIdBase64, "base64").length, 32);
  assert.equal(Buffer.from(report.rekor.checkpointKeyIdBase64, "base64").length, 4);
  assert.equal(report.rekor.endpointPath, "/api/v2/log/entries");
  assert.equal(report.rekor.endpointUrl, `${ORIGIN}/api/v2/log/entries`);
  assert.equal(report.rekor.method, "POST");
  assert.equal(report.witnessMOfNKeyPolicyReplayed, true);
  assert.equal(report.witnessQuorum, 2);
  assert.equal(report.witnessKeyCount, 2);
  assert.equal(report.status, "PARTIAL");
  assert.equal(report.decisionState, "HOLD");
  assert.equal(report.stage1Complete, false);
  assert.equal(report.stage2Permitted, false);
  assert.match(report.verificationHash, /^sha256:[a-f0-9]{64}$/);
});

test("caller bootstrap, pins, and replay time never become external provenance", () => {
  const report = replay(fixture());
  assert.equal(report.ok, true);
  for (const field of [
    "callerBootstrapAcceptedAsIndependentTrustAnchor",
    "callerPinsAcceptedAsExternalProvenance",
    "callerReplayTimeAcceptedAsExternalTime",
    "officialSourceBytesEstablished",
    "actualPublishedSigstoreTargetBytesReplayed",
    "currentPublicSigningConfigSelectsRekorV2",
    "rekorV2TrustRootIdProfileInteroperabilityEstablished",
    "independentlySourcedBootstrapEstablished",
    "sourceProvenanceEstablished",
    "transportProvenanceEstablished",
    "sigstoreTufWitnessPolicyAvailable",
    "witnessPolicyIsSigstoreSchema",
    "witnessSignaturesVerified",
    "witnessOperationalIndependenceEstablished",
    "physicalCryptographicKeyIndependenceEstablished",
    "genericTufKeyAlgorithmInteroperabilityEstablished",
    "tufRollbackProtectionEstablished",
    "tufLatestRootEstablished",
    "tufPriorTrustedMetadataStateReplayed",
    "publicProviderLiveArtifactEstablished",
    "independentWitnessEstablished",
    "nonEquivocationEstablished",
    "durableExternalHeadEstablished",
    "externalAnchorEstablished",
  ]) assert.equal(report[field], false, field);
  assert.equal(report.rawTrustMaterialProjected, false);
  assert.equal(report.verificationContainsStableMaterialHashes, true);
  assert.equal(report.verificationPublicationNetworkSafe, false);
  assert.equal(report.stableLinkagePrivateOnly, true);
  assert.equal(report.verificationPublicationAuthorized, false);
  assert.equal(report.networkOrFilesystemIoPerformed, false);
  assert.equal(JSON.stringify(report).includes("rawBytes"), false);
});

test("success report and exported boundary remain frozen and zero-authority", () => {
  const report = replay(fixture());
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.rekor), true);
  assert.equal(Object.isFrozen(EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY),
    true);
  assert.equal(report.authority, "NONE");
  assert.equal(report.authorityGrants, 0);
  assert.equal(report.enabledCapabilityCount, 0);
  assert.equal(report.provenAuthorityCount, 0);
  assert.equal(report.consequenceReach, "NONE");
  assert.equal(report.actionAuthorized, false);
  assert.equal(report.moneyMovementEnabled, false);
  assert.equal(report.trainingRows, 0);
});

test("root rotation requires both predecessor and successor thresholds", () => {
  for (const mode of ["old", "new"]) {
    const built = fixture();
    const parsed = JSON.parse(built.record.rootRotationBytes[0]);
    parsed.signatures = mode === "old"
      ? parsed.signatures.filter((item) => item.keyid !== tufKeyId(built.keys.a))
      : parsed.signatures.filter((item) => item.keyid !== tufKeyId(built.keys.c));
    built.record.rootRotationBytes[0] = bytes(parsed);
    const report = replay(built);
    assert.equal(report.ok, false, mode);
    assert.match(report.error, /ROOT_ROTATION_(?:OLD|NEW)_ROOT_SIGNATURE_THRESHOLD_NOT_MET/);
    assert.equal(report.decisionState, "HOLD");
  }
});

test("duplicate root signatures count each keyid at most once", () => {
  const built = fixture();
  const parsed = JSON.parse(built.record.rootRotationBytes[0]);
  const onlyB = parsed.signatures.find((item) => item.keyid === tufKeyId(built.keys.b));
  parsed.signatures = [onlyB, clone(onlyB), clone(onlyB)];
  built.record.rootRotationBytes[0] = bytes(parsed);
  const report = replay(built);
  assert.equal(report.ok, false);
  assert.match(report.error, /ROTATED_ROOT_SIGNATURE_KEYID_DUPLICATE/);
});

test("an arbitrary TUF keyid alias cannot inflate an authorized-keyid threshold", () => {
  const built = fixture();
  const signed = clone(built.values.root2Signed);
  const bId = tufKeyId(built.keys.b);
  const alias = bId === "f".repeat(64) ? "e".repeat(64) : "f".repeat(64);
  signed.keys[alias] = clone(signed.keys[bId]);
  signed.roles.root = { keyids: [bId, alias], threshold: 2 };
  built.record.rootRotationBytes[0] = bytes({
    signatures: [
      signature(signed, built.keys.a),
      signature(signed, built.keys.b),
      signature(signed, built.keys.b, alias),
    ],
    signed,
  });
  const report = replay(built);
  assert.equal(report.ok, false);
  assert.match(report.error, /ROTATED_ROOT_KEYID_DERIVATION_INVALID/);
  assert.equal(report.tufRootRotationOldAndNewThresholdsVerified, false);
});

test("TUF counts valid extension-derived keyids without claiming physical independence", () => {
  const built = fixture();
  const signed = clone(built.values.root2Signed);
  const bId = tufKeyId(built.keys.b);
  const duplicate = clone(signed.keys[bId]);
  duplicate["x-tuf-on-ci-keyowner"] = "different signed extension\nsame physical key";
  const aliasId = tufKeyObjectId(duplicate);
  assert.notEqual(aliasId, bId);
  signed.keys[aliasId] = duplicate;
  signed.roles.root = { keyids: [bId, aliasId], threshold: 2 };
  built.record.rootRotationBytes[0] = bytes({
    signatures: [
      signature(signed, built.keys.a),
      signature(signed, built.keys.b),
      signature(signed, built.keys.b, aliasId),
    ],
    signed,
  });
  const report = replay(built);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.tufThresholdCountsDistinctAuthorizedKeyIds, true);
  assert.equal(report.physicalCryptographicKeyIndependenceEstablished, false);
});

test("TUF declared algorithms must match actual key type, curve, and RSA profile", () => {
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
  const rsaPss = generateKeyPairSync("rsa-pss", { modulusLength: 2048,
    hashAlgorithm: "sha256", mgf1HashAlgorithm: "sha256", saltLength: 32 }).publicKey;
  const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).publicKey;
  const p256 = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey;
  const confused = [
    {
      keytype: "ecdsa",
      scheme: "ecdsa-sha2-nistp256",
      keyval: { public: rsa.export({ type: "spki", format: "pem" }) },
    },
    {
      keytype: "ecdsa",
      scheme: "ecdsa-sha2-nistp256",
      keyval: { public: p384.export({ type: "spki", format: "pem" }) },
    },
    {
      keytype: "rsa",
      scheme: "rsassa-pss-sha256",
      keyval: { public: p256.export({ type: "spki", format: "pem" }) },
    },
    {
      keytype: "rsa",
      scheme: "rsassa-pss-sha256",
      keyval: { public: rsaPss.export({ type: "spki", format: "pem" }) },
    },
    {
      keytype: "rsa",
      scheme: "rsassa-pss-sha256",
      keyval: { public: syntheticRsaSpkiPem(Buffer.alloc(128, 0xff)) },
    },
    {
      keytype: "rsa",
      scheme: "rsassa-pss-sha256",
      keyval: { public: syntheticRsaSpkiPem(Buffer.alloc(513, 0xff)) },
    },
    {
      keytype: "rsa",
      scheme: "rsassa-pss-sha256",
      keyval: { public: syntheticRsaSpkiPem(
        Buffer.alloc(256, 0xff), Buffer.from("0100000001", "hex")) },
    },
  ];
  for (const key of confused) {
    const built = fixture();
    const signed = clone(built.values.root2Signed);
    signed.keys[tufKeyObjectId(key)] = key;
    built.record.rootRotationBytes[0] = bytes(envelope(signed,
      [built.keys.a, built.keys.b, built.keys.c]));
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error,
      /ROTATED_ROOT_KEY_(?:(?:KEY_)?PROFILE|(?:KEY_)?EXPONENT_RANGE)_INVALID/);
  }
});

test("TUF RSA-PSS SHA-256 verifies positively inside the bounded RSA profile", () => {
  const built = fixture();
  const rsa = tufRsaPair();
  const signed = clone(built.values.root2Signed);
  const rsaId = tufKeyId(rsa);
  signed.keys[rsaId] = tufKey(rsa);
  signed.roles.root = { keyids: [tufKeyId(built.keys.b), rsaId], threshold: 2 };
  built.record.rootRotationBytes[0] = bytes({
    signatures: [signature(signed, built.keys.a), signature(signed, built.keys.b),
      signature(signed, rsa)],
    signed,
  });
  const report = replay(built);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.tufRootRotationOldAndNewThresholdsVerified, true);
  assert.match(report.boundary.tufSupportedKeyProfile, /RSA_PSS_SHA256/u);
});

test("skipped, rolled-back, and count-mismatched root rotations fail closed", () => {
  {
    const built = fixture();
    const signed = clone(built.values.root2Signed);
    signed.version = 3;
    built.record.rootRotationBytes[0] = bytes(envelope(signed,
      [built.keys.a, built.keys.b, built.keys.c]));
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /ROOT_ROTATION_VERSION_NOT_SEQUENTIAL/);
  }
  {
    const built = fixture();
    built.record.rootRotationBytes = [];
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /ROOT_ROTATION_COUNT_MISMATCH/);
  }
});

test("timestamp, snapshot, targets, and target-byte tampering fail closed", () => {
  for (const field of ["timestampBytes", "snapshotBytes", "targetsBytes",
    "trustedRootBytes", "signingConfigBytes"]) {
    const built = fixture();
    const tampered = Buffer.from(built.record[field]);
    tampered[tampered.length - 2] ^= 1;
    built.record[field] = tampered;
    const report = replay(built);
    assert.equal(report.ok, false, field);
    assert.equal(report.sigstoreTufTrustedRootReplayVerified, false, field);
    assert.equal(report.stage2Permitted, false, field);
  }
});

test("expired final metadata at the pinned caller replay time fails closed", () => {
  const built = fixture();
  const signed = clone(built.values.timestampSigned);
  signed.expires = "2026-01-01T00:00:00Z";
  built.record.timestampBytes = bytes(envelope(signed, [built.keys.online2.timestamp]));
  const report = replay(built);
  assert.equal(report.ok, false);
  assert.match(report.error, /TIMESTAMP_VERSION_OR_EXPIRY_INVALID/);
  assert.equal(report.callerReplayTimeAcceptedAsExternalTime, false);
});

test("TrustedRoot media type, checkpoint key, and SigningConfig provider are exact", () => {
  {
    const built = fixture();
    const root = JSON.parse(built.record.trustedRootBytes);
    root.mediaType = "application/vnd.dev.sigstore.trustedroot+json;version=0.1";
    built.record.trustedRootBytes = bytes(root);
    resealTargetsAndMetadata(built);
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /TRUSTED_ROOT_MEDIA_TYPE_INVALID/);
  }
  {
    const built = fixture();
    const policy = clone(built.record.policy);
    policy.rekor.checkpointKeyIdBase64 = Buffer.alloc(32, 7).toString("base64");
    built.record.policy = policy;
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /POLICY_REKOR_CHECKPOINT_KEY_ID_INVALID/);
  }
  {
    const built = fixture();
    const config = JSON.parse(built.record.signingConfigBytes);
    config.rekorTlogUrls[0].url = "https://other-log.fixture.test";
    built.record.signingConfigBytes = bytes(config);
    resealTargetsAndMetadata(built);
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /SIGNING_CONFIG_PINNED_REKOR_NOT_ELIGIBLE/);
  }
});

test("non-empty CA and TSA entries have bounded X.509 parsing and no semantic trust claim", () => {
  const invalidAuthority = () => ({
    subject: { organization: "fixture organization", commonName: "fixture authority" },
    uri: "https://authority.fixture.test/root",
    certChain: { certificates: [{ rawBytes: Buffer.from("not-x509").toString("base64") }] },
    validFor: { start: "2025-01-01T00:00:00Z" },
    operator: "authority-operator.fixture.test",
  });
  for (const [field, error] of [
    ["certificateAuthorities", /TRUSTED_ROOT_CAS_CERTIFICATE_DER_INVALID/u],
    ["timestampAuthorities", /TRUSTED_ROOT_TSAS_CERTIFICATE_DER_INVALID/u],
  ]) {
    const built = fixture();
    const root = JSON.parse(built.record.trustedRootBytes);
    root[field] = [invalidAuthority()];
    built.record.trustedRootBytes = bytes(root);
    resealTargetsAndMetadata(built);
    const report = replay(built);
    assert.equal(report.ok, false, field);
    assert.match(report.error, error, field);
    assert.equal(report.boundary.certificateChainPathValidationPerformed, false);
    assert.equal(report.boundary.nonEmptyCaTsaSemanticTrustEstablished, false);
  }
});

test("versioned witness policy rejects invalid quorum and duplicate labels or keys", () => {
  const first = pair();
  const second = pair();
  const base = {
    providerOrigin: ORIGIN,
    providerOperator: OPERATOR,
    quorum: 2,
    witnesses: [{
      name: "one.fixture.test",
      operator: "one-operator.fixture.test",
      publicKey: { keyDetails: "PKIX_ED25519", rawBytes: first.der.toString("base64") },
    }, {
      name: "two.fixture.test",
      operator: "two-operator.fixture.test",
      publicKey: { keyDetails: "PKIX_ED25519", rawBytes: second.der.toString("base64") },
    }],
  };
  assert.throws(() => createEpisodeAttemptSetExternalWitnessKeyPolicyV3({
    ...base, quorum: 3,
  }), /WITNESS_POLICY_QUORUM_INVALID/);
  assert.throws(() => createEpisodeAttemptSetExternalWitnessKeyPolicyV3({
    ...base,
    witnesses: [base.witnesses[0], { ...base.witnesses[1], name: "one.fixture.test" }],
  }), /DUPLICATE_INDEPENDENCE_LABEL_INVALID/);
  assert.throws(() => createEpisodeAttemptSetExternalWitnessKeyPolicyV3({
    ...base,
    witnesses: [base.witnesses[0], {
      ...base.witnesses[1], publicKey: base.witnesses[0].publicKey,
    }],
  }), /DUPLICATE_INDEPENDENCE_LABEL_INVALID/);
  assert.throws(() => createEpisodeAttemptSetExternalWitnessKeyPolicyV3({
    ...base,
    witnesses: [{ ...base.witnesses[0],
      publicKey: { keyDetails: "PKIX_ED25519", rawBytes: "AAAA".repeat(250_000) } },
    base.witnesses[1]],
  }), /WITNESS_POLICY_WITNESS_KEY_BYTES_INVALID/);
});

test("JSON duplicate names, non-Buffer bytes, and accessor inputs fail without leakage", () => {
  {
    const built = fixture();
    built.record.timestampBytes = Buffer.from(
      '{"signatures":[],"signed":{},"signed":{"_type":"timestamp"}}');
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /JSON_DUPLICATE_OR_BUDGET_INVALID/);
  }
  {
    const built = fixture();
    built.record.targetsBytes = new Uint8Array(built.record.targetsBytes);
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /TARGETS_BUFFER_REQUIRED/);
  }
  {
    const built = fixture();
    let trapped = 0;
    built.record.timestampBytes = new Proxy(built.record.timestampBytes, {
      getPrototypeOf() {
        trapped += 1;
        throw new Error("PROXY_BUFFER_GET_PROTOTYPE_SENTINEL");
      },
      get() {
        trapped += 1;
        throw new Error("PROXY_BUFFER_GET_SENTINEL");
      },
    });
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /TIMESTAMP_BUFFER_REQUIRED/u);
    assert.equal(report.error.includes("SENTINEL"), false);
    assert.equal(trapped, 0);
  }
  {
    const built = fixture();
    let touched = false;
    const hostile = { ...built.record };
    Object.defineProperty(hostile, "timestampBytes", {
      enumerable: true,
      get() { touched = true; throw new Error("secret"); },
    });
    const report = replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(
      hostile, built.context);
    assert.equal(report.ok, false);
    assert.equal(touched, false);
    assert.equal(report.error.includes("secret"), false);
  }
  {
    const built = fixture();
    const policy = clone(built.record.policy);
    let trapped = false;
    policy.callerPinsAreExternalProvenance = new Proxy({}, {
      getPrototypeOf() { trapped = true; throw new Error("RAW_SENTINEL_MUST_NOT_LEAK"); },
      ownKeys() { trapped = true; throw new Error("RAW_SENTINEL_MUST_NOT_LEAK"); },
      get() { trapped = true; throw new Error("RAW_SENTINEL_MUST_NOT_LEAK"); },
    });
    const report = replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(
      { ...built.record, policy }, built.context);
    assert.equal(report.ok, false);
    assert.equal(trapped, false);
    assert.equal(report.error.includes("RAW_SENTINEL_MUST_NOT_LEAK"), false);
    assert.match(report.error, /^EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_/u);
  }
});

test("aggregate raw-byte budget counts repeated Buffer occurrences before copy or crypto", () => {
  const built = fixture();
  const repeated = Buffer.alloc(8 * 1024 * 1024, 0x20);
  built.record.rootRotationBytes = new Array(8).fill(repeated);
  const report = replay(built);
  assert.equal(report.ok, false);
  assert.match(report.error, /TOTAL_RAW_BYTES_EXCEEDED/);
  assert.equal(report.tufBootstrapSelfThresholdVerified, false);
  assert.equal(report.tufRootRotationsVerified, 0);
});

test("replay crypto budget fails before the exactly one-over verification attempt", () => {
  const built = fixture();
  const signed = clone(built.values.root1Signed);
  const authorized = [];
  for (let index = 0;
    index <= EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY
      .cryptoVerifyOperationBudget;
    index += 1) {
    const alias = clone(tufKey(built.keys.a));
    alias["x-operation-budget-alias"] = index;
    const keyid = tufKeyObjectId(alias);
    signed.keys[keyid] = alias;
    authorized.push(keyid);
  }
  signed.roles.root = { keyids: authorized, threshold: authorized.length };
  const rootBytes = bytes({
    signatures: authorized.map((keyid) => ({ keyid, sig: "00".repeat(64) })),
    signed,
  });
  const policy = createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3({
    ...built.inputs.policyInput,
    bootstrapRootHash: sha(rootBytes),
    expectedFinalRootVersion: 1,
  });
  built.record.policy = policy;
  built.record.bootstrapRootBytes = rootBytes;
  built.record.rootRotationBytes = [];
  built.context.expectedPolicyHash = policy.policyHash;
  const report = replay(built);
  assert.equal(authorized.length,
    EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY
      .cryptoVerifyOperationBudget + 1);
  assert.equal(report.ok, false);
  assert.equal(report.replayOperationBudgetEnforced, true);
  assert.match(report.error, /CRYPTO_VERIFY_OPERATION_BUDGET_EXCEEDED/u);
  assert.equal(report.tufBootstrapSelfThresholdVerified, false);
});

test("policy pins exact TUF versions, target paths, endpoint, and provider operator", () => {
  const built = fixture();
  assert.equal(built.record.policy.tuf.trustedRootTargetPath, TRUSTED_ROOT_PATH);
  assert.equal(built.record.policy.tuf.signingConfigTargetPath, SIGNING_CONFIG_PATH);
  assert.equal(built.record.policy.rekor.endpointOrigin, ORIGIN);
  assert.equal(built.record.policy.rekor.endpointPath, "/api/v2/log/entries");
  assert.equal(built.record.policy.rekor.endpointUrl, `${ORIGIN}/api/v2/log/entries`);
  assert.equal(built.record.policy.rekor.operator, OPERATOR);
  assert.equal(Buffer.from(built.record.policy.rekor.logIdBase64, "base64").length, 32);
  assert.equal(Buffer.from(built.record.policy.rekor.checkpointKeyIdBase64,
    "base64").length, 4);
  assert.equal(built.record.policy.rekor.trustedRootIdProfile,
    "LOCAL_CONFLICT_PROFILE_V0_2_LOG_ID_SHA256_SPKI_32_CHECKPOINT_SIGNED_NOTE_TRUNCATED_4");
  assert.throws(() => createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3({
    repositoryId: "bad.fixture.test",
    tufSpecVersion: SPEC,
    updateStartTime: NOW,
    bootstrapRootHash: built.record.policy.tuf.bootstrapRootHash,
    bootstrapRootVersion: 1,
    expectedFinalRootVersion: 2,
    expectedTimestampVersion: 9,
    expectedSnapshotVersion: 8,
    expectedTargetsVersion: 7,
    trustedRootTargetPath: "../trusted_root.json",
    signingConfigTargetPath: SIGNING_CONFIG_PATH,
    rekor: {
      endpointOrigin: ORIGIN,
      operator: OPERATOR,
      logIdBase64: built.record.policy.rekor.logIdBase64,
      checkpointKeyIdBase64: built.record.policy.rekor.checkpointKeyIdBase64,
    },
    witnessPolicy: built.record.policy.witnessPolicy,
    expectedWitnessPolicyHash: built.record.policy.witnessPolicyHash,
  }), /TRUSTED_ROOT_TARGET_PATH_INVALID/);
  for (const unsafePath of ["metadata/..", "metadata/.", "metadata/%2e%2e/root.json",
    "metadata/%2Froot.json", "metadata/%5croot.json"]) {
    assert.throws(() => createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3({
      ...built.inputs.policyInput,
      trustedRootTargetPath: unsafePath,
    }), /TRUSTED_ROOT_TARGET_PATH_INVALID/, unsafePath);
  }
});

test("valid-JSON signed-field tampering keeps old signatures invalid, including extensions", () => {
  const baseline = replay(fixture());
  assert.equal(baseline.ok, true);
  assert.equal(JSON.stringify(baseline).includes("official-style signed extension"), false);
  assert.equal(JSON.stringify(baseline).includes("x-timestamp-extension"), false);

  const built = fixture();
  const timestamp = JSON.parse(built.record.timestampBytes);
  timestamp.signed["x-timestamp-extension"] = "tampered after signing";
  built.record.timestampBytes = bytes(timestamp);
  const report = replay(built);
  assert.equal(report.ok, false);
  assert.match(report.error, /TIMESTAMP_SIGNATURE_THRESHOLD_NOT_MET/);
  assert.equal(report.tufUnknownSignedExtensionsProjected, false);

  const core = fixture();
  const coreTimestamp = JSON.parse(core.record.timestampBytes);
  coreTimestamp.signed.version += 1;
  core.record.timestampBytes = bytes(coreTimestamp);
  const coreReport = replay(core);
  assert.equal(coreReport.ok, false);
  assert.match(coreReport.error, /TIMESTAMP_SIGNATURE_THRESHOLD_NOT_MET/);
});

test("OLPC strings preserve PEM LF, controls, separators, and non-BMP but reject surrogates", () => {
  const special = "LF\nCR\rNUL\u0000LS\u2028PS\u2029NONBMP-\u{1f642}";
  const canonical = tufCanonicalize({ special });
  assert.equal(canonical.includes("\\n"), false);
  assert.equal(canonical.includes("\\r"), false);
  assert.equal(canonical.includes("\\u0000"), false);
  assert.equal(canonical.includes("\\u2028"), false);
  assert.equal(canonical.includes("\\u2029"), false);
  assert.equal(canonical.includes("\n"), true);
  assert.equal(canonical.includes("\r"), true);
  assert.equal(canonical.includes("\u2028"), true);
  assert.equal(canonical.includes("\u2029"), true);
  assert.equal(canonical.includes("\u{1f642}"), true);
  assert.equal(Buffer.from(canonical).includes(Buffer.from([0])), true);
  assert.equal(tufCanonicalize({ "\u{10000}": 1, "\ue000": 2 }),
    "{\"\ue000\":2,\"\u{10000}\":1}");

  const built = fixture();
  assert.match(built.keys.b.pem, /^-----BEGIN PUBLIC KEY-----\n/u);
  assert.match(built.keys.b.pem, /\n-----END PUBLIC KEY-----\n$/u);
  const bootstrap = JSON.parse(built.record.bootstrapRootBytes);
  assert.equal(bootstrap.signed.keys[tufKeyId(built.keys.b)].keyval.public,
    built.keys.b.pem);
  built.values.timestampSigned["x-olpc-string-profile"] = special;
  built.values.timestampSigned["x-unicode-key-order"] = {
    "\u{10000}": "non-BMP key",
    "\ue000": "BMP key sorts first by Unicode scalar",
  };
  built.record.timestampBytes = bytes(envelope(
    built.values.timestampSigned, [built.keys.online2.timestamp]));
  const report = replay(built);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.tufBootstrapSelfSignaturesVerified, 2);

  const lone = fixture();
  lone.values.timestampSigned["x-lone-surrogate"] = "\ud800";
  lone.record.timestampBytes = bytes(envelope(
    lone.values.timestampSigned, [lone.keys.online2.timestamp]));
  const rejected = replay(lone);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /TUF_CANONICAL_STRING_INVALID/);
});

test("TUF meta version-only descriptions are accepted without inventing byte-hash binding", () => {
  const built = fixture();
  delete built.values.snapshotSigned.meta["root.json"];
  built.values.snapshotSigned.meta["targets.json"] = { version: 7 };
  built.record.snapshotBytes = bytes(envelope(
    built.values.snapshotSigned, [built.keys.online2.snapshot]));
  built.values.timestampSigned.meta["snapshot.json"] = { version: 8 };
  built.record.timestampBytes = bytes(envelope(
    built.values.timestampSigned, [built.keys.online2.timestamp]));
  const report = replay(built);
  assert.equal(report.ok, true);
  assert.equal(report.tufSnapshotBytesBoundByTimestampDescription, false);
  assert.equal(report.tufSnapshotLengthBoundByTimestampDescription, false);
  assert.equal(report.tufSnapshotSha256BoundByTimestampDescription, false);
  assert.equal(report.tufFinalRootBytesBoundBySnapshotDescription, false);
  assert.equal(report.tufTargetsBytesBoundBySnapshotDescription, false);
  assert.equal(report.tufTargetsLengthBoundBySnapshotDescription, false);
  assert.equal(report.tufTargetsSha256BoundBySnapshotDescription, false);
  assert.equal(report.tufTargetLengthAndSha256Verified, true);

  const lengthOnly = fixture();
  lengthOnly.values.timestampSigned.meta["snapshot.json"] = {
    version: 8,
    length: lengthOnly.record.snapshotBytes.length,
  };
  lengthOnly.record.timestampBytes = bytes(envelope(
    lengthOnly.values.timestampSigned, [lengthOnly.keys.online2.timestamp]));
  const lengthReport = replay(lengthOnly);
  assert.equal(lengthReport.ok, true, lengthReport.error);
  assert.equal(lengthReport.tufSnapshotLengthBoundByTimestampDescription, true);
  assert.equal(lengthReport.tufSnapshotSha256BoundByTimestampDescription, false);

  const hashOnly = fixture();
  hashOnly.values.timestampSigned.meta["snapshot.json"] = {
    version: 8,
    hashes: { sha256: sha(hashOnly.record.snapshotBytes).slice("sha256:".length) },
  };
  hashOnly.record.timestampBytes = bytes(envelope(
    hashOnly.values.timestampSigned, [hashOnly.keys.online2.timestamp]));
  const hashReport = replay(hashOnly);
  assert.equal(hashReport.ok, true, hashReport.error);
  assert.equal(hashReport.tufSnapshotLengthBoundByTimestampDescription, false);
  assert.equal(hashReport.tufSnapshotSha256BoundByTimestampDescription, true);

  const extraMetadataHash = fixture();
  extraMetadataHash.values.timestampSigned.meta["snapshot.json"].hashes.sha512 = "00";
  extraMetadataHash.record.timestampBytes = bytes(envelope(
    extraMetadataHash.values.timestampSigned, [extraMetadataHash.keys.online2.timestamp]));
  const extraMetadataHashReport = replay(extraMetadataHash);
  assert.equal(extraMetadataHashReport.ok, false);
  assert.match(extraMetadataHashReport.error, /TIMESTAMP_META_ENTRY_HASHES_ALGORITHMS_INVALID/);

  const extraTargetHash = fixture();
  extraTargetHash.values.targetsSigned.targets[TRUSTED_ROOT_PATH].hashes.sha512 = "00";
  extraTargetHash.record.targetsBytes = bytes(envelope(
    extraTargetHash.values.targetsSigned, [extraTargetHash.keys.online2.targets]));
  extraTargetHash.values.snapshotSigned.meta["targets.json"] = description(
    extraTargetHash.record.targetsBytes, 7);
  extraTargetHash.record.snapshotBytes = bytes(envelope(
    extraTargetHash.values.snapshotSigned, [extraTargetHash.keys.online2.snapshot]));
  extraTargetHash.values.timestampSigned.meta["snapshot.json"] = description(
    extraTargetHash.record.snapshotBytes, 8);
  extraTargetHash.record.timestampBytes = bytes(envelope(
    extraTargetHash.values.timestampSigned, [extraTargetHash.keys.online2.timestamp]));
  const extraTargetHashReport = replay(extraTargetHash);
  assert.equal(extraTargetHashReport.ok, false);
  assert.match(extraTargetHashReport.error, /TARGET_ENTRIES_HASHES_ALGORITHMS_INVALID/);

  const extraTimestampMeta = fixture();
  extraTimestampMeta.values.timestampSigned.meta["targets.json"] = { version: 7 };
  extraTimestampMeta.record.timestampBytes = bytes(envelope(
    extraTimestampMeta.values.timestampSigned, [extraTimestampMeta.keys.online2.timestamp]));
  const extraTimestampMetaReport = replay(extraTimestampMeta);
  assert.equal(extraTimestampMetaReport.ok, false);
  assert.match(extraTimestampMetaReport.error, /TIMESTAMP_SNAPSHOT_META_EXACT_INVALID/);
});

test("TrustedRoot v0.2 log ID and checkpoint ID reject swaps, lengths, and algorithms", () => {
  const cases = [
    ["swap", (entry) => {
      const oldLog = entry.logId.keyId;
      entry.logId.keyId = entry.checkpointKeyId.keyId;
      entry.checkpointKeyId.keyId = oldLog;
    }, /TRUSTED_ROOT_TLOGS_LOG_ID_BYTES_INVALID/],
    ["log-length", (entry) => {
      entry.logId.keyId = Buffer.alloc(4, 1).toString("base64");
    }, /TRUSTED_ROOT_TLOGS_LOG_ID_BYTES_INVALID/],
    ["checkpoint-length", (entry) => {
      entry.checkpointKeyId.keyId = Buffer.alloc(32, 2).toString("base64");
    }, /TRUSTED_ROOT_TLOGS_CHECKPOINT_ID_BYTES_INVALID/],
    ["log-derivation", (entry) => {
      entry.logId.keyId = Buffer.alloc(32, 3).toString("base64");
    }, /TRUSTED_ROOT_TLOGS_ID_INVALID/],
    ["checkpoint-derivation", (entry) => {
      entry.checkpointKeyId.keyId = Buffer.alloc(4, 4).toString("base64");
    }, /TRUSTED_ROOT_TLOGS_ID_INVALID/],
    ["algorithm", (entry) => {
      entry.publicKey.keyDetails = "PKIX_ECDSA_P256_SHA_256";
    }, /TRUSTED_ROOT_TLOGS_KEY_PROFILE_INVALID/],
  ];
  for (const [name, mutate, expected] of cases) {
    const built = fixture();
    const root = JSON.parse(built.record.trustedRootBytes);
    mutate(root.tlogs[0]);
    built.record.trustedRootBytes = bytes(root);
    resealTargetsAndMetadata(built);
    const report = replay(built);
    assert.equal(report.ok, false, name);
    assert.match(report.error, expected, name);
    assert.equal(report.stage2Permitted, false, name);
  }
});

test("multi-log replay accepts overlapping shared IDs, scheme-less names, and optional hints", () => {
  const built = fixture({ logKeyDetails: "PKIX_ECDSA_P256_SHA_256" });
  const root = JSON.parse(built.record.trustedRootBytes);
  const shared = clone(root.tlogs[0]);
  shared.baseUrl = "historical.fixture.test/log";
  shared.operator = "historical-operator.fixture.test";
  const withoutHint = clone(shared);
  withoutHint.baseUrl = "older.fixture.test/log";
  withoutHint.operator = "older-operator.fixture.test";
  delete withoutHint.checkpointKeyId;
  root.tlogs.push(shared, withoutHint);
  const ctlog = clone(withoutHint);
  ctlog.baseUrl = "ct.fixture.test/log";
  ctlog.operator = "ct-operator.fixture.test";
  root.ctlogs.push(ctlog);
  built.record.trustedRootBytes = bytes(root);
  resealTargetsAndMetadata(built);
  const report = replay(built);
  assert.equal(report.ok, true, report.error);
  assert.equal(report.exactRekorProviderEndpointVerified, true);
  assert.equal(report.rekorV2TrustRootIdProfileInteroperabilityEstablished, false);
});

test("only the exact pinned Rekor tuple requires a unique checkpoint-key match", () => {
  {
    const built = fixture();
    const root = JSON.parse(built.record.trustedRootBytes);
    root.tlogs.push(clone(root.tlogs[0]));
    built.record.trustedRootBytes = bytes(root);
    resealTargetsAndMetadata(built);
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /TRUSTED_ROOT_TLOGS_AMBIGUOUS/);
  }
  {
    const built = fixture();
    const root = JSON.parse(built.record.trustedRootBytes);
    delete root.tlogs[0].checkpointKeyId;
    built.record.trustedRootBytes = bytes(root);
    resealTargetsAndMetadata(built);
    const report = replay(built);
    assert.equal(report.ok, false);
    assert.match(report.error, /TRUSTED_ROOT_TLOGS_PINNED_LOG_CHECKPOINT_ID_REQUIRED/);
  }
});

test("signed-note digests work under the local split-ID Ed25519/ECDSA/RSA profile", () => {
  for (const keyDetails of ["PKIX_ED25519", "PKIX_ECDSA_P256_SHA_256",
    "PKIX_RSA_PKCS1V15_2048_SHA256"]) {
    const report = replay(fixture({ logKeyDetails: keyDetails }));
    assert.equal(report.ok, true, `${keyDetails}: ${report.error}`);
    assert.equal(report.rekor.publicKeyDetails, keyDetails);
    assert.equal(Buffer.from(report.rekor.logIdBase64, "base64").length, 32);
    assert.equal(Buffer.from(report.rekor.checkpointKeyIdBase64, "base64").length, 4);
  }
});

test("100k unknown caller-wrapper getters are inert and required accessors stay unread", () => {
  const built = fixture();
  let reads = 0;
  const policyClone = clone(built.record.policy);
  const noisyRekor = withGetterNoise(policyClone.rekor, 100_000, () => { reads += 1; });
  Object.defineProperty(noisyRekor, "unknown_proxy", {
    enumerable: true,
    value: new Proxy({}, {
      ownKeys() { reads += 1; throw new Error("unknown proxy must stay inert"); },
      get() { reads += 1; throw new Error("unknown proxy must stay inert"); },
    }),
  });
  policyClone.rekor = noisyRekor;
  const noisyPolicy = withGetterNoise(policyClone, 1, () => { reads += 1; });
  const noisyContext = withGetterNoise(built.context, 1, () => { reads += 1; });
  const noisyRecord = withGetterNoise({ ...built.record, policy: noisyPolicy }, 100_000,
    () => { reads += 1; });
  const report = replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(
    noisyRecord, noisyContext);
  assert.equal(report.ok, true);
  assert.equal(reads, 0);
  assert.equal(JSON.stringify(report).includes("unknown_"), false);

  const witness = createEpisodeAttemptSetExternalWitnessKeyPolicyV3(
    withGetterNoise(built.inputs.witnessInput, 1, () => { reads += 1; }));
  assert.match(witness.policyHash, /^sha256:[a-f0-9]{64}$/u);
  const policyInput = { ...built.inputs.policyInput, witnessPolicy: witness,
    expectedWitnessPolicyHash: witness.policyHash };
  const policy = createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3(
    withGetterNoise(policyInput, 1, () => { reads += 1; }));
  assert.match(policy.policyHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(reads, 0);
});

test("post-import intrinsic, options, numeric-setter, and species poison is zero-touch", () => {
  const built = fixture();
  const malformedRecord = { ...built.record, timestampBytes: Buffer.from("{") };
  const methods = ["map", "filter", "some", "push"];
  const methodDescriptors = methods.map(
    (name) => [name, Object.getOwnPropertyDescriptor(Array.prototype, name)]);
  const bufferLengthDescriptor = Object.getOwnPropertyDescriptor(Buffer.prototype, "length");
  const bufferConstructorDescriptor = Object.getOwnPropertyDescriptor(
    Buffer.prototype, "constructor");
  const bufferSpeciesDescriptor = Object.getOwnPropertyDescriptor(Buffer, Symbol.species);
  const bufferHasInstanceDescriptor = Object.getOwnPropertyDescriptor(
    Buffer, Symbol.hasInstance);
  const arrayZeroDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "0");
  const regexpExecDescriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, "exec");
  const regexpReplaceDescriptor = Object.getOwnPropertyDescriptor(
    RegExp.prototype, Symbol.replace);
  const stringIndexDescriptor = Object.getOwnPropertyDescriptor(String.prototype, "1");
  const originalSet = globalThis.Set;
  const originalMap = globalThis.Map;
  const originalString = globalThis.String;
  const originalNumber = globalThis.Number;
  const hashDescriptors = ["update", "digest"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(Hash.prototype, name)]);
  const urlGetterNames = ["protocol", "username", "password", "search", "hash",
    "pathname", "origin"];
  const urlDescriptors = urlGetterNames.map(
    (name) => [name, Object.getOwnPropertyDescriptor(URL.prototype, name)]);
  const publicKeyPrototype = Object.getPrototypeOf(built.keys.log.publicKey);
  const asymmetricKeyPrototype = Object.getPrototypeOf(publicKeyPrototype);
  const keyObjectPrototype = Object.getPrototypeOf(asymmetricKeyPrototype);
  const keyExportDescriptor = Object.getOwnPropertyDescriptor(publicKeyPrototype, "export");
  const keyTypeDescriptor = Object.getOwnPropertyDescriptor(keyObjectPrototype, "type");
  const keyGetterDescriptors = ["asymmetricKeyType", "asymmetricKeyDetails"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(asymmetricKeyPrototype, name)]);
  const objectPoisonNames = ["policy", "signed", "key", "padding", "saltLength",
    "dsaEncoding", "context", "encoding", "format", "type", "cipher", "passphrase",
    "fatal", "ignoreBOM", "value", "get", "set"];
  let prototypeTouches = 0;
  const objectPoisonRecords = objectPoisonNames.map((name) => {
    const descriptor = Object.create(null);
    descriptor.configurable = true;
    descriptor.enumerable = false;
    descriptor.get = () => {
      prototypeTouches += 1;
      throw new Error(`poisoned Object.prototype.${name} getter`);
    };
    descriptor.set = () => {
      prototypeTouches += 1;
      throw new Error(`poisoned Object.prototype.${name} setter`);
    };
    return [name, Object.getOwnPropertyDescriptor(Object.prototype, name), descriptor];
  });
  let report;
  let malformedReport;
  try {
    for (const [name] of methodDescriptors) {
      Object.defineProperty(Array.prototype, name, {
        configurable: true,
        writable: true,
        value() { throw new Error(`poisoned Array.prototype.${name}`); },
      });
    }
    Object.defineProperty(Buffer.prototype, "length", {
      configurable: true,
      get() { throw new Error("poisoned Buffer.prototype.length"); },
    });
    Object.defineProperty(Buffer.prototype, "constructor", {
      configurable: true,
      get() { prototypeTouches += 1; throw new Error("poisoned Buffer constructor"); },
    });
    Object.defineProperty(Buffer, Symbol.species, {
      configurable: true,
      get() { prototypeTouches += 1; throw new Error("poisoned Buffer species"); },
    });
    Object.defineProperty(Buffer, Symbol.hasInstance, {
      configurable: true,
      get() { prototypeTouches += 1; throw new Error("poisoned Buffer @@hasInstance"); },
    });
    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      get() { prototypeTouches += 1; throw new Error("poisoned Array.prototype[0] getter"); },
      set() { prototypeTouches += 1; throw new Error("poisoned Array.prototype[0] setter"); },
    });
    Object.defineProperty(RegExp.prototype, "exec", {
      configurable: true,
      writable: true,
      value() { prototypeTouches += 1; throw new Error("poisoned RegExp.prototype.exec"); },
    });
    Object.defineProperty(RegExp.prototype, Symbol.replace, {
      configurable: true,
      writable: true,
      value() { prototypeTouches += 1; throw new Error("poisoned RegExp @@replace"); },
    });
    Object.defineProperty(String.prototype, "1", {
      configurable: true,
      get() { prototypeTouches += 1; throw new Error("poisoned String.prototype[1]"); },
    });
    for (const [name] of hashDescriptors) {
      Object.defineProperty(Hash.prototype, name, {
        configurable: true,
        writable: true,
        value() { throw new Error(`poisoned Hash.prototype.${name}`); },
      });
    }
    for (const [name] of urlDescriptors) {
      Object.defineProperty(URL.prototype, name, {
        configurable: true,
        get() { throw new Error(`poisoned URL.prototype.${name}`); },
      });
    }
    Object.defineProperty(publicKeyPrototype, "export", {
      configurable: true,
      writable: true,
      value() { throw new Error("poisoned PublicKeyObject.prototype.export"); },
    });
    Object.defineProperty(keyObjectPrototype, "type", {
      configurable: true,
      get() { prototypeTouches += 1; throw new Error("poisoned KeyObject.prototype.type"); },
    });
    for (const [name] of keyGetterDescriptors) {
      Object.defineProperty(asymmetricKeyPrototype, name, {
        configurable: true,
        get() { throw new Error(`poisoned AsymmetricKeyObject.prototype.${name}`); },
      });
    }
    globalThis.Set = class PoisonedSet {
      constructor() { throw new Error("poisoned global Set"); }
    };
    globalThis.Map = class PoisonedMap {
      constructor() { throw new Error("poisoned global Map"); }
    };
    globalThis.String = function PoisonedString() {
      throw new Error("poisoned global String");
    };
    globalThis.Number = function PoisonedNumber() {
      throw new Error("poisoned global Number");
    };
    for (const [name, , descriptor] of objectPoisonRecords) {
      Object.defineProperty(Object.prototype, name, descriptor);
    }
    report = replay(built);
    malformedReport = replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(
      malformedRecord, built.context);
  } finally {
    if (stringIndexDescriptor) {
      Object.defineProperty(String.prototype, "1", stringIndexDescriptor);
    } else {
      delete String.prototype[1];
    }
    for (const [name] of objectPoisonRecords) delete Object.prototype[name];
    for (const [name, descriptor] of objectPoisonRecords) {
      if (descriptor !== undefined) Object.defineProperty(Object.prototype, name, descriptor);
    }
    if (arrayZeroDescriptor) Object.defineProperty(Array.prototype, "0", arrayZeroDescriptor);
    else delete Array.prototype[0];
    Object.defineProperty(RegExp.prototype, "exec", regexpExecDescriptor);
    Object.defineProperty(RegExp.prototype, Symbol.replace, regexpReplaceDescriptor);
    for (const [name, descriptor] of methodDescriptors) {
      Object.defineProperty(Array.prototype, name, descriptor);
    }
    if (bufferLengthDescriptor) {
      Object.defineProperty(Buffer.prototype, "length", bufferLengthDescriptor);
    } else {
      delete Buffer.prototype.length;
    }
    Object.defineProperty(Buffer.prototype, "constructor", bufferConstructorDescriptor);
    Object.defineProperty(Buffer, Symbol.species, bufferSpeciesDescriptor);
    if (bufferHasInstanceDescriptor) {
      Object.defineProperty(Buffer, Symbol.hasInstance, bufferHasInstanceDescriptor);
    } else {
      delete Buffer[Symbol.hasInstance];
    }
    for (const [name, descriptor] of hashDescriptors) {
      Object.defineProperty(Hash.prototype, name, descriptor);
    }
    for (const [name, descriptor] of urlDescriptors) {
      Object.defineProperty(URL.prototype, name, descriptor);
    }
    Object.defineProperty(publicKeyPrototype, "export", keyExportDescriptor);
    Object.defineProperty(keyObjectPrototype, "type", keyTypeDescriptor);
    for (const [name, descriptor] of keyGetterDescriptors) {
      Object.defineProperty(asymmetricKeyPrototype, name, descriptor);
    }
    globalThis.Set = originalSet;
    globalThis.Map = originalMap;
    globalThis.String = originalString;
    globalThis.Number = originalNumber;
  }
  assert.equal(prototypeTouches, 0);
  assert.equal(report.ok, true, report.error);
  assert.equal(malformedReport.ok, false);
  assert.match(malformedReport.error, /TIMESTAMP_JSON_INVALID/);
  assert.equal(report.exactRekorLogIdVerified, true);
  assert.equal(report.verificationPublicationNetworkSafe, false);
});

test("proof matrix names the remaining non-proofs explicitly", () => {
  assert.equal(Object.isFrozen(
    EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_PROOF_MATRIX), true);
  assert.ok(EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_PROOF_MATRIX
    .callerBootstrapAndPins.doesNotProve.includes("SIGSTORE_ORIGIN_OR_INDEPENDENT_ACQUISITION"));
  assert.ok(EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_PROOF_MATRIX
    .witnessPolicy.doesNotProve.includes("WITNESS_SIGNATURE_OR_OPERATIONAL_INDEPENDENCE"));
});
