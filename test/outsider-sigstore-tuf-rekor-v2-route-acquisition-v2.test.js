import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash, generateKeyPairSync, sign,
} from "node:crypto";
import {
  mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalize } from "@tufjs/canonical-json";

import { createRekorV2PinnedTufServiceSelectionV2 }
  from "../src/outsider-rekor-durable-effect-head-transport-v2.js";
import {
  acquireSigstoreTufRekorV2RouteV2,
  publishSigstoreTufRekorV2RouteArtifactsV2,
  replaySigstoreTufRekorV2RouteBytesV2,
} from "../src/outsider-sigstore-tuf-rekor-v2-route-acquisition-v2.js";

const START = "2026-09-03T23:00:00.000Z";
const END = "2026-09-03T23:00:01.000Z";
const ORIGIN = "https://log.fixture.test";

const rawSha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const h = (label) => `sha256:${rawSha(Buffer.from(label))}`;

function tufKey() {
  const pair = generateKeyPairSync("ed25519");
  const jwk = pair.publicKey.export({ format: "jwk" });
  const key = { keytype: "ed25519", scheme: "ed25519",
    keyval: { public: Buffer.from(jwk.x, "base64url").toString("hex") } };
  return { pair, key, keyid: rawSha(Buffer.from(canonicalize(key))) };
}

function envelope(signed, signers) {
  const bytes = Buffer.from(canonicalize(signed));
  return Buffer.from(JSON.stringify({
    signatures: signers.map((signer) => ({ keyid: signer.keyid,
      sig: sign(null, bytes, signer.pair.privateKey).toString("hex") })),
    signed,
  }));
}

function desc(bytes, version) {
  return { version, length: bytes.length, hashes: { sha256: rawSha(bytes) } };
}

function targetDesc(bytes) {
  return { length: bytes.length, hashes: { sha256: rawSha(bytes) } };
}

function checkpointId(publicDer) {
  return createHash("sha256").update(Buffer.concat([
    Buffer.from("log.fixture.test\n"), Buffer.from([1]), publicDer.subarray(12),
  ])).digest("base64");
}

function fixture() {
  const old = tufKey();
  const current = tufKey();
  const log = generateKeyPairSync("ed25519");
  const logDer = log.publicKey.export({ type: "spki", format: "der" });
  const expires = "2035-01-01T00:00:00Z";
  const role = (keyid) => ({ keyids: [keyid], threshold: 1 });
  const bootstrapRootBytes = envelope({ _type: "root", spec_version: "1.0",
    version: 1, expires, consistent_snapshot: false,
    keys: { [old.keyid]: old.key }, roles: { root: role(old.keyid),
      timestamp: role(old.keyid), snapshot: role(old.keyid),
      targets: role(old.keyid) } }, [old]);
  const finalRootBytes = envelope({ _type: "root", spec_version: "1.0",
    version: 2, expires, consistent_snapshot: false,
    keys: { [current.keyid]: current.key }, roles: { root: role(current.keyid),
      timestamp: role(current.keyid), snapshot: role(current.keyid),
      targets: role(current.keyid) } }, [old, current]);
  const signingConfigBytes = Buffer.from(JSON.stringify({
    mediaType: "application/vnd.dev.sigstore.signingconfig.v0.2+json",
    caUrls: [], oidcUrls: [], tsaUrls: [], tsaConfig: { selector: "ANY" },
    rekorTlogUrls: [{ url: ORIGIN, majorApiVersion: 2,
      validFor: { start: "2026-01-01T00:00:00Z" }, operator: "fixture.test" }],
    rekorTlogConfig: { selector: "ANY" },
  }));
  const trustedRootBytes = Buffer.from(JSON.stringify({
    mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
    tlogs: [{ baseUrl: ORIGIN, hashAlgorithm: "SHA2_256",
      publicKey: { rawBytes: logDer.toString("base64"),
        keyDetails: "PKIX_ED25519",
        validFor: { start: "2025-01-01T00:00:00Z" } },
      logId: { keyId: checkpointId(logDer) } }],
    certificateAuthorities: [], ctlogs: [], timestampAuthorities: [],
  }));
  const targetsBytes = envelope({ _type: "targets", spec_version: "1.0",
    version: 7, expires, targets: {
      "signing_config_rekor_v2.v0.2.json": targetDesc(signingConfigBytes),
      "trusted_root.json": targetDesc(trustedRootBytes),
    } }, [current]);
  const snapshotBytes = envelope({ _type: "snapshot", spec_version: "1.0",
    version: 8, expires, meta: { "targets.json": desc(targetsBytes, 7) } }, [current]);
  const timestampBytes = envelope({ _type: "timestamp", spec_version: "1.0",
    version: 9, expires, meta: { "snapshot.json": desc(snapshotBytes, 8) } }, [current]);
  const selection = createRekorV2PinnedTufServiceSelectionV2({
    signingConfigTarget: { targetPath: "signing_config_rekor_v2.v0.2.json",
      expectedLength: signingConfigBytes.length,
      expectedSha256: rawSha(signingConfigBytes), bytes: signingConfigBytes },
    trustedRootTarget: { targetPath: "trusted_root.json",
      expectedLength: trustedRootBytes.length,
      expectedSha256: rawSha(trustedRootBytes), bytes: trustedRootBytes },
    selectedAt: END,
  });
  return { bootstrapRootBytes, rootDescendantBytes: [finalRootBytes],
    finalRootBytes, timestampBytes, snapshotBytes, targetsBytes,
    signingConfigBytes, trustedRootBytes, selection };
}

function temp(t) {
  const cachePath = realpathSync(mkdtempSync(path.join(tmpdir(), "tuf-v2-cache-")));
  t.after(() => rmSync(cachePath, { recursive: true, force: true }));
  return cachePath;
}

function seedCache(cachePath, data) {
  const repo = path.join(cachePath, "tuf-repo-cdn.sigstore.dev");
  mkdirSync(path.join(repo, "targets"), { recursive: true });
  writeFileSync(path.join(repo, "root.json"), data.finalRootBytes);
  writeFileSync(path.join(repo, "timestamp.json"), data.timestampBytes);
  writeFileSync(path.join(repo, "snapshot.json"), data.snapshotBytes);
  writeFileSync(path.join(repo, "targets.json"), data.targetsBytes);
  writeFileSync(path.join(repo, "targets", "signing_config_rekor_v2.v0.2.json"),
    data.signingConfigBytes);
  writeFileSync(path.join(repo, "targets", "trusted_root.json"), data.trustedRootBytes);
}

test("exact retained root/role/target bytes replay offline with no network state",
  async () => {
    const data = fixture();
    const replay = await replaySigstoreTufRekorV2RouteBytesV2({
      ...data, selectedAt: END,
    });
    assert.equal(replay.bootstrapRoot.version, 1);
    assert.deepEqual(replay.rootDescendants.map((item) => item.version), [2]);
    assert.equal(replay.finalRoot.version, 2);
    assert.equal(replay.timestamp.version, 9);
    assert.equal(replay.snapshot.version, 8);
    assert.equal(replay.targets.version, 7);
    assert.equal(replay.bootstrapRootSelfThresholdVerified, true);
    assert.equal(replay.everyRootDescendantOldAndNewThresholdVerified, true);
    assert.equal(replay.snapshotBytesBoundByTimestampAndRoleSignatureVerified, true);
    assert.equal(replay.targetsBytesBoundBySnapshotAndRoleSignatureVerified, true);
    assert.equal(replay.requiredTargetLengthAndHashesVerified, true);
    assert.equal(replay.networkIoPerformed, false);
    assert.equal(replay.authority, "NONE");
    assert.equal(replay.decisionState, "HOLD");
  });

test("injected acquisition exercises fresh-cache capture but cannot mint production report",
  async (t) => {
    const data = fixture();
    const cachePath = temp(t);
    let clock = 0;
    const calls = [];
    const handle = await acquireSigstoreTufRekorV2RouteV2({
      cachePath, timeoutMs: 20_000, occurrenceNonceHash: h("occurrence"),
    }, {
      bootstrapRootBytes: data.bootstrapRootBytes,
      clock: () => clock++ === 0 ? START : END,
      async initTUFImpl(options) {
        calls.push(options);
        seedCache(cachePath, data);
        return { async getTarget(name) {
          if (name === "signing_config_rekor_v2.v0.2.json") {
            return data.signingConfigBytes.toString("utf8");
          }
          if (name === "trusted_root.json") return data.trustedRootBytes.toString("utf8");
          throw new Error("unexpected target");
        } };
      },
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].retry, { retries: 0 });
    assert.equal(calls[0].forceInit, true);
    assert.equal(handle.projection.retainedBytesOfflineReplayVerified, true);
    assert.equal(handle.projection.productionRunnerCompatibleReportEstablished, false);
    assert.equal(handle.verifiedSelectionReport, null);
    assert.equal(handle.projection.lineage.supersedesV1ManifestHash,
      "sha256:446cb07e84b8c78466e396d692d5810b21b766a1fff706a5d85090fa4589ca42");
    assert.equal(handle.projection.rekorPostPerformed, false);
    assert.throws(() => publishSigstoreTufRekorV2RouteArtifactsV2(handle, {}),
      /PRODUCTION_REPLAYED_ACQUISITION_HANDLE_REQUIRED/u);
  });

test("tampering retained target bytes or skipping a root fails offline replay",
  async () => {
    const data = fixture();
    const targetTampered = { ...data,
      signingConfigBytes: Buffer.from(data.signingConfigBytes) };
    targetTampered.signingConfigBytes[10] ^= 1;
    await assert.rejects(() => replaySigstoreTufRekorV2RouteBytesV2({
      ...targetTampered, selectedAt: END,
    }), /OFFLINE_TUF_ROLE_CHAIN_REPLAY_FAILED/u);
    await assert.rejects(() => replaySigstoreTufRekorV2RouteBytesV2({
      ...data, rootDescendantBytes: [], selectedAt: END,
    }), /FINAL_ROOT_NOT_EXACT_LAST_REPLAYED_ROOT/u);
  });

test("tampering root rotation signatures fails the old/new threshold replay",
  async () => {
    const data = fixture();
    const parsed = JSON.parse(data.finalRootBytes.toString("utf8"));
    parsed.signatures[0].sig = `${parsed.signatures[0].sig.slice(0, -2)}00`;
    const badRoot = Buffer.from(JSON.stringify(parsed));
    await assert.rejects(() => replaySigstoreTufRekorV2RouteBytesV2({
      ...data, rootDescendantBytes: [badRoot], finalRootBytes: badRoot,
      selectedAt: END,
    }), /OFFLINE_TUF_ROLE_CHAIN_REPLAY_FAILED/u);
  });

