import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SWE_SMITH_DATASET_ID,
  SWE_SMITH_REVISION,
  SWE_SMITH_TOOL_SHARD_DISPOSITION,
  verifySweSmithToolShardArtifactDirectory,
} from "../src/outsider-swe-smith-tool-shard.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-swe-smith-tool-shard-20260829-v1",
);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("one complete fixed-revision SWE-smith tool shard replays", () => {
  const checked = verifySweSmithToolShardArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;

  assert.equal(report.disposition, SWE_SMITH_TOOL_SHARD_DISPOSITION);
  assert.equal(report.source.datasetId, SWE_SMITH_DATASET_ID);
  assert.equal(report.source.revision, SWE_SMITH_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.selectedShard,
    "data/tool-00004-of-00008.parquet");
  assert.equal(report.source.selectedShardBytes, 77_754_558);
  assert.equal(report.source.selectedShardSha256,
    "sha256:e41ffbd3f9d1571917ac5b9f4d0108ded4799d9776f597a054203467135a5715");
  assert.equal(report.source.fullFixedRevisionTreeEntries, 35);
  assert.equal(report.source.fullFixedRevisionFiles, 34);
  assert.equal(report.source.fullFixedRevisionParquetFiles, 32);
  assert.equal(report.source.fullFixedRevisionFileBytes, 4_223_845_920);
  assert.deepEqual(report.source.physicalRepresentationBytes, {
    support: 4_136, ticks: 1_018_711_426, tool: 1_077_271_863,
    train: 1_052_703_887, xml: 1_075_154_608,
  });
  assert.equal(report.source.fullTreeInventoried, true);
  assert.equal(report.source.fullRepositoryPayloadAcquired, false);

  assert.equal(report.replay.parquetRows, 3_012);
  assert.equal(report.replay.parquetRowGroups, 4);
  assert.equal(report.replay.schemaColumns, 6);
  assert.equal(report.replay.messages, 135_594);
  assert.deepEqual(report.replay.messageRoles,
    { assistant: 66_291, system: 3_012, tool: 16_961, user: 49_330 });
  assert.equal(report.replay.minimumMessagesPerTrajectory, 7);
  assert.equal(report.replay.maximumMessagesPerTrajectory, 241);
  assert.equal(report.replay.embeddedToolCalls, 17_654);
  assert.equal(report.replay.toolResultIdentityRows, 16_961);
  assert.equal(report.replay.toolCallsWithoutResultIdentity, 693);
  assert.equal(report.replay.allToolResultIdentitiesMatchUniquePriorOrPeerCallIds,
    true);
  assert.equal(report.replay.messageActionFieldsPresent, 17_654);
  assert.equal(report.replay.messageThoughtFieldsPresent, 15_953);
  assert.deepEqual(report.replay.models, {
    "claude-3-5-sonnet-20241022": 1_987,
    "claude-3-7-sonnet-20250219": 972,
    "gpt-4o-2024-08-06": 53,
  });
  assert.equal(report.replay.uniqueInstanceIds, 2_600);
  assert.equal(report.replay.singleTrajectoryInstances, 2_384);
  assert.equal(report.replay.repeatedInstanceIds, 216);
  assert.equal(report.replay.sameInstanceMixedPublisherOutcomeGroups, 70);
  assert.equal(report.replay.publisherResolvedRows, 1_255);
  assert.equal(report.replay.publisherUnresolvedRows, 1_757);
  assert.equal(report.replay.emptyPatchRows, 1_129);
  assert.equal(report.replay.nonemptyPatchRows, 1_883);
  assert.equal(report.replay.resolvedWithoutPatchRows, 528);
  assert.equal(report.replay.unresolvedWithPatchRows, 1_156);
  assert.equal(
    report.replay.rawMessagesThoughtsActionsToolArgumentsResultsAndPatchesProjected,
    false);

  assert.equal(report.selection.representation, "tool");
  assert.equal(report.selection.physicalShardOrdinal, 4);
  assert.equal(report.selection.physicalShardCountWithinToolRepresentation, 8);
  assert.equal(report.selection.publisherDeclaredToolRows, 24_100);
  assert.equal(report.selection.publisherDeclaredXmlRows, 26_076);
  assert.equal(report.selection.publisherDeclaredTicksRows, 25_826);
  assert.equal(report.selection.unconfiguredLegacyTrainFilesPresent, 8);
  assert.equal(report.selection.readmeNarrativeTrajectoryCount, 5_017);
  assert.equal(report.selection.readmeCountConsistentWithPublishedSplitRows, false);
  assert.equal(report.selection.crossRepresentationIdentityDedupeReplayed, false);
  assert.equal(report.selection.crossRepresentationRowsMayNotBeAdded, true);
  assert.equal(report.selection.representativenessEstablished, false);
  assert.equal(report.selection.completeSelectedPhysicalShard, true);
  assert.equal(report.selection.completeToolRepresentation, false);
  assert.equal(report.selection.completeDataset, false);
  assert.equal(report.selection.sourceUniverseExhausted, false);
  assert.equal(report.denominators.crossRepresentationTotal, null);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);

  assert.equal(report.outcome.publisherResolutionIndependentlyRerun, false);
  assert.equal(report.outcome.sameInstanceGroupsHaveChronologicalRetryOrder, false);
  assert.equal(report.outcome.patchPresenceIsNotEquivalentToResolution, true);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);
  assert.equal(report.rights.datasetCardLicenseClaim, "MIT");
  assert.equal(report.rights.licenseFilePresent, false);
  assert.equal(report.rights.useSpecificTrainingAuthorizationEstablished, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "realWorldOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "physicalEffectRows", "offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "pricingRows",
    "authorityRows"]) assert.equal(report.boundary[field], 0, field);
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:f0f19f99087718d8e1a5f9790fb8a6f1b286172108f4a11568adcf77749352fd");
  assert.equal(receipt.receiptHash,
    "sha256:d9751f8219d9e0559335986fed45218d59acaee59f0aa913ed39b05622407050");
});

test("raw trajectories remain private and publication is no-clobber", () => {
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const shard = path.join(ARTIFACT,
    "source/files/data/tool-00004-of-00008.parquet");
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(report).mode & 0o777, 0o600);
  assert.equal(lstatSync(receipt).mode & 0o777, 0o600);
  assert.equal(lstatSync(shard).mode & 0o777, 0o600);
  const before = [sha256(report), sha256(receipt), sha256(shard)];
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-swe-smith-tool-shard.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.deepEqual([sha256(report), sha256(receipt), sha256(shard)], before);
});
