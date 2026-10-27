import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync,
  statSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  STAGE0_EVIDENCE_CHAIN_SCHEMA,
  STAGE0_EVIDENCE_CURRENT_PATHS,
  STAGE0_EVIDENCE_SUPERSEDED_PATHS,
  runStage0PrivateSnapshotMutationProbeForTest,
  verifyStage0EvidenceChainCurrentManifest,
  verifyStage0EvidenceChainCurrentManifestStructure,
} from "../src/outsider-stage0-evidence-current.js";

const manifestPath = path.resolve(STAGE0_EVIDENCE_CURRENT_PATHS.manifest);
const physicalTemporaryDirectory = realpathSync(tmpdir());
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

test("Stage 0 current pointer preserves old bytes and binds the replacement chain", () => {
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString("utf8"));
  const body = structuredClone(manifest);
  delete body.manifestHash;
  const structural = verifyStage0EvidenceChainCurrentManifestStructure(bytes);
  assert.equal(structural.ok, true, structural.error);
  assert.equal(structural.sourceArtifactsReverified, false);
  assert.equal(manifest.schema, STAGE0_EVIDENCE_CHAIN_SCHEMA);
  assert.equal(manifest.schemaVersion, "3.0.0");
  assert.equal(manifest.manifestHash, digest(STAGE0_EVIDENCE_CHAIN_SCHEMA, body));
  assert.equal(statSync(manifestPath).mode & 0o777, 0o600);
  const predecessorBytes = readFileSync(path.resolve(
    manifest.predecessor.repositoryRelativePath));
  assert.equal(manifest.predecessor.repositoryRelativePath,
    "artifacts/stage0-evidence-chain-current-20260902/final-v3/manifest.json");
  assert.equal(manifest.predecessor.bytes, predecessorBytes.length);
  assert.equal(manifest.predecessor.bytes, 14_085);
  assert.equal(manifest.predecessor.fileSha256,
    `sha256:${createHash("sha256").update(predecessorBytes).digest("hex")}`);
  assert.equal(manifest.predecessor.fileSha256,
    "sha256:5ee8904cec84bb1df78574592abcbcedc4ad3b2ec06c4afd6de430e1cb33f6e9");
  assert.equal(manifest.predecessor.manifestHash,
    "sha256:337254904893f9380a7a276b0aca46c7638ac743788e6f44d386d5cbb9ed74fb");
  assert.equal(manifest.supersedesManifestHash, manifest.predecessor.manifestHash);
  const priorBytes = readFileSync(path.resolve(
    manifest.priorPredecessor.repositoryRelativePath));
  assert.equal(manifest.priorPredecessor.repositoryRelativePath,
    "artifacts/stage0-evidence-chain-current-20260902/final-v2/manifest.json");
  assert.equal(manifest.priorPredecessor.bytes, 13_218);
  assert.equal(manifest.priorPredecessor.fileSha256,
    `sha256:${createHash("sha256").update(priorBytes).digest("hex")}`);
  assert.equal(manifest.priorPredecessor.manifestHash,
    "sha256:2e1f34bcf3354cdfe32ee6607b95be28960ccf22e85b89ccb6cb5908b9ef72b1");
  assert.equal(manifest.superseded.droid.inventory.repositoryRelativePath,
    STAGE0_EVIDENCE_SUPERSEDED_PATHS.droidArtifact);
  assert.equal(manifest.current.droid.inventory.repositoryRelativePath,
    STAGE0_EVIDENCE_CURRENT_PATHS.droidArtifact);
  assert.equal(manifest.current.stage1Registry.inventory.repositoryRelativePath,
    STAGE0_EVIDENCE_CURRENT_PATHS.stage1Registry);
  assert.equal(manifest.current.empiricalLedger.file.repositoryRelativePath,
    STAGE0_EVIDENCE_CURRENT_PATHS.empiricalLedger);
  assert.equal(manifest.superseded.droid.episodeCount, 2);
  assert.equal(manifest.current.droid.episodeCount, 2);
  assert.equal(manifest.superseded.droid.totalSteps, 404);
  assert.equal(manifest.current.droid.totalSteps, 404);
  assert.equal(manifest.superseded.droid.reportHash,
    manifest.current.droid.reportHash);
  assert.equal(manifest.current.stage1Registry.artifactSets, 7);
  assert.equal(manifest.current.stage1Registry.candidates, 12_642);
  assert.equal(manifest.current.empiricalLedger.factorRows, 463);
  assert.equal(manifest.inputSnapshotAssurance.method,
    "COMPLETE_BOUNDED_O_NOFOLLOW_PRIVATE_READ_ONLY_TREE");
  assert.equal(manifest.inputSnapshotAssurance.inputRootCount, 13);
  assert.ok(manifest.inputSnapshotAssurance.fileCount > 170);
  assert.ok(manifest.inputSnapshotAssurance.totalBytes > 600_000_000);
  assert.match(manifest.inputSnapshotAssurance.inputTreeCommitment,
    /^sha256:[a-f0-9]{64}$/u);
  assert.equal(manifest.inputSnapshotAssurance.originalDescriptorsHeldThroughReplay, true);
  assert.equal(manifest.inputSnapshotAssurance
    .declaredArtifactAndDatasetReplayReadsUsePrivateSnapshot, true);
  assert.equal(manifest.inputSnapshotAssurance
    .droidSourceBuffersReadOnceFromPrivateSnapshot, true);
  assert.equal(manifest.inputSnapshotAssurance
    .receiptsAndInventoriesDerivedFromPrivateSnapshot, true);
  assert.equal(manifest.inputSnapshotAssurance
    .postReplayOriginalDescriptorPathAndBytesReverified, true);
  assert.equal(manifest.inputSnapshotAssurance
    .postReplayPrivateDescriptorPathAndBytesReverified, true);
  assert.equal(manifest.inputSnapshotAssurance.verifierImplementationFilesSnapshotted, false);
  assert.equal(manifest.inputSnapshotAssurance.stage1ImplementationClosureAtomic, false);
  assert.equal(manifest.inputSnapshotAssurance.overallAdmission,
    "HOLD_NONATOMIC_VERIFIER_IMPLEMENTATION_CLOSURE");
  assert.equal(manifest.inputSnapshotAssurance.privateFilesMode, "0400");
  assert.equal(manifest.inputSnapshotAssurance.privateDirectoriesMode, "0500");
  assert.equal(manifest.inputSnapshotAssurance.privateSnapshotRemovedBeforeReturn, true);
  assert.equal(manifest.preservation.oldArtifactBytesPreserved, true);
  assert.equal(manifest.preservation.oldChainMutatedByThisManifest, false);
  assert.equal(manifest.preservation.supersessionMarkerSourceReplaysOldProjection, false);
  assert.equal(manifest.boundary.routingMetadataOnly, true);
  assert.equal(manifest.boundary.authority, "none");
  assert.equal(manifest.boundary.automaticTraining, false);
  assert.equal(manifest.boundary.pricing, false);
  assert.equal(manifest.boundary.remoteOrPhysicalAction, false);

  const promoted = structuredClone(manifest);
  promoted.boundary.pricing = true;
  delete promoted.manifestHash;
  promoted.manifestHash = digest(STAGE0_EVIDENCE_CHAIN_SCHEMA, promoted);
  assert.equal(verifyStage0EvidenceChainCurrentManifestStructure(
    `${JSON.stringify(promoted)}\n`).ok, false);
  const brokenLineage = structuredClone(manifest);
  brokenLineage.predecessor.bytes += 1;
  delete brokenLineage.manifestHash;
  brokenLineage.manifestHash = digest(STAGE0_EVIDENCE_CHAIN_SCHEMA, brokenLineage);
  assert.equal(verifyStage0EvidenceChainCurrentManifestStructure(
    `${JSON.stringify(brokenLineage)}\n`).ok, false);
  assert.equal(verifyStage0EvidenceChainCurrentManifestStructure({}).ok, false);
  assert.equal(verifyStage0EvidenceChainCurrentManifestStructure("x".repeat(300_000)).ok,
    false);
});

test("Stage 0 structural verification does not adopt post-import intrinsic poisoning", () => {
  const moduleUrl = new URL("../src/outsider-stage0-evidence-current.js", import.meta.url).href;
  const script = `
    import { createHash } from "node:crypto";
    import { readFileSync } from "node:fs";
    const api = await import(${JSON.stringify(moduleUrl)});
    const bytes = readFileSync(${JSON.stringify(manifestPath)});
    const first = api.verifyStage0EvidenceChainCurrentManifestStructure(bytes);
    const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
    hashPrototype.update = () => { throw new Error("poisoned-update"); };
    hashPrototype.digest = () => "poisoned-digest";
    JSON.parse = () => ({ forged: true });
    Object.freeze = () => { throw new Error("poisoned-freeze"); };
    Object.getPrototypeOf = () => null;
    Reflect.ownKeys = () => [];
    Buffer.isBuffer = () => false;
    Buffer.prototype.toString = () => "{\\"forged\\":true}";
    Array.prototype.sort = () => { throw new Error("poisoned-sort"); };
    Array.prototype.pop = () => null;
    Array.prototype.push = () => 0;
    String.prototype.includes = () => true;
    String.prototype.startsWith = () => false;
    String.prototype.localeCompare = () => 0;
    Date.prototype.toISOString = () => "poisoned-time";
    RegExp.prototype.test = () => false;
    globalThis.String = () => "poisoned-string";
    const second = api.verifyStage0EvidenceChainCurrentManifestStructure(bytes);
    process.stdout.write(first.ok + "|" + second.ok + "|"
      + (first.manifestHash === second.manifestHash));
  `;
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script],
    { encoding: "utf8" }), "true|true|true");
});

test("Stage 0 current pointer requires all three replacement layers to replay", {
  timeout: 300_000,
}, async () => {
  const checked = await verifyStage0EvidenceChainCurrentManifest();
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "THREE_LAYER_PRIVATE_DATA_INPUT_REPLAY_WITH_IMPLEMENTATION_CLOSURE_HOLD");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.allReplayInputsAtomic, false);
  assert.equal(checked.holdReason, "NONATOMIC_VERIFIER_IMPLEMENTATION_CLOSURE");
  assert.equal(checked.oldArtifactBytesPreserved, true);
  assert.equal(checked.boundary.authority, "none");
});

test("Stage 0 private replay snapshot isolates and detects an original-input ABA", async () => {
  const fixtureRoot = mkdtempSync(path.join(physicalTemporaryDirectory,
    "outsider-stage0-aba-fixture-"));
  const inputPath = path.join(fixtureRoot, "input.bin");
  writeFileSync(inputPath, "AAAA", { mode: 0o600 });
  let replayObserved = null;
  try {
    await assert.rejects(runStage0PrivateSnapshotMutationProbeForTest({
      fixtureRoot,
      duringReplay: ({ privatePath }) => {
        replayObserved = readFileSync(privatePath, "utf8");
        writeFileSync(inputPath, "BBBB");
        writeFileSync(inputPath, "AAAA");
      },
    }), /ORIGINAL_INPUT_CHANGED_DURING_REPLAY/u);
    assert.equal(replayObserved, "AAAA");
    assert.equal(readFileSync(inputPath, "utf8"), "AAAA");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: false });
  }
});

test("Stage 0 private replay snapshot rejects a symlink declared root", async () => {
  const fixtureParent = mkdtempSync(path.join(physicalTemporaryDirectory,
    "outsider-stage0-root-symlink-fixture-"));
  const physicalRoot = path.join(fixtureParent, "physical-root");
  const symlinkRoot = path.join(fixtureParent, "symlink-root");
  mkdirSync(physicalRoot, { mode: 0o700 });
  writeFileSync(path.join(physicalRoot, "input.bin"), "OUTSIDE", { mode: 0o600 });
  symlinkSync(physicalRoot, symlinkRoot, "dir");
  let replayInvoked = false;
  try {
    await assert.rejects(runStage0PrivateSnapshotMutationProbeForTest({
      fixtureRoot: symlinkRoot,
      duringReplay: () => { replayInvoked = true; },
    }), /SNAPSHOT_DIRECTORY_SYMLINK_OR_ANCESTOR_INVALID/u);
    assert.equal(replayInvoked, false);
  } finally {
    rmSync(fixtureParent, { recursive: true, force: false });
  }
});

test("Stage 0 private replay snapshot rejects a symlink declared-root ancestor", async () => {
  const fixtureParent = mkdtempSync(path.join(physicalTemporaryDirectory,
    "outsider-stage0-root-ancestor-symlink-fixture-"));
  const physicalParent = path.join(fixtureParent, "physical-parent");
  const physicalRoot = path.join(physicalParent, "fixture-root");
  const symlinkParent = path.join(fixtureParent, "symlink-parent");
  mkdirSync(physicalParent, { mode: 0o700 });
  mkdirSync(physicalRoot, { mode: 0o700 });
  writeFileSync(path.join(physicalRoot, "input.bin"), "OUTSIDE", { mode: 0o600 });
  symlinkSync(physicalParent, symlinkParent, "dir");
  let replayInvoked = false;
  try {
    await assert.rejects(runStage0PrivateSnapshotMutationProbeForTest({
      fixtureRoot: path.join(symlinkParent, "fixture-root"),
      duringReplay: () => { replayInvoked = true; },
    }), /SNAPSHOT_DIRECTORY_SYMLINK_OR_ANCESTOR_INVALID/u);
    assert.equal(replayInvoked, false);
  } finally {
    rmSync(fixtureParent, { recursive: true, force: false });
  }
});

test("Stage 0 private replay snapshot rejects a symlink input path component", async () => {
  const fixtureParent = mkdtempSync(path.join(physicalTemporaryDirectory,
    "outsider-stage0-component-symlink-fixture-"));
  const fixtureRoot = path.join(fixtureParent, "fixture-root");
  const outsideRoot = path.join(fixtureParent, "outside-root");
  mkdirSync(fixtureRoot, { mode: 0o700 });
  mkdirSync(outsideRoot, { mode: 0o700 });
  writeFileSync(path.join(outsideRoot, "input.bin"), "OUTSIDE", { mode: 0o600 });
  symlinkSync(outsideRoot, path.join(fixtureRoot, "nested"), "dir");
  let replayInvoked = false;
  try {
    await assert.rejects(runStage0PrivateSnapshotMutationProbeForTest({
      fixtureRoot,
      inputRelativePath: "nested/input.bin",
      duringReplay: () => { replayInvoked = true; },
    }), /SNAPSHOT_DIRECTORY_SYMLINK_OR_ANCESTOR_INVALID/u);
    assert.equal(replayInvoked, false);
  } finally {
    rmSync(fixtureParent, { recursive: true, force: false });
  }
});

test("Stage 0 private replay snapshot isolates and detects a declared-root ABA", async () => {
  const fixtureRoot = mkdtempSync(path.join(physicalTemporaryDirectory,
    "outsider-stage0-root-aba-fixture-"));
  const heldRoot = `${fixtureRoot}-held`;
  const inputPath = path.join(fixtureRoot, "input.bin");
  writeFileSync(inputPath, "AAAA", { mode: 0o600 });
  let replayObserved = null;
  try {
    await assert.rejects(runStage0PrivateSnapshotMutationProbeForTest({
      fixtureRoot,
      duringReplay: ({ privatePath }) => {
        replayObserved = readFileSync(privatePath, "utf8");
        renameSync(fixtureRoot, heldRoot);
        mkdirSync(fixtureRoot, { mode: 0o700 });
        writeFileSync(inputPath, "BBBB", { mode: 0o600 });
        rmSync(fixtureRoot, { recursive: true, force: false });
        renameSync(heldRoot, fixtureRoot);
      },
    }), /ORIGINAL_DIRECTORY_CHANGED_DURING_REPLAY/u);
    assert.equal(replayObserved, "AAAA");
    assert.equal(readFileSync(inputPath, "utf8"), "AAAA");
  } finally {
    try { rmSync(fixtureRoot, { recursive: true, force: false }); } catch {}
    try { rmSync(heldRoot, { recursive: true, force: false }); } catch {}
  }
});

test("Stage 0 private replay snapshot isolates and detects an intermediate-directory ABA",
  async () => {
    const fixtureRoot = mkdtempSync(path.join(physicalTemporaryDirectory,
      "outsider-stage0-directory-aba-fixture-"));
    const nested = path.join(fixtureRoot, "nested");
    const heldNested = path.join(fixtureRoot, "nested-held");
    const inputPath = path.join(nested, "input.bin");
    mkdirSync(nested, { mode: 0o700 });
    writeFileSync(inputPath, "AAAA", { mode: 0o600 });
    let replayObserved = null;
    try {
      await assert.rejects(runStage0PrivateSnapshotMutationProbeForTest({
        fixtureRoot,
        inputRelativePath: "nested/input.bin",
        duringReplay: ({ privatePath }) => {
          replayObserved = readFileSync(privatePath, "utf8");
          renameSync(nested, heldNested);
          mkdirSync(nested, { mode: 0o700 });
          writeFileSync(inputPath, "BBBB", { mode: 0o600 });
          rmSync(nested, { recursive: true, force: false });
          renameSync(heldNested, nested);
        },
      }), /ORIGINAL_DIRECTORY_CHANGED_DURING_REPLAY/u);
      assert.equal(replayObserved, "AAAA");
      assert.equal(readFileSync(inputPath, "utf8"), "AAAA");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: false });
    }
  });

test("Stage 0 private replay ignores unrelated shared-ancestor sibling churn",
  async () => {
    const fixtureRoot = mkdtempSync(path.join(physicalTemporaryDirectory,
      "outsider-stage0-shared-ancestor-fixture-"));
    const unrelatedSibling = `${fixtureRoot}-unrelated-sibling`;
    const inputPath = path.join(fixtureRoot, "input.bin");
    writeFileSync(inputPath, "AAAA", { mode: 0o600 });
    let replayObserved = null;
    try {
      const result = await runStage0PrivateSnapshotMutationProbeForTest({
        fixtureRoot,
        duringReplay: ({ privatePath }) => {
          replayObserved = readFileSync(privatePath, "utf8");
          mkdirSync(unrelatedSibling, { mode: 0o700 });
          writeFileSync(path.join(unrelatedSibling, "unrelated.bin"), "BBBB",
            { mode: 0o600 });
          rmSync(unrelatedSibling, { recursive: true, force: false });
          return "UNRELATED_CHURN_COMPLETE";
        },
      });
      assert.equal(result.ok, true);
      assert.equal(result.replayResult, "UNRELATED_CHURN_COMPLETE");
      assert.equal(replayObserved, "AAAA");
      assert.equal(readFileSync(inputPath, "utf8"), "AAAA");
    } finally {
      try { rmSync(unrelatedSibling, { recursive: true, force: false }); } catch {}
      rmSync(fixtureRoot, { recursive: true, force: false });
    }
  });

test("Stage 0 pointer build is no-clobber", () => {
  const result = spawnSync(process.execPath,
    [path.resolve("scripts/stage0-evidence-current.mjs"), "build"],
    { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_NO_CLOBBER/u);
});
