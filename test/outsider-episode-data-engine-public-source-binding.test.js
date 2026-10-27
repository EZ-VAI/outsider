import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA,
  EPISODE_DATA_ENGINE_SCHEMA,
  buildEpisodeDataEngineRunReceipt,
} from "../src/outsider-episode-data-engine.js";
import {
  EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA,
  EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BUNDLE_SCHEMA,
  EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ENVELOPE_SCHEMA,
  EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES,
  EPISODE_DATA_ENGINE_PUBLIC_SOURCE_PUBLICATION_SCHEMA,
  episodeDataEnginePublicSourceBindingDigest,
  publishEpisodeDataEnginePublicSourceArtifactFromSource,
  serializeEpisodeDataEnginePublicSourceBindingReceipt,
  serializeEpisodeDataEnginePublicSourceEnvelope,
  verifyEpisodeDataEnginePublicSourceArtifactDirectory,
  verifyEpisodeDataEnginePublicSourceArtifactDirectoryStructure,
  verifyEpisodeDataEnginePublicSourceBundleStructure,
  verifyEpisodeDataEnginePublicSourceEnvelope,
  verifyEpisodeDataEnginePublicSourcePublicationFiles,
} from "../src/outsider-episode-data-engine-public-source-binding.js";
import {
  EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA,
  EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS,
} from "../src/outsider-episode-data-public-source-catalog.js";
import {
  EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
} from "../src/outsider-episode-data-public-source-profile.js";
import {
  EPISODE_DATA_SEGMENTS,
  EPISODE_DATA_SOURCE_LEDGER_SCHEMA,
} from "../src/outsider-episode-data-source-ledger.js";

const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..",
);
const ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/public-agent-corpus-20260820/", import.meta.url,
));
const SOURCE_DIRECTORY = `${ARTIFACT_DIRECTORY}source`;
const BASELINE_REPORT_PATH =
  `${ARTIFACT_DIRECTORY}baseline-v3-provenance-final/report.json`;
const CUA_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/cua-verifier-bench-20260828/", import.meta.url,
));
const REBOOT_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-reboot-recovery-pilot-20260828-v1/", import.meta.url,
));
const REBOOT_SOURCE_DIRECTORY = `${REBOOT_ARTIFACT_DIRECTORY}source`;
const SENTINEL_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-agent-trajectory-sentinel-quarantine-20260829-v2/",
  import.meta.url,
));
const SENTINEL_V1_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-agent-trajectory-sentinel-quarantine-20260828-v1/",
  import.meta.url,
));
const STALE_CONSTRAINT_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-stale-constraint-episodes-20260828-v2/", import.meta.url,
));
const STALE_CONSTRAINT_V1_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-stale-constraint-episodes-20260828-v1/", import.meta.url,
));

const INPUT = Object.freeze({
  sourceDirectory: SOURCE_DIRECTORY,
  artifactDirectory: ARTIFACT_DIRECTORY,
  cuaArtifactDirectory: CUA_ARTIFACT_DIRECTORY,
  rebootArtifactDirectory: REBOOT_ARTIFACT_DIRECTORY,
  rebootSourceDirectory: REBOOT_SOURCE_DIRECTORY,
  sentinelArtifactDirectory: SENTINEL_ARTIFACT_DIRECTORY,
  staleConstraintArtifactDirectory: STALE_CONSTRAINT_ARTIFACT_DIRECTORY,
  publicSourceWorkspaceRoot: WORKSPACE_ROOT,
});

const SOURCE_READY = [
  `${ARTIFACT_DIRECTORY}acquisition-manifest.json`,
  `${SOURCE_DIRECTORY}/computer-agent-arena/agent_arena_data.jsonl`,
  `${SOURCE_DIRECTORY}/syfi_coding_trace.jsonl.gz`,
  `${SOURCE_DIRECTORY}/openhands-feedback.rows-000-099.json`,
  `${SOURCE_DIRECTORY}/nebius-stratified-selection.json`,
  BASELINE_REPORT_PATH,
  `${CUA_ARTIFACT_DIRECTORY}source-manifest.json`,
  `${CUA_ARTIFACT_DIRECTORY}source/trajectories.rows-000-099.json`,
  `${REBOOT_ARTIFACT_DIRECTORY}report.json`,
  `${REBOOT_SOURCE_DIRECTORY}/acquisition-manifest.json`,
  `${SENTINEL_ARTIFACT_DIRECTORY}run-receipt.json`,
  `${SENTINEL_ARTIFACT_DIRECTORY}source/raw/source/manifest.json`,
  `${SENTINEL_V1_ARTIFACT_DIRECTORY}REJECTED-SUPERSEDED.json`,
  `${STALE_CONSTRAINT_ARTIFACT_DIRECTORY}archive-index.json`,
  `${STALE_CONSTRAINT_ARTIFACT_DIRECTORY}source/paper2-data-and-code-v2.zip`,
  `${STALE_CONSTRAINT_V1_ARTIFACT_DIRECTORY}SUPERSEDED-REJECTED.json`,
  path.join(WORKSPACE_ROOT, "artifacts",
    "outsider-hf-robot-intervention-declared-scope-ledger-20260830-v1",
    "report.json"),
  path.join(WORKSPACE_ROOT, "artifacts",
    "outsider-hiesh-sequence-recovery-metadata-only-20260830-v1",
    "report.json"),
  path.join(WORKSPACE_ROOT, "artifacts",
    "outsider-ajay-dagger-interventions-no-video-20260830-v1",
    "report.json"),
].every(existsSync);

const HASH = /^sha256:[a-f0-9]{64}$/u;

function fileSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function prettyBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fakePublication(root, basename, label, transplantedReceipt = null,
  payloadOverrides = {}) {
  const directory = path.join(root, basename);
  mkdirSync(directory, { mode: 0o700 });
  const roles = [
    "engineReport", "engineRunReceipt", "publicSourceCatalog",
    "bindingEnvelope", "bindingReceipt",
  ];
  const serializations = {
    engineReport: "PRETTY_JSON_2_SPACE_LF",
    engineRunReceipt: "PRETTY_JSON_2_SPACE_LF",
    publicSourceCatalog: "CANONICAL_JSON_LF",
    bindingEnvelope: "CANONICAL_JSON_LF",
  };
  const payloadValue = (role) => ({ coherentResealLabel: label, role });
  const payloads = {
    engineReport: prettyBytes(payloadValue("engineReport")),
    engineRunReceipt: prettyBytes(payloadValue("engineRunReceipt")),
    publicSourceCatalog: canonicalBytes(payloadValue("publicSourceCatalog")),
    bindingEnvelope: canonicalBytes(payloadValue("bindingEnvelope")),
    ...payloadOverrides,
  };
  const publication = {
    schema: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_PUBLICATION_SCHEMA,
    expectedDirectoryMode: "0700",
    expectedFileMode: "0600",
    exactFileSetRequired: true,
    extraFilesAllowed: false,
    symlinksAllowed: false,
    noClobber: true,
    expectedFileCount: 5,
    publicationOrder: roles.map((role) =>
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]),
    receiptFileName: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.bindingReceipt,
    receiptWrittenLast: true,
    receiptFileSelfHashEmbedded: false,
    files: roles.map((role) => role === "bindingReceipt" ? {
      role,
      fileName: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role],
      serialization: "CANONICAL_JSON_LF",
      sizeBytes: null,
      sha256: null,
      fileHashBoundByBindingReceipt: false,
    } : {
      role,
      fileName: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role],
      serialization: serializations[role],
      sizeBytes: payloads[role].length,
      sha256: fileSha256(payloads[role]),
      fileHashBoundByBindingReceipt: true,
    }),
  };
  const receiptBody = {
    schema: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA,
    schemaVersion: "1.0.0",
    publication,
    receiptWrittenLastRequiredForPublication: true,
  };
  const receipt = {
    ...receiptBody,
    receiptHash: episodeDataEnginePublicSourceBindingDigest(receiptBody,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA),
  };
  for (const role of roles.slice(0, -1)) {
    writeFileSync(path.join(directory,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]), payloads[role], {
      flag: "wx", mode: 0o600,
    });
  }
  const receiptBytes = transplantedReceipt
    ?? serializeEpisodeDataEnginePublicSourceBindingReceipt(receipt);
  writeFileSync(path.join(directory,
    EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.bindingReceipt), receiptBytes, {
    flag: "wx", mode: 0o600,
  });
  return { directory, payloads, receipt, receiptBytes:
    serializeEpisodeDataEnginePublicSourceBindingReceipt(receipt) };
}

test("source-free publication checks keep byte binding below source trust and reject file-boundary attacks",
  () => {
    const root = mkdtempSync(path.join(os.tmpdir(),
      "outsider-engine-public-source-structural-"));
    chmodSync(root, 0o700);
    try {
      const original = fakePublication(root, "original", "original");
      const resealed = fakePublication(root, "coherently-resealed", "changed");
      for (const fixture of [original, resealed]) {
        const fileCheck =
          verifyEpisodeDataEnginePublicSourcePublicationFiles(
            fixture.directory);
        assert.equal(fileCheck.ok, true);
        assert.equal(fileCheck.receiptToActualFileByteBindingEstablished, true);
        assert.equal(fileCheck.declaredPayloadSerializationEstablished, true);
        assert.equal(fileCheck.completeBindingReceiptStructureEstablished,
          false);
        assert.equal(fileCheck.sourceReplayEstablished, false);
        assert.equal(fileCheck.receiptTimestampOrderingEstablished, true);
        assert.equal(fileCheck.exactFileSetEstablished, true);
        assert.equal(fileCheck.actualFiles.length, 5);
        assert.match(fileCheck.actualFileSetHash, HASH);
        const bundleCheck =
          verifyEpisodeDataEnginePublicSourceArtifactDirectoryStructure(
            fixture.directory);
        assert.equal(bundleCheck.ok, false);
        assert.equal(bundleCheck.sourceReplayEstablished, false);
      }

      const transplanted = fakePublication(root, "transplanted", "different",
        original.receiptBytes);
      const transplantCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          transplanted.directory);
      assert.equal(transplantCheck.ok, false);
      assert.match(transplantCheck.error,
        /PUBLICATION_ACTUAL_FILE_HASH_MISMATCH/u);

      const extra = fakePublication(root, "extra", "extra");
      writeFileSync(path.join(extra.directory, "unreceipted-extra.json"), "{}\n",
        { flag: "wx", mode: 0o600 });
      const extraCheck = verifyEpisodeDataEnginePublicSourcePublicationFiles(
        extra.directory);
      assert.equal(extraCheck.ok, false);
      assert.match(extraCheck.error, /PUBLICATION_EXACT_FILE_SET_INVALID/u);

      const symlinked = fakePublication(root, "symlinked", "symlinked");
      const victim = path.join(root, "victim.json");
      writeFileSync(victim, symlinked.payloads.engineReport,
        { flag: "wx", mode: 0o600 });
      const engineReportPath = path.join(symlinked.directory,
        EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.engineReport);
      unlinkSync(engineReportPath);
      symlinkSync(victim, engineReportPath);
      const symlinkCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          symlinked.directory);
      assert.equal(symlinkCheck.ok, false);
      assert.match(symlinkCheck.error,
        /PUBLICATION_EXACT_FILE_SET_INVALID/u);

      const hardlinked = fakePublication(root, "hardlinked", "hardlinked");
      linkSync(path.join(hardlinked.directory,
        EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.engineReport),
      path.join(root, "hardlink-alias.json"));
      const hardlinkCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          hardlinked.directory);
      assert.equal(hardlinkCheck.ok, false);
      assert.match(hardlinkCheck.error, /PUBLICATION_FILE_INVALID/u);

      const publicFile = fakePublication(root, "public-file", "public-file");
      chmodSync(path.join(publicFile.directory,
        EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.engineReport), 0o644);
      const publicFileCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          publicFile.directory);
      assert.equal(publicFileCheck.ok, false);
      assert.match(publicFileCheck.error, /PUBLICATION_FILE_INVALID/u);

      const publicDirectory = fakePublication(root, "public-directory",
        "public-directory");
      chmodSync(publicDirectory.directory, 0o755);
      const publicDirectoryCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          publicDirectory.directory);
      assert.equal(publicDirectoryCheck.ok, false);
      assert.match(publicDirectoryCheck.error, /PUBLICATION_DIRECTORY_INVALID/u);

      const specialDirectory = fakePublication(root, "special-directory",
        "special-directory");
      chmodSync(specialDirectory.directory, 0o1700);
      const specialDirectoryCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          specialDirectory.directory);
      assert.equal(specialDirectoryCheck.ok, false);
      assert.match(specialDirectoryCheck.error,
        /PUBLICATION_DIRECTORY_INVALID/u);

      const noncanonicalValue = {
        coherentResealLabel: "noncanonical", role: "publicSourceCatalog",
      };
      const noncanonical = fakePublication(root, "noncanonical",
        "noncanonical", null, {
          publicSourceCatalog: prettyBytes(noncanonicalValue),
        });
      const noncanonicalCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          noncanonical.directory);
      assert.equal(noncanonicalCheck.ok, false);
      assert.match(noncanonicalCheck.error,
        /PUBLICATION_DECLARED_SERIALIZATION_MISMATCH/u);

      const reverseTimestamp = fakePublication(root, "reverse-timestamp",
        "reverse-timestamp");
      const future = new Date(Date.now() + 60_000);
      utimesSync(path.join(reverseTimestamp.directory,
        EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.engineReport), future, future);
      const reverseTimestampCheck =
        verifyEpisodeDataEnginePublicSourcePublicationFiles(
          reverseTimestamp.directory);
      assert.equal(reverseTimestampCheck.ok, false);
      assert.match(reverseTimestampCheck.error,
        /PUBLICATION_RECEIPT_TIMESTAMP_OLDER_THAN_PAYLOAD/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("isolated binding source-replays immutable v4 and frozen public profile without cross-addition",
  { skip: !SOURCE_READY, timeout: 900_000 }, async (t) => {
    const privateRoot = mkdtempSync(path.join(os.tmpdir(),
      "outsider-engine-public-source-integration-"));
    chmodSync(privateRoot, 0o700);
    t.after(() => rmSync(privateRoot, { recursive: true, force: true }));
    const outputDirectory = path.join(privateRoot, "bound-artifact");
    const published = await
      publishEpisodeDataEnginePublicSourceArtifactFromSource({
        ...INPUT,
        trustedRoot: privateRoot,
        outputDirectory,
      });
    const { bundle } = published;

    assert.equal(lstatSync(outputDirectory).mode & 0o7777, 0o700);
    assert.deepEqual(readdirSync(outputDirectory).sort(),
      Object.values(EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES).sort());
    assert.equal(Object.values(EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES).every(
      (fileName) => (lstatSync(path.join(outputDirectory, fileName)).mode
        & 0o7777) === 0o600), true);
    assert.equal(published.actualFiles.length, 5);
    assert.match(published.receiptFileSha256, HASH);
    assert.match(published.actualFileSetHash, HASH);
    assert.equal(published.receiptWrittenLastEstablished, true);
    assert.equal(published.receiptTimestampOrderingEstablished, true);
    for (const file of published.actualFiles) {
      assert.equal(file.sha256, fileSha256(readFileSync(path.join(
        outputDirectory, file.fileName))));
    }
    await assert.rejects(
      publishEpisodeDataEnginePublicSourceArtifactFromSource({
        ...INPUT,
        trustedRoot: privateRoot,
        outputDirectory,
      }),
      /PUBLICATION_OUTPUT_DIRECTORY_EXISTS/u,
    );

    assert.equal(bundle.schema,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BUNDLE_SCHEMA);
    assert.equal(bundle.envelope.schema,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ENVELOPE_SCHEMA);
    assert.equal(bundle.receipt.schema,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA);
    assert.equal(bundle.engineReport.schema, EPISODE_DATA_ENGINE_SCHEMA);
    assert.equal(bundle.engineReport.schemaVersion, "4.0.0");
    assert.equal(bundle.engineRunReceipt.schema,
      EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA);
    assert.equal(bundle.publicSourceCatalog.schema,
      EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA);

    // The bridge carries the exact legacy products; it does not fork or
    // decorate the v4 report/receipt schemas.
    assert.equal(canonicalizeStrict(bundle.engineRunReceipt),
      canonicalizeStrict(buildEpisodeDataEngineRunReceipt(
        bundle.engineReport)));
    assert.equal(Object.hasOwn(bundle.engineReport, "publicSourceCatalog"), false);
    assert.equal(Object.hasOwn(bundle.engineReport, "coverageBridge"), false);
    assert.equal(Object.hasOwn(bundle.engineRunReceipt, "publicSourceCatalog"),
      false);
    assert.equal(bundle.engineReport.sourceLedger.schema,
      EPISODE_DATA_SOURCE_LEDGER_SCHEMA);
    assert.equal(bundle.engineReport.sourceLedger.sources.length, 8);
    assert.equal(bundle.engineReport.runSummary.sourceRecordsReplayed, 9_547);
    assert.equal(bundle.engineReport.runSummary
      .offlineModelFitsPerformedInEngine, 4);
    assert.equal(bundle.engineReport.runSummary
      .offlineModelFitsReplayedFromVerifiedSupplements, 6);
    assert.equal(bundle.engineReport.runSummary.authorizedTrainingRows, 0);
    assert.equal(bundle.engineReport.runSummary.productionModelsPromoted, 0);
    assert.equal(EPISODE_DATA_SEGMENTS.includes("intervention"), false);

    const { envelope, publicSourceCatalog: catalog, receipt } = bundle;
    assert.equal(envelope.engine.reportHash, bundle.engineReport.reportHash);
    assert.equal(envelope.engine.runReceiptHash,
      bundle.engineRunReceipt.receiptHash);
    assert.equal(envelope.engine.sourceLedgerHash,
      bundle.engineReport.sourceLedger.ledgerHash);
    assert.equal(envelope.engine.legacyUnifiedSourceSetHash,
      bundle.engineReport.sourceTrust.unifiedSourceSetHash);
    assert.equal(receipt.engineReportHash, bundle.engineReport.reportHash);
    assert.equal(receipt.engineRunReceiptHash,
      bundle.engineRunReceipt.receiptHash);
    assert.equal(receipt.sourceLedgerHash,
      bundle.engineReport.sourceLedger.ledgerHash);
    assert.equal(receipt.legacyUnifiedSourceSetHash,
      bundle.engineReport.sourceTrust.unifiedSourceSetHash);

    // Frozen-profile values are deliberately explicit so profile additions
    // require a reviewed assertion update rather than silently widening scope.
    assert.equal(EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
      "outsider/episode-data-public-source-profile/2026-08-30-intervention-v4");
    assert.equal(catalog.sourceSummary.sourceCount, 11);
    assert.equal(catalog.sourceSummary.nonDuplicateLedgerEntryCount, 10);
    assert.equal(catalog.sourceSummary.lineageDuplicateSourceCount, 1);
    assert.equal(catalog.populationRegistry.entryCount, 40);
    assert.equal(catalog.discovery.scopeCount, 5);
    // Historical source bytes are unchanged. The HIESH verifier now imports
    // the separately bounded historical serializer, so its code receipt changes.
    assert.equal(catalog.catalogHash,
      "sha256:62fda2e058366c53c9adc6a21c27c94b0d5883f14ccd7a3fcee47486fd5a8af3");
    assert.equal(envelope.publicSourceProfile.profileId,
      EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID);
    assert.equal(envelope.publicSourceProfile.catalogHash,
      catalog.catalogHash);
    assert.equal(receipt.catalogHash, catalog.catalogHash);
    assert.equal(envelope.publicSourceProfile.sourceCount,
      catalog.sourceSummary.sourceCount);
    assert.equal(envelope.publicSourceProfile.populationEntryCount,
      catalog.populationRegistry.entryCount);
    assert.equal(envelope.publicSourceProfile.discoveryScopeCount,
      catalog.discovery.scopeCount);
    assert.equal(envelope.publicSourceProfile.sourceUniverseExhausted, false);
    assert.equal(envelope.publicSourceProfile.globalExhaustion, false);
    assert.equal(envelope.publicSourceProfile
      .genericCatalogVerificationEstablishesSourceReplay, false);
    assert.equal(envelope.publicSourceProfile
      .fixedProfileWorkspaceRebuildRequired, true);
    assert.equal(envelope.publicSourceProfile
      .allCatalogSourcesFullPayloadReplayEstablished, false);
    assert.deepEqual(envelope.publicSourceProfile.metadataOnlySourceIds,
      ["agentlens-metadata-disposition",
        "hiesh-sequence-recovery-metadata-only"]);

    const catalogSourceIds = catalog.sources.map((source) => source.sourceId)
      .sort();
    assert.deepEqual(envelope.publicSourceProfile
      .sourceVerificationReceiptSet.map((entry) => entry.sourceId).sort(),
    catalogSourceIds);
    assert.equal(envelope.publicSourceProfile.sourceVerificationReceiptSet
      .every((entry) =>
        entry.receipt.attestationStructurallyAccepted === true
        && entry.receipt.attestationTrustBoundary
          === "REQUIRES_FIXED_PROFILE_WORKSPACE_REBUILD"
        && !Object.hasOwn(entry.receipt, "verified")
        && !Object.hasOwn(entry.receipt, "sourceReplayEstablished")), true);
    assert.deepEqual(envelope.publicSourceProfile.sourceArtifactRootSet
      .map((entry) => entry.sourceId).sort(), catalogSourceIds);
    assert.deepEqual(envelope.publicSourceProfile.discoveryScopeSet,
      [...catalog.discovery.scopes].sort((left, right) =>
        left.scopeId.localeCompare(right.scopeId)));
    for (const field of [
      "sourceVerificationReceiptSetRoot", "sourceArtifactRootSetRoot",
      "discoveryScopeSetRoot", "catalogUseBoundaryHash",
      "profileImplementationHash", "catalogImplementationHash",
      "bindingImplementationHash", "canonicalImplementationHash",
      "privateArtifactPublicationImplementationHash",
    ]) assert.match(envelope.publicSourceProfile[field], HASH);
    for (const value of Object.values(envelope.implementationClosure)) {
      assert.match(value, HASH);
    }
    assert.equal(receipt.sourceVerificationReceiptSetRoot,
      envelope.publicSourceProfile.sourceVerificationReceiptSetRoot);
    assert.equal(receipt.sourceArtifactRootSetRoot,
      envelope.publicSourceProfile.sourceArtifactRootSetRoot);
    assert.equal(receipt.discoveryScopeSetRoot,
      envelope.publicSourceProfile.discoveryScopeSetRoot);
    assert.equal(receipt.catalogUseBoundaryHash,
      envelope.publicSourceProfile.catalogUseBoundaryHash);
    assert.equal(receipt.coverageBridgeHash,
      envelope.coverageBridge.coverageBridgeHash);
    assert.equal(receipt.implementationClosureHash,
      envelope.implementationClosure.implementationClosureHash);
    assert.equal(receipt.bindingHash, envelope.bindingHash);
    assert.equal(receipt.receiptWrittenLastRequiredForPublication, true);
    assert.equal(receipt.publication.schema,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_PUBLICATION_SCHEMA);
    assert.equal(receipt.publication.expectedFileCount, 5);
    assert.equal(receipt.publication.receiptWrittenLast, true);
    assert.equal(receipt.publication.noClobber, true);
    assert.equal(receipt.publication.extraFilesAllowed, false);
    assert.equal(receipt.publication.symlinksAllowed, false);
    assert.equal(receipt.publication.files.slice(0, -1).every((file) =>
      file.fileHashBoundByBindingReceipt === true), true);
    assert.equal(receipt.publication.files.at(-1)
      .fileHashBoundByBindingReceipt, false);

    assert.deepEqual(envelope.coverageBridge.segmentOrder,
      [...EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS]);
    assert.deepEqual(envelope.coverageBridge.catalogOnlySegments,
      ["intervention"]);
    assert.equal(envelope.coverageBridge.mode,
      "ADVISORY_SOURCE_ID_PRESENCE_ONLY");
    assert.equal(envelope.coverageBridge.crossCatalogAndLedgerAdditionPermitted,
      false);
    assert.equal(envelope.coverageBridge.crossSystemDisjointnessEstablished,
      false);
    assert.equal(envelope.coverageBridge.legacySourceLedgerMutation, false);
    assert.equal(envelope.coverageBridge.legacyGapTotalsMutation, false);
    assert.equal(envelope.coverageBridge.automaticControlPlaneProjection, false);
    assert.equal(envelope.coverageBridge
      .catalogCompleteEpisodeIntersectionCount, 0);
    assert.equal(envelope.coverageBridge
      .catalogCompleteEpisodeIntersectionEstablished, false);
    assert.equal(Object.values(envelope.coverageBridge.segments).every(
      (segment) => segment.catalogSourceNativeCrossSourceTotal === null
        && segment.catalogIndependentCrossSourceTotal === null
        && segment.addToLegacySourceNativeCount === false
        && segment.addToLegacyIndependentCount === false
        && segment.closesLegacyGap === false
        && segment.changesLegacyEvaluation === false
        && segment.changesLegacyControlPlane === false), true);
    assert.equal(envelope.coverageBridge.segments.intervention.legacySegmentId,
      null);
    assert.equal(envelope.coverageBridge.segments.intervention.mapping,
      "CATALOG_ONLY_ADDITIONAL_SEGMENT");
    assert.deepEqual(envelope.coverageBridge.segments.intervention
      .catalogSourceNativeSourceIds,
    ["ajay-dagger-interventions-no-video",
      "handover-linked-intervention-lineage", "peg-intervention",
      "so101-hil-rl-linked-lineage"]);
    assert.deepEqual(catalog.segmentCoverage.segments.delegationAuthorization
      .sourceNativeSourceIds, []);
    assert.equal(envelope.coverageBridge.segments.intervention
      .catalogSourceNativeSourceIds.every((sourceId) => {
        const interventionSource = catalog.sources.find((item) =>
          item.sourceId === sourceId);
        return interventionSource.clearances.use.delegationAuthorityAllowed
          === false
          && interventionSource.segments.delegationAuthorization
            .sourceNativeCount === 0
          && interventionSource.segments.delegationAuthorization
            .independentCount === 0;
      }), true);

    const source = (sourceId) => catalog.sources.find((item) =>
      item.sourceId === sourceId);
    const plug = source("realrobot-plug93-recovery-numeric-slice");
    const kelin = source("kelin-kewang-intervention-exact-repack-lineage");
    assert.ok(plug && kelin);
    assert.equal(plug.segments.recovery.sourceNativeCount, 0);
    assert.equal(plug.segments.recovery.independentCount, 0);
    assert.equal(plug.populations.find((population) => population.populationId
      === "publisher-declared-recovery-cohort-membership").count, 17);
    assert.equal(kelin.lineage.addsUniqueEpisodes, 0);
    assert.equal(kelin.lineage.addsUniqueFrames, 0);
    assert.equal(Object.values(kelin.segments).every((segment) =>
      segment.sourceNativeCount === 0 && segment.independentCount === 0), true);

    const interventionScope = catalog.discovery.scopes.find((scope) =>
      scope.scopeId ===
        "hf-robot-intervention-three-query-ledger-20260830");
    assert.ok(interventionScope);
    assert.equal(interventionScope.candidateCount, 258);
    assert.equal(interventionScope.terminalCount, 258);
    assert.equal(interventionScope.declaredScopeExhausted, true);
    assert.equal(interventionScope.sourceUniverseExhausted, false);
    assert.equal(interventionScope.globalExhaustion, false);

    assert.deepEqual(envelope.semanticFirewall, {
      engineV4ReportMutated: false,
      engineV4RunReceiptMutated: false,
      legacySourceLedgerMutated: false,
      legacySourceLedgerEntriesAdded: 0,
      legacyCandidateRowsAdded: 0,
      legacySourceRecordsAdded: 0,
      legacyDenominatorUnitsAdded: 0,
      legacyIssueFinderRowsAdded: 0,
      offlineModelFitRowsAdded: 0,
      modelEvaluationRowsAdded: 0,
      offlineModelFitsAdded: 0,
      publisherLabelRowsPromotedToPseudoLabels: 0,
      pseudoLabelRowsAdded: 0,
      pseudoLabelingAuthorized: false,
      modelSelectionRowsAdded: 0,
      modelSelectionDecisionsAdded: 0,
      modelSelectionAuthorized: false,
      reviewQueueRowsAdded: 0,
      reviewQueuePriorityChanges: 0,
      reviewDispatchesAdded: 0,
      controlPlaneRowsAdded: 0,
      controlPlaneProjectionChanges: 0,
      controlPlaneMutationAuthorized: false,
      authorizedTrainingSourcesAdded: 0,
      authorizedTrainingRowsAdded: 0,
      authorizedTrainingJobsAdded: 0,
      productionTrainingRowsAdded: 0,
      productionModelsPromoted: 0,
      networkAdmissionSourcesAdded: 0,
      networkAdmissionRowsAdded: 0,
      networkProjectionRowsAdded: 0,
      delegationAuthoritySourcesAdded: 0,
      delegationAuthorityUnitsAdded: 0,
      actionAuthorityUnitsAdded: 0,
      causalExperienceUnitsAdded: 0,
      interventionRowsPromotedToAuthority: 0,
      interventionSourcesPromotedToAuthority: 0,
      interventionImpliesDelegationAuthority: false,
      interventionImpliesActionAuthority: false,
      closureCreditAdded: 0,
      actionAuthorized: false,
      automaticAcquisitionDispatched: false,
      priceAuthorized: false,
      guaranteeAuthorized: false,
      settlementAuthorized: false,
    });
    assert.deepEqual(receipt.semanticFirewall, envelope.semanticFirewall);
    assert.equal(catalog.useBoundary.authorizedTrainingSources, 0);
    assert.equal(catalog.useBoundary.productionTrainingRows, 0);
    assert.equal(catalog.useBoundary.networkAdmissionSources, 0);
    assert.equal(catalog.useBoundary.delegationAuthoritySources, 0);
    assert.equal(catalog.useBoundary.actionAuthorityUnits, 0);
    assert.equal(catalog.useBoundary.causalExperienceUnits, 0);

    assert.match(bundle.envelope.bindingHash, HASH);
    assert.match(bundle.receipt.receiptHash, HASH);
    assert.equal(serializeEpisodeDataEnginePublicSourceEnvelope(
      bundle.envelope).at(-1), 0x0a);
    assert.equal(serializeEpisodeDataEnginePublicSourceBindingReceipt(
      bundle.receipt).at(-1), 0x0a);

    const structural =
      verifyEpisodeDataEnginePublicSourceBundleStructure(bundle);
    assert.deepEqual(structural, {
      ok: true,
      sourceReplayEstablished: false,
      bindingHash: bundle.envelope.bindingHash,
      receiptHash: bundle.receipt.receiptHash,
      engineReportHash: bundle.engineReport.reportHash,
      sourceLedgerHash: bundle.engineReport.sourceLedger.ledgerHash,
      catalogHash: catalog.catalogHash,
    });
    const tampered = structuredClone(bundle);
    tampered.envelope.bindingHash =
      "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    assert.equal(verifyEpisodeDataEnginePublicSourceBundleStructure(
      tampered).ok, false);
    assert.throws(() => serializeEpisodeDataEnginePublicSourceEnvelope(
      tampered.envelope),
    /EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_ENVELOPE_SERIALIZATION_HASH_MISMATCH/u);

    const fileCheck = verifyEpisodeDataEnginePublicSourcePublicationFiles(
      outputDirectory);
    assert.equal(fileCheck.ok, true);
    assert.equal(fileCheck.receiptToActualFileByteBindingEstablished, true);
    assert.equal(fileCheck.declaredPayloadSerializationEstablished, true);
    assert.equal(fileCheck.completeBindingReceiptStructureEstablished, false);
    assert.equal(fileCheck.receiptTimestampOrderingEstablished, true);
    assert.equal(fileCheck.sourceReplayEstablished, false);
    assert.equal(fileCheck.actualFiles.length, 5);
    assert.equal(fileCheck.actualFileSetHash,
      published.actualFileSetHash);
    assert.equal(fileCheck.receiptFileSha256,
      published.receiptFileSha256);
    const directoryStructure =
      verifyEpisodeDataEnginePublicSourceArtifactDirectoryStructure(
        outputDirectory);
    assert.equal(directoryStructure.ok, true);
    assert.equal(directoryStructure.sourceReplayEstablished, false);
    assert.equal(directoryStructure
      .receiptToActualFileByteBindingEstablished, true);
    assert.equal(directoryStructure.declaredPayloadSerializationEstablished,
      true);
    assert.equal(directoryStructure.completeBindingReceiptStructureEstablished,
      true);
    assert.equal(directoryStructure.receiptTimestampOrderingEstablished, true);
    assert.equal(directoryStructure.bundleStructuralConsistencyEstablished,
      true);
    const trusted = await verifyEpisodeDataEnginePublicSourceArtifactDirectory(
      outputDirectory, INPUT);
    assert.equal(trusted.ok, true);
    assert.equal(Object.hasOwn(trusted, "sourceReplayEstablished"), false);
    assert.equal(trusted.engineFullSourceReplayEstablished, true);
    assert.equal(trusted.fixedProfileWorkspaceRebuildEstablished, true);
    assert.equal(trusted.declaredVerificationRadiusReplayEstablished, true);
    assert.equal(trusted.allCatalogSourcesFullPayloadReplayEstablished, false);
    assert.deepEqual(trusted.metadataOnlySourceIds,
      ["agentlens-metadata-disposition",
        "hiesh-sequence-recovery-metadata-only"]);
    assert.equal(trusted.receiptToActualFileByteBindingEstablished, true);
    assert.equal(trusted.declaredPayloadSerializationEstablished, true);
    assert.equal(trusted.completeBindingReceiptStructureEstablished, true);
    assert.equal(trusted.bundleStructuralConsistencyEstablished, true);
    assert.equal(trusted.exactFileSetEstablished, true);
    assert.equal(trusted.receiptTimestampOrderingEstablished, true);
    assert.equal(trusted.actualFileSetHash, published.actualFileSetHash);
    assert.equal(trusted.bindingHash, bundle.envelope.bindingHash);
    assert.equal(trusted.receiptHash, bundle.receipt.receiptHash);
    assert.equal(trusted.engineReportHash, bundle.engineReport.reportHash);
    assert.equal(trusted.sourceLedgerHash,
      bundle.engineReport.sourceLedger.ledgerHash);
    assert.equal(trusted.catalogHash, catalog.catalogHash);
    assert.equal(trusted.legacySourceLedgerEntriesAdded, 0);
    assert.equal(trusted.modelFitRowsAdded, 0);
    assert.equal(trusted.modelEvaluationRowsAdded, 0);
    assert.equal(trusted.authorizedTrainingSourcesAdded, 0);
    assert.equal(trusted.authorizedTrainingRowsAdded, 0);
    assert.equal(trusted.productionTrainingRowsAdded, 0);
    assert.equal(trusted.networkAdmissionSourcesAdded, 0);
    assert.equal(trusted.networkAdmissionRowsAdded, 0);
    assert.equal(trusted.delegationAuthoritySourcesAdded, 0);
    assert.equal(trusted.delegationAuthorityUnitsAdded, 0);
    assert.equal(trusted.actionAuthorityUnitsAdded, 0);
    assert.equal(trusted.causalExperienceUnitsAdded, 0);

    const missingProfileRoot = await
      verifyEpisodeDataEnginePublicSourceEnvelope(bundle, {
        sourceDirectory: SOURCE_DIRECTORY,
        artifactDirectory: ARTIFACT_DIRECTORY,
        cuaArtifactDirectory: CUA_ARTIFACT_DIRECTORY,
        rebootArtifactDirectory: REBOOT_ARTIFACT_DIRECTORY,
        rebootSourceDirectory: REBOOT_SOURCE_DIRECTORY,
        sentinelArtifactDirectory: SENTINEL_ARTIFACT_DIRECTORY,
        staleConstraintArtifactDirectory: STALE_CONSTRAINT_ARTIFACT_DIRECTORY,
      });
    assert.deepEqual(missingProfileRoot, {
      ok: false,
      engineFullSourceReplayEstablished: false,
      fixedProfileWorkspaceRebuildEstablished: false,
      declaredVerificationRadiusReplayEstablished: false,
      allCatalogSourcesFullPayloadReplayEstablished: false,
      metadataOnlySourceIds: [],
      legacySourceLedgerEntriesAdded: 0,
      modelFitRowsAdded: 0,
      modelEvaluationRowsAdded: 0,
      authorizedTrainingSourcesAdded: 0,
      authorizedTrainingRowsAdded: 0,
      productionTrainingRowsAdded: 0,
      networkAdmissionSourcesAdded: 0,
      networkAdmissionRowsAdded: 0,
      delegationAuthoritySourcesAdded: 0,
      delegationAuthorityUnitsAdded: 0,
      actionAuthorityUnitsAdded: 0,
      causalExperienceUnitsAdded: 0,
      error:
        "EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_PUBLIC_SOURCE_WORKSPACE_ROOT_REQUIRED",
    });
  });
