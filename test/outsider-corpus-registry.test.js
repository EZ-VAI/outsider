import assert from "node:assert/strict";
import {
  createHash, generateKeyPairSync, sign as cryptoSign,
} from "node:crypto";
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  CORPUS_REGISTRY_SCHEMAS,
  DurableStage1CurateCorpusRegistry,
  corpusRegistryKeyId,
  createCorpusArtifactSet,
  externalTimestampReceiptSigningHash,
  verifyCorpusArtifactSet,
} from "../src/outsider-corpus-registry.js";

const T0 = "2036-01-01T00:00:00.000Z";
const at = (seconds) => new Date(Date.parse(T0) + seconds * 1_000);
const hash = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;

function keys() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function fixture({ timestampAuthorities = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-corpus-registry-"));
  const signer = keys();
  const registry = new DurableStage1CurateCorpusRegistry({ directory: root,
    privateKeyPem: signer.privateKey, registryId: "test-stage1-curate", createdAt: at(0),
    timestampAuthorities });
  return { root, signer, registry };
}

function setInput({ id = "batch-1", createdAt = at(1), identity = "identity-a",
  record = "record-a", instrumentId = "instrument-a", instrumentVersion = "1.0.0",
  stage = "ATTEST", retainUntil = null } = {}) {
  return {
    artifactSetId: id,
    stage,
    stream: stage === "ATTEST" ? "FORWARD_ACTION_EVIDENCE"
      : "BACKWARD_EXPERIENCE_EVIDENCE",
    createdAt,
    instrument: { instrumentId, instrumentVersion,
      implementationHash: hash(`${instrumentId}:${instrumentVersion}:implementation`),
      featureSchemaHash: hash(`${instrumentId}:feature-schema`) },
    datasetIds: ["public/test-corpus"],
    licenseIds: ["Apache-2.0"],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: [hash(`${id}:license-declaration`)],
      registryGrantsRights: false },
    sourceProof: {
      sourceKind: "SYNTHETIC_TEST_FULL_SOURCE",
      verificationLevel: "FULL_SOURCE_REDERIVED",
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      verifierImplementationHash: hash("source-verifier"),
      verificationHash: hash(`${id}:verification`),
      manifestHashes: [hash(`${id}:manifest`)],
      sourceArtifactHashes: [hash(`${id}:source-object`)],
      migration: { method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
        legacySchemas: ["outsider/test-source/v1"] },
    },
    units: [{ identityHash: hash(identity), recordHash: hash(record),
      datasetRoot: hash("dataset-root"),
      correlationRoots: [hash("dataset-root"), hash(`${identity}:task`)].sort() }],
    retention: retainUntil === null ? {
      mode: "NO_AUTOMATIC_EXPIRY_PUBLIC_SOURCE", retainUntil: null,
      storedPayloadClass: "HASHES_AND_BOUNDED_METADATA_ONLY",
      sourcePayloadManaged: false, expiryDisposition: "NOT_APPLICABLE",
      liveRevocationChecked: false,
    } : {
      mode: "EXPIRES_AT_KEEP_HASH_ONLY_TOMBSTONE",
      retainUntil: retainUntil.toISOString(),
      storedPayloadClass: "HASHES_AND_BOUNDED_METADATA_ONLY",
      sourcePayloadManaged: false,
      expiryDisposition: "BLOCK_USE_KEEP_HASH_ONLY_TOMBSTONE",
      liveRevocationChecked: false,
    },
  };
}

function signedSet(signer, options) {
  return createCorpusArtifactSet(setInput(options), { privateKeyPem: signer.privateKey });
}

function canonicalWrite(file, value) {
  writeFileSync(file, `${canonicalizeStrict(value)}\n`);
}

test("durable registry signs artifact sets and a rebuildable append-only index", () => {
  const { root, signer, registry } = fixture();
  try {
    const set = signedSet(signer, {});
    assert.equal(verifyCorpusArtifactSet(set).ok, true);
    const appended = registry.appendArtifactSet(set, { recordedAt: at(2) });
    assert.equal(appended.appended, true);
    const check = registry.verify({ now: at(3) });
    assert.equal(check.ok, true, check.error);
    assert.equal(check.appendOnlyLogVerified, true);
    assert.equal(check.artifactSetSignaturesVerified, true);
    assert.equal(check.counts.activeArtifactSets, 1);
    assert.equal(check.counts.candidates, 1);
    assert.equal(check.signatureTrustedByPolicy, false);
    const reopened = new DurableStage1CurateCorpusRegistry({ directory: root });
    assert.equal(reopened.verify({ now: at(4) }).ok, true);
    assert.equal(registry.appendArtifactSet(set, { recordedAt: at(5) }).duplicateArtifactSet,
      true);
    assert.equal(registry.verify({ now: at(6) }).events, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ordinary verification treats resealed full-source metadata only as an operator claim", () => {
  const { root, signer, registry } = fixture();
  try {
    const input = setInput({ id: "fake-full-source" });
    input.sourceProof = { ...input.sourceProof, sourceKind: "FAKE_FULL_SOURCE",
      verificationHash: hash("invented-verification"),
      manifestHashes: [hash("invented-manifest")],
      sourceArtifactHashes: [hash("invented-source-object")] };
    const fake = createCorpusArtifactSet(input, { privateKeyPem: signer.privateKey });
    registry.appendArtifactSet(fake, { recordedAt: at(2) });
    const checked = registry.verify({ now: at(3) });
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.fullSourceArtifactSetsReverified, 0);
    assert.equal(checked.counts.operatorSignedFullSourceClaims, 1);
    assert.equal(Object.hasOwn(checked.counts, "fullSourceArtifactSets"), false);
    assert.equal(checked.sourceVerificationBoundary
      .operatorSignedSourceClaimsTrustedAsSourceReplay, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("D1 discloses exact duplicates, rejects conflicts atomically, and D2 never mixes instruments",
  () => {
    const { root, signer, registry } = fixture();
    try {
      registry.appendArtifactSet(signedSet(signer, { id: "batch-1" }), { recordedAt: at(2) });
      registry.appendArtifactSet(signedSet(signer, { id: "batch-2", createdAt: at(3) }),
        { recordedAt: at(4) });
      let status = registry.status({ now: at(5) });
      assert.equal(status.ok, true, status.error);
      assert.equal(status.d1.exactSameInstrumentDuplicates, 1);
      assert.equal(status.d1.uniqueSourceIdentities, 1);
      assert.equal(status.d2.groups.length, 1);
      assert.equal(status.d2.groups[0].candidates, 2);
      const before = readFileSync(path.join(root, "events.jsonl"), "utf8");
      const conflict = signedSet(signer, { id: "batch-conflict", createdAt: at(5),
        record: "different-record" });
      assert.throws(() => registry.appendArtifactSet(conflict, { recordedAt: at(6) }),
        /CROSS_BATCH_IDENTITY_CONFLICT/);
      assert.equal(readFileSync(path.join(root, "events.jsonl"), "utf8"), before);
      registry.appendArtifactSet(signedSet(signer, { id: "batch-other-instrument",
        createdAt: at(7), instrumentId: "instrument-b" }), { recordedAt: at(8) });
      status = registry.status({ now: at(9) });
      assert.equal(status.ok, true, status.error);
      assert.equal(status.d1.crossInstrumentReuses, 1);
      assert.equal(status.d2.groups.length, 2);
      assert.equal(status.d2.groups.every((group) => group.boundary.pricingEligible === false),
        true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("tampered artifact, event log, and signed index all fail closed", () => {
  for (const target of ["artifact", "event", "index", "partial-tail"]) {
    const { root, signer, registry } = fixture();
    try {
      const set = signedSet(signer, {});
      registry.appendArtifactSet(set, { recordedAt: at(2) });
      if (target === "artifact") {
        const file = path.join(root, "artifact-sets", `${set.artifactSetHash.slice(7)}.json`);
        const value = JSON.parse(readFileSync(file, "utf8"));
        value.units[0].recordHash = hash("tampered");
        canonicalWrite(file, value);
      } else if (target === "event") {
        const file = path.join(root, "events.jsonl");
        const event = JSON.parse(readFileSync(file, "utf8"));
        event.payload.artifactSetHash = hash("tampered");
        canonicalWrite(file, event);
      } else if (target === "index") {
        const file = path.join(root, "index.json");
        const value = JSON.parse(readFileSync(file, "utf8"));
        value.counts.candidates = 999;
        canonicalWrite(file, value);
      } else {
        const file = path.join(root, "events.jsonl");
        writeFileSync(file, readFileSync(file, "utf8").trimEnd());
      }
      assert.equal(registry.verify({ now: at(3) }).ok, false, target);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("state reads use no-follow stable file descriptors instead of trusting path lstat", () => {
  const { root, signer, registry } = fixture();
  try {
    registry.appendArtifactSet(signedSet(signer, {}), { recordedAt: at(2) });
    const indexFile = path.join(root, "index.json");
    const moved = path.join(root, "signed-index-target.json");
    renameSync(indexFile, moved);
    symlinkSync(moved, indexFile);
    const checked = registry.verify({ now: at(3) });
    assert.equal(checked.ok, false);
    assert.match(checked.error, /INDEX_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a valid signed-prefix index can recover a crash suffix but tampering cannot", () => {
  const { root, signer, registry } = fixture();
  try {
    const initialIndex = readFileSync(path.join(root, "index.json"), "utf8");
    registry.appendArtifactSet(signedSet(signer, {}), { recordedAt: at(2) });
    writeFileSync(path.join(root, "index.json"), initialIndex);
    assert.equal(registry.verify({ now: at(3) }).ok, false);
    const repaired = registry.repairIndex();
    assert.equal(repaired.repaired, true);
    assert.equal(repaired.events, 1);
    assert.equal(registry.verify({ now: at(3) }).ok, true);
    const damaged = JSON.parse(readFileSync(path.join(root, "index.json"), "utf8"));
    damaged.log.events = 0;
    canonicalWrite(path.join(root, "index.json"), damaged);
    assert.throws(() => registry.repairIndex(), /CURRENT_INDEX_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("external time is claimed only after a configured authority signs the exact request", () => {
  const authority = keys();
  const authorityKeyId = corpusRegistryKeyId(authority.publicKey);
  const trusted = { providerId: "test-rfc3161-bridge", authorityKeyId,
    publicKeyPem: authority.publicKey };
  // The configuration spelling deliberately differs from the receipt spelling.
  const { root, signer, registry } = fixture({ timestampAuthorities: [{
    providerId: trusted.providerId, keyId: authorityKeyId, publicKeyPem: trusted.publicKeyPem,
  }] });
  try {
    const set = signedSet(signer, {});
    registry.appendArtifactSet(set, { recordedAt: at(2) });
    const requested = registry.requestExternalTimestamp(set.artifactSetHash,
      { requestedAt: at(3), nonce: Buffer.from("fixed-test-nonce") });
    let status = registry.status({ now: at(4) });
    assert.equal(status.counts.externallyTimestampedArtifactSets, 0);
    assert.equal(status.d1.conflicts, 0);
    const body = {
      schema: CORPUS_REGISTRY_SCHEMAS.timestampReceipt,
      schemaVersion: "1.0.0",
      providerId: trusted.providerId,
      authorityKeyId,
      requestHash: requested.request.requestHash,
      subjectHash: set.artifactSetHash,
      timestamp: at(4).toISOString(),
    };
    const signingHash = externalTimestampReceiptSigningHash(body);
    const receipt = { ...body, signature: { algorithm: "Ed25519",
      value: cryptoSign(null, Buffer.from(signingHash), authority.privateKey).toString("base64") } };
    const forged = structuredClone(receipt);
    forged.subjectHash = hash("wrong-subject");
    assert.throws(() => registry.attachExternalTimestamp(forged, { recordedAt: at(5) }),
      /TIMESTAMP_ATTACH_RECEIPT_INVALID/);
    registry.attachExternalTimestamp(receipt, { recordedAt: at(5) });
    status = registry.status({ now: at(6) });
    assert.equal(status.ok, true, status.error);
    assert.equal(status.counts.externallyTimestampedArtifactSets, 1);
    const index = JSON.parse(readFileSync(path.join(root, "index.json"), "utf8"));
    assert.equal(index.artifactSets[0].externalTimestamp.externallyVerified, true);
    assert.equal(index.timestampBoundary.configuredAuthoritiesEstablishInstitutionalIndependence,
      false);
    assert.equal(index.timestampBoundary.localSnapshotRollbackResistanceClaimed, false);
    assert.throws(() => registry.requestExternalTimestamp(set.artifactSetHash,
      { requestedAt: at(7) }), /TIMESTAMP_REQUEST_EVENT_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("revocation and expiry keep hash tombstones and never grant economic authority", () => {
  const { root, signer, registry } = fixture();
  try {
    const revoked = signedSet(signer, { id: "revoke-me" });
    const expiring = signedSet(signer, { id: "expire-me", createdAt: at(2),
      identity: "identity-b", retainUntil: at(10) });
    registry.appendArtifactSet(revoked, { recordedAt: at(3) });
    registry.appendArtifactSet(expiring, { recordedAt: at(4) });
    registry.revoke(revoked.artifactSetHash, { reasonCode: "INTEGRITY_CONCERN",
      evidenceHash: hash("evidence"), recordedAt: at(5) });
    let status = registry.status({ now: at(9) });
    assert.equal(status.ok, true, status.error);
    assert.equal(status.counts.activeArtifactSets, 1);
    assert.equal(status.counts.revokedArtifactSets, 1);
    assert.equal(status.boundary.causalExperienceUnits, 0);
    assert.equal(status.boundary.lossEvidenceUnits, 0);
    assert.equal(status.boundary.pricingEligible, false);
    assert.equal(registry.verify({ now: at(10) }).ok, false);
    const expired = registry.expireDue({ now: at(10) });
    assert.equal(expired.expired, 1);
    status = registry.status({ now: at(11) });
    assert.equal(status.ok, true, status.error);
    assert.equal(status.counts.activeArtifactSets, 0);
    assert.equal(status.counts.expiredArtifactSets, 1);
    const index = JSON.parse(readFileSync(path.join(root, "index.json"), "utf8"));
    assert.equal(index.retentionTombstones[0].payloadRetained,
      "HASHES_AND_BOUNDED_METADATA_ONLY");
    assert.equal(index.retentionBoundary.erasureOfUpstreamSourceClaimed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a due retention boundary rejects unrelated mutations byte-atomically, then expiry succeeds",
  () => {
    const { root, signer, registry } = fixture();
    try {
      const due = signedSet(signer, { id: "due", retainUntil: at(10) });
      registry.appendArtifactSet(due, { recordedAt: at(2) });
      const beforeEvents = readFileSync(path.join(root, "events.jsonl"));
      const beforeIndex = readFileSync(path.join(root, "index.json"));
      const beforeArtifacts = readdirSync(path.join(root, "artifact-sets")).sort();
      const unrelated = signedSet(signer, { id: "unrelated", createdAt: at(11),
        identity: "unrelated" });
      assert.throws(() => registry.appendArtifactSet(unrelated, { recordedAt: at(11) }),
        /RETENTION_ACTION_REQUIRED/);
      assert.deepEqual(readFileSync(path.join(root, "events.jsonl")), beforeEvents);
      assert.deepEqual(readFileSync(path.join(root, "index.json")), beforeIndex);
      assert.deepEqual(readdirSync(path.join(root, "artifact-sets")).sort(), beforeArtifacts);
      const expired = registry.expireDue({ now: at(11) });
      assert.equal(expired.expired, 1);
      const checked = registry.verify({ now: at(12) });
      assert.equal(checked.ok, true, checked.error);
      assert.equal(checked.counts.expiredArtifactSets, 1);
      registry.appendArtifactSet(unrelated, { recordedAt: at(13) });
      assert.equal(registry.verify({ now: at(14) }).counts.activeArtifactSets, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("all simultaneously due sets expire in one signed index transition", () => {
  const { root, signer, registry } = fixture();
  try {
    registry.appendArtifactSet(signedSet(signer, { id: "due-a", retainUntil: at(10) }),
      { recordedAt: at(2) });
    registry.appendArtifactSet(signedSet(signer, { id: "due-b", createdAt: at(3),
      identity: "identity-b", retainUntil: at(10) }), { recordedAt: at(4) });
    const expired = registry.expireDue({ now: at(11) });
    assert.equal(expired.expired, 2);
    assert.equal(registry.verify({ now: at(12) }).counts.expiredArtifactSets, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("registration refuses sets already outside their retention window", () => {
  const { root, signer, registry } = fixture();
  try {
    const expired = signedSet(signer, { retainUntil: at(2) });
    assert.throws(() => registry.appendArtifactSet(expired, { recordedAt: at(2) }),
      /EXPIRED_AT_REGISTRATION/);
    assert.equal(registry.verify({ now: at(3) }).events, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("two first-time initializers cannot overwrite the winning signer", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-corpus-init-race-"));
  const start = path.join(root, "start");
  const registryDir = path.join(root, "registry");
  mkdirSync(registryDir);
  const keyFiles = ["a.pem", "b.pem"].map((name) => path.join(root, name));
  for (const [index, file] of keyFiles.entries()) {
    writeFileSync(file, keys().privateKey, { mode: 0o600 });
  }
  const modulePath = path.resolve("src/outsider-corpus-registry.js");
  const childSource = `
    import { existsSync, readFileSync } from "node:fs";
    import { DurableStage1CurateCorpusRegistry } from ${JSON.stringify(modulePath)};
    while (!existsSync(process.argv[3])) Atomics.wait(
      new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    try {
      new DurableStage1CurateCorpusRegistry({ directory: process.argv[1],
        privateKeyPem: readFileSync(process.argv[2], "utf8"), registryId: "race",
        createdAt: new Date(${JSON.stringify(T0)}) });
      process.stdout.write("OK");
    } catch (error) { process.stdout.write("ERR:" + error.message); }
  `;
  const launch = (keyFile) => new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", childSource,
      registryDir, keyFile, start], { encoding: "utf8" });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("close", () => resolve(stdout));
  });
  try {
    const children = keyFiles.map(launch);
    writeFileSync(start, "go");
    const results = await Promise.all(children);
    assert.equal(results.filter((value) => value === "OK").length, 1, results.join(" | "));
    assert.equal(results.filter((value) => value.startsWith("ERR:")).length, 1,
      results.join(" | "));
    assert.match(results.find((value) => value.startsWith("ERR:")),
      /INITIALIZATION_LOCKED|SIGNING_KEY_MISMATCH/);
    const registry = new DurableStage1CurateCorpusRegistry({ directory: registryDir });
    assert.equal(registry.verify({ now: at(1) }).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
