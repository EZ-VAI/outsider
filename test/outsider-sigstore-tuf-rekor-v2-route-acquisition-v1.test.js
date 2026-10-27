import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_BOUNDARY,
  acquireSigstoreTufRekorV2RouteV1,
  getSigstoreTufRekorV2RoutePrivateMaterialV1,
  publishSigstoreTufRekorV2RouteArtifactsV1,
} from "../src/outsider-sigstore-tuf-rekor-v2-route-acquisition-v1.js";

const STARTED = "2026-09-03T22:00:00.000Z";
const SELECTED = "2026-09-03T22:00:01.000Z";
const V2_ORIGIN = "https://log2025-1.rekor.sigstore.dev";
const V1_ORIGIN = "https://rekor.sigstore.dev";

function checkpointId(origin, der) {
  return createHash("sha256").update(Buffer.concat([
    Buffer.from(`${new URL(origin).host}\n`, "utf8"),
    Buffer.from([1]),
    der.subarray(12),
  ])).digest();
}

function fixture(overrides = {}) {
  const log = generateKeyPairSync("ed25519");
  const der = log.publicKey.export({ type: "spki", format: "der" });
  const signing = {
    mediaType: "application/vnd.dev.sigstore.signingconfig.v0.2+json",
    caUrls: [],
    oidcUrls: [],
    rekorTlogUrls: [
      { url: V2_ORIGIN, majorApiVersion: 2,
        validFor: { start: "2026-01-01T00:00:00Z" }, operator: "sigstore.dev" },
      { url: V1_ORIGIN, majorApiVersion: 1,
        validFor: { start: "2021-01-12T11:53:27Z" }, operator: "sigstore.dev" },
    ],
    tsaUrls: [],
    rekorTlogConfig: { selector: "ANY" },
    tsaConfig: { selector: "ANY" },
  };
  const trusted = {
    mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1",
    tlogs: [
      { baseUrl: V1_ORIGIN, hashAlgorithm: "SHA2_256",
        publicKey: { rawBytes: "legacy-not-selected", keyDetails: "legacy",
          validFor: { start: "2021-01-01T00:00:00Z" } },
        logId: { keyId: "legacy-not-selected" } },
      { baseUrl: V2_ORIGIN, hashAlgorithm: "SHA2_256",
        publicKey: { rawBytes: der.toString("base64"), keyDetails: "PKIX_ED25519",
          validFor: { start: "2025-09-23T00:00:00Z" } },
        logId: { keyId: checkpointId(V2_ORIGIN, der).toString("base64") } },
    ],
    certificateAuthorities: [], ctlogs: [], timestampAuthorities: [],
  };
  overrides.mutateSigning?.(signing);
  overrides.mutateTrusted?.(trusted, der);
  return {
    signingText: `${JSON.stringify(signing)}\n`,
    trustedText: `${JSON.stringify(trusted)}\n`,
    der,
  };
}

function setup(t) {
  const cachePath = realpathSync(mkdtempSync(
    path.join(tmpdir(), "outsider-tuf-cache-")));
  const artifactRoot = realpathSync(mkdtempSync(
    path.join(tmpdir(), "outsider-tuf-artifacts-")));
  t.after(() => {
    rmSync(cachePath, { recursive: true, force: true });
    rmSync(artifactRoot, { recursive: true, force: true });
  });
  return { cachePath, artifactRoot };
}

function injected(fixtureValue, observations = {}) {
  let tick = 0;
  observations.initCalls = 0;
  observations.targets = [];
  return {
    clock() { return tick++ === 0 ? STARTED : SELECTED; },
    async initTUFImpl(options) {
      observations.initCalls += 1;
      observations.options = options;
      return {
        async getTarget(name) {
          observations.targets.push(name);
          if (name === "signing_config_rekor_v2.v0.2.json") {
            return fixtureValue.signingText;
          }
          if (name === "trusted_root.json") return fixtureValue.trustedText;
          throw new Error("unexpected target");
        },
      };
    },
  };
}

test("authenticated target bridge selects current v2 route and remains HOLD/NONE",
  async (t) => {
    const dirs = setup(t);
    const data = fixture();
    const observations = {};
    const handle = await acquireSigstoreTufRekorV2RouteV1({
      cachePath: dirs.cachePath, timeoutMs: 20_000,
    }, injected(data, observations));
    const projection = handle.projection;

    assert.equal(observations.initCalls, 1);
    assert.deepEqual(observations.options, {
      mirrorURL: "https://tuf-repo-cdn.sigstore.dev",
      cachePath: dirs.cachePath,
      retry: { retries: 0 }, timeout: 20_000,
      forceCache: false, forceInit: false,
    });
    assert.deepEqual(observations.targets,
      ["signing_config_rekor_v2.v0.2.json", "trusted_root.json"]);
    assert.equal(projection.route.origin, V2_ORIGIN);
    assert.equal(projection.route.createEntryUrl,
      `${V2_ORIGIN}/api/v2/log/entries`);
    assert.equal(projection.route.majorApiVersion, 2);
    assert.equal(projection.route.signingConfigListIndex, 0);
    assert.equal(projection.trust.logIdMatchesFullC2spCheckpointKeyId, true);
    assert.equal(projection.trust.logIdKeyIdBase64,
      checkpointId(V2_ORIGIN, data.der).toString("base64"));
    assert.equal(projection.trust.publicKeyDerHash,
      `sha256:${createHash("sha256").update(data.der).digest("hex")}`);
    assert.equal(projection.rekorPostPerformed, false);
    assert.equal(projection.paymentPerformed, false);
    assert.equal(projection.authority, "NONE");
    assert.equal(projection.capacityReserved, false);
    assert.equal(projection.outcomeTruthEstablished, false);
    assert.equal(projection.decisionState, "HOLD");
    const publicJson = JSON.stringify(projection);
    assert.equal(publicJson.includes(data.der.toString("base64")), false);
    assert.equal(publicJson.includes(dirs.cachePath), false);

    const material = getSigstoreTufRekorV2RoutePrivateMaterialV1(handle);
    assert.equal(material.signingConfigTarget.bytes.toString("utf8"), data.signingText);
    assert.equal(material.trustedRootTarget.bytes.toString("utf8"), data.trustedText);
    assert.equal(material.transportSelection.selectedService.origin, V2_ORIGIN);
    assert.equal(material.transportSelection.selectionHash,
      projection.transportSelectionHash);
    assert.equal(handle.verifiedSelectionReport.schema,
      "outsider/rekor-v2-production-tuf-selection-verification/v1");
    assert.equal(handle.verifiedSelectionReport.ok, true);
    assert.equal(handle.verifiedSelectionReport.tufRoleChainCryptographicallyVerified,
      true);
    assert.equal(handle.verifiedSelectionReport.selectionHash,
      material.transportSelection.selectionHash);
    assert.equal(handle.verifiedSelectionReport.tufRoleChainVerificationHash,
      projection.tufRoleChainVerificationHash);
    assert.equal(handle.verifiedSelectionReport.signingConfigTargetPath,
      material.transportSelection.signingConfigTarget.targetPath);
    assert.equal(handle.verifiedSelectionReport.signingConfigTargetHash,
      material.transportSelection.signingConfigTarget.sha256);
    assert.equal(handle.verifiedSelectionReport.signingConfigTargetLength,
      material.transportSelection.signingConfigTarget.length);
    assert.equal(handle.verifiedSelectionReport.trustedRootTargetPath,
      material.transportSelection.trustedRootTarget.targetPath);
    assert.equal(handle.verifiedSelectionReport.trustedRootTargetHash,
      material.transportSelection.trustedRootTarget.sha256);
    assert.equal(handle.verifiedSelectionReport.trustedRootTargetLength,
      material.transportSelection.trustedRootTarget.length);
  });

test("private artifact publication preserves exact bytes with 0600 files and 0700 directory",
  async (t) => {
    const dirs = setup(t);
    const data = fixture();
    const handle = await acquireSigstoreTufRekorV2RouteV1({
      cachePath: dirs.cachePath, timeoutMs: 25_000,
    }, injected(data));
    const outputDirectory = path.join(dirs.artifactRoot, "route-v1");
    const published = publishSigstoreTufRekorV2RouteArtifactsV1(handle, {
      trustedRoot: dirs.artifactRoot, outputDirectory,
    });
    assert.equal(Number(lstatSync(outputDirectory, { bigint: true }).mode & 0o777n),
      0o700);
    for (const name of ["signing_config_rekor_v2.v0.2.json", "trusted_root.json",
      "rekor-v2-route-selection.json", "privacy-safe-route-projection.json",
      "verified-tuf-selection-report.json", "manifest.json"]) {
      assert.equal(Number(lstatSync(path.join(outputDirectory, name), { bigint: true })
        .mode & 0o777n), 0o600);
    }
    assert.equal(readFileSync(path.join(outputDirectory,
      "signing_config_rekor_v2.v0.2.json"), "utf8"), data.signingText);
    assert.equal(readFileSync(path.join(outputDirectory, "trusted_root.json"), "utf8"),
      data.trustedText);
    assert.equal(published.manifest.acquisitionHash, handle.projection.acquisitionHash);
    assert.equal(published.manifest.files.length, 5);
    assert.throws(() => publishSigstoreTufRekorV2RouteArtifactsV1(handle, {
      trustedRoot: dirs.artifactRoot, outputDirectory,
    }), /OUTPUT_DIRECTORY_ALREADY_EXISTS/u);
  });

test("tampered TrustedRoot logId cannot be detached from origin and Ed25519 key",
  async (t) => {
    const dirs = setup(t);
    const data = fixture({ mutateTrusted(root) {
      root.tlogs[1].logId.keyId = Buffer.alloc(32, 7).toString("base64");
    } });
    await assert.rejects(() => acquireSigstoreTufRekorV2RouteV1({
      cachePath: dirs.cachePath, timeoutMs: 20_000,
    }, injected(data)), /(?:LOG_ID_C2SP_KEY_BINDING_INVALID|CHECKPOINT_KEY_ID_DERIVATION_MISMATCH)/u);
  });

test("future or unsupported selector changes fail closed without choosing a route",
  async (t) => {
    const dirs = setup(t);
    const data = fixture({ mutateSigning(config) {
      config.rekorTlogConfig = { selector: "EXACT", count: 1 };
    } });
    await assert.rejects(() => acquireSigstoreTufRekorV2RouteV1({
      cachePath: dirs.cachePath, timeoutMs: 20_000,
    }, injected(data)), /(?:SIGNING_CONFIG_SELECTOR_UNSUPPORTED|SIGNING_CONFIG_PROFILE_UNSUPPORTED)/u);
  });

test("inactive v2 and sub-20-second timeout both fail closed", async (t) => {
  const dirs = setup(t);
  const inactive = fixture({ mutateSigning(config) {
    config.rekorTlogUrls[0].validFor.start = "2027-01-01T00:00:00Z";
  } });
  await assert.rejects(() => acquireSigstoreTufRekorV2RouteV1({
    cachePath: dirs.cachePath, timeoutMs: 20_000,
  }, injected(inactive)), /NO_ACTIVE_SUPPORTED_REKOR_V2_SERVICE/u);
  await assert.rejects(() => acquireSigstoreTufRekorV2RouteV1({
    cachePath: dirs.cachePath, timeoutMs: 19_999,
  }, injected(fixture())), /TIMEOUT_INVALID/u);
});

test("a target failure is surfaced after one call with no application retry", async (t) => {
  const dirs = setup(t);
  let initCalls = 0;
  let targetCalls = 0;
  await assert.rejects(() => acquireSigstoreTufRekorV2RouteV1({
    cachePath: dirs.cachePath, timeoutMs: 20_000,
  }, {
    clock: () => STARTED,
    async initTUFImpl(options) {
      initCalls += 1;
      assert.deepEqual(options.retry, { retries: 0 });
      return { async getTarget() { targetCalls += 1; throw new Error("offline"); } };
    },
  }), /TARGET_ACQUISITION_FAILED_NO_RETRY/u);
  assert.equal(initCalls, 1);
  assert.equal(targetCalls, 1);
  assert.equal(OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V1_BOUNDARY
    .rekorPostPermitted, false);
});
