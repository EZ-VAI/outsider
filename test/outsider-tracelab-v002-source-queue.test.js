import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  TRACELAB_V002_COMMIT,
  TRACELAB_V002_HEAD_AT_REVIEW,
  TRACELAB_V002_RELEASE,
  TRACELAB_V002_SOURCE_URLS,
  TRACELAB_V002_TREE,
  buildTraceLabV002SourceCandidate,
  buildTraceLabV002SourceCandidateFromDirectory,
  publishTraceLabV002ArtifactDirectory,
  verifyTraceLabV002SourceCandidate,
} from "../src/outsider-tracelab-v002-source-queue.js";

const ARTIFACT = path.resolve("artifacts/tracelab-v002-source-candidate-20260828-v1");
const ARTIFACT_REPORT = path.join(ARTIFACT, "report.json");
const ARTIFACT_READY = existsSync(ARTIFACT_REPORT);

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function fixture() {
  const firstDigest = "a7bab286bc640844560850965ccf47975cf66407154132abaab90f27ec9be744";
  const secondDigest = "11ce51ec0a25e3d1d95b025bca2f7d1647e47571eb7cc968acd5fc64d4b4fb65";
  return {
    "tag-ref.json": jsonBytes({ ref: `refs/tags/${TRACELAB_V002_RELEASE}`,
      object: { type: "commit", sha: TRACELAB_V002_COMMIT } }),
    "tag-commit.json": jsonBytes({ sha: TRACELAB_V002_COMMIT,
      tree: { sha: TRACELAB_V002_TREE }, verification: { verified: true },
      author: { date: "2026-07-24T09:52:47Z" },
      parents: [{ sha: "1".repeat(40) }, { sha: "2".repeat(40) }] }),
    "release.json": jsonBytes({ id: 359_213_480, tag_name: TRACELAB_V002_RELEASE,
      name: "SyFI TraceLab v0.0.2", draft: false, prerelease: false,
      immutable: false, published_at: "2026-07-24T09:55:14Z",
      body: `665,453 agent steps; 8,058 sessions; 52 pseudonymous users; 743,819 normalized tool calls; ${firstDigest}; ${secondDigest}; Privacy hardening`,
      assets: [
        { name: "syfi_coding_trace.jsonl.gz", state: "uploaded", size: 100_939_722,
          digest: `sha256:${secondDigest}` },
        { name: "syfi_coding_trace.duckdb", state: "uploaded", size: 160_182_272,
          digest: `sha256:${firstDigest}` },
      ] }),
    "head-at-review.json": jsonBytes({ sha: TRACELAB_V002_HEAD_AT_REVIEW,
      commit: { tree: { sha: "3".repeat(40) },
        committer: { date: "2026-08-22T08:02:11Z" } } }),
    "README.md": Buffer.from("357K LLM rounds\n43 developers\ntools[].input\ntiming_events[]\ntool_call_id\ncommand_exit_code\n"),
    "LICENSE-DATASET.md": Buffer.from("Creative Commons Attribution 4.0 International\nreal Claude Code / Codex sessions sanitized with stable pseudonyms; local context including paths and tool inputs is stripped before release; do not attempt to re-identify\n"),
    NOTICE: Buffer.from("Creative Commons Attribution 4.0 International License\n"),
  };
}

function sourceDirectory(source = fixture()) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-tracelab-v002-test-"));
  for (const [name, bytes] of Object.entries(source)) {
    writeFileSync(path.join(root, name), bytes, { mode: 0o600 });
    chmodSync(path.join(root, name), 0o600);
  }
  return root;
}

test("v0.0.2 metadata pin emits a no-clobber queue and admits no episode or training row", () => {
  const report = buildTraceLabV002SourceCandidate(fixture());
  assert.equal(report.tag.targetCommit, TRACELAB_V002_COMMIT);
  assert.equal(report.commit.tree, TRACELAB_V002_TREE);
  assert.equal(report.movingHeadObservation.headAtReview, TRACELAB_V002_HEAD_AT_REVIEW);
  assert.equal(report.movingHeadObservation.tagTargetDiffersFromMovingHead, true);
  assert.equal(report.release.publisherCounts.agentSteps, 665_453);
  assert.equal(report.release.assets[0].name, "syfi_coding_trace.duckdb");
  assert.equal(report.release.assets[1].name, "syfi_coding_trace.jsonl.gz");
  assert.equal(report.documentation.metadataConflict.reconciled, false);
  assert.equal(report.priorVersion.release, "v0.0.1");
  assert.equal(report.priorVersion.revision,
    "fc061574a0f9700ccf88be33112adc8e86b425fa");
  assert.equal(report.supersession.priorArtifactOverwritten, false);
  assert.equal(report.supersession.currentPointerUpdated, false);
  assert.equal(report.episodeCoverage.sourceReplayedRows, 0);
  assert.equal(report.episodeCoverage.completeThreeSegmentEpisodes, 0);
  assert.equal(report.training.admittedTrainingRows, 0);
  assert.equal(report.training.decision,
    "KEEP_BASELINE_NO_SOURCE_REPLAYED_ADMITTED_EPISODE_ROWS");
  assert.equal(report.boundary.releasePayloadBytesDownloaded, 0);
  assert.equal(report.boundary.networkRecordsCreated, 0);
  assert.equal(report.boundary.CEU, 0);
  assert.equal(report.controlPlaneQueue.acquisitionQuestions.length, 3);
  assert.equal(report.controlPlaneQueue.dispatched, false);
});

test("verification requires exact private source replay and detects a changed source object", () => {
  const root = sourceDirectory();
  try {
    const report = buildTraceLabV002SourceCandidateFromDirectory(root);
    assert.equal(verifyTraceLabV002SourceCandidate(report,
      { sourceDirectory: root }).ok, true);
    writeFileSync(path.join(root, "NOTICE"),
      Buffer.from("Creative Commons Attribution 4.0 International License\nchanged\n"),
      { mode: 0o600 });
    const checked = verifyTraceLabV002SourceCandidate(report, { sourceDirectory: root });
    assert.equal(checked.ok, false);
    assert.match(checked.error, /SOURCE_REPLAY_MISMATCH/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accessors, proxies and exotic input are rejected before getters or proxy traps run", () => {
  let getterRan = false;
  const accessorRecord = {};
  Object.defineProperty(accessorRecord, "schema", { enumerable: true,
    get() { getterRan = true; throw new Error("must not run"); } });
  const accessorChecked = verifyTraceLabV002SourceCandidate(accessorRecord,
    { sourceDirectory: "/not/read" });
  assert.equal(accessorChecked.ok, false);
  assert.equal(getterRan, false);

  let proxyTrapRan = false;
  const proxyRecord = new Proxy({}, { ownKeys() {
    proxyTrapRan = true;
    throw new Error("must not run");
  } });
  assert.equal(verifyTraceLabV002SourceCandidate(proxyRecord,
    { sourceDirectory: "/not/read" }).ok, false);
  assert.equal(proxyTrapRan, false);

  const accessorSources = fixture();
  Object.defineProperty(accessorSources, "tag-ref.json", { enumerable: true,
    get() { getterRan = true; throw new Error("must not run"); } });
  assert.throws(() => buildTraceLabV002SourceCandidate(accessorSources),
    /SOURCE_SET_INVALID/u);
  assert.equal(getterRan, false);
  assert.throws(() => buildTraceLabV002SourceCandidate(Object.assign(
    Object.create({ inherited: true }), fixture())), /SOURCE_SET_INVALID/u);
});

test("builder and verifier retain captured crypto, clone, JSON, object, array and Buffer intrinsics",
  () => {
    const root = sourceDirectory();
    const reportFile = path.join(root, "expected-report.json");
    const report = buildTraceLabV002SourceCandidateFromDirectory(root);
    writeFileSync(reportFile, `${JSON.stringify(report)}\n`, { mode: 0o600 });
    const moduleUrl = pathToFileURL(path.resolve(
      "src/outsider-tracelab-v002-source-queue.js")).href;
    const child = `
      import { createHash } from "node:crypto";
      import { readFileSync } from "node:fs";
      const moduleUnderTest = await import(${JSON.stringify(moduleUrl)});
      const expected = JSON.parse(readFileSync(${JSON.stringify(reportFile)}, "utf8"));
      const hashPrototype = Object.getPrototypeOf(createHash("sha256"));
      const poison = () => { throw new Error("POST_IMPORT_INTRINSIC_POISON"); };
      hashPrototype.update = poison;
      hashPrototype.digest = poison;
      globalThis.structuredClone = poison;
      JSON.parse = poison;
      Object.keys = poison;
      Object.values = poison;
      Object.fromEntries = poison;
      Object.getOwnPropertyDescriptor = poison;
      Object.freeze = poison;
      Reflect.ownKeys = poison;
      Array.prototype.map = poison;
      Array.prototype.sort = poison;
      Array.prototype.some = poison;
      Array.prototype.reduce = poison;
      Buffer.from = poison;
      Buffer.isBuffer = poison;
      Buffer.prototype.toString = poison;
      const rebuilt = moduleUnderTest.buildTraceLabV002SourceCandidateFromDirectory(
        ${JSON.stringify(root)});
      const verified = moduleUnderTest.verifyTraceLabV002SourceCandidate(expected,
        { sourceDirectory: ${JSON.stringify(root)} });
      if (rebuilt.reportHash !== ${JSON.stringify(report.reportHash)} || !verified.ok) {
        process.exitCode = 2;
      } else {
        process.stdout.write("captured-intrinsics-ok\\n");
      }
    `;
    try {
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", child],
        { encoding: "utf8" });
      assert.equal(output, "captured-intrinsics-ok\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

test("atomic publish claim never replaces a concurrently created empty target directory", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-tracelab-publish-race-test-"));
  const staging = path.join(parent, ".staging");
  const target = path.join(parent, "artifact");
  try {
    mkdirSync(staging, { mode: 0o700 });
    mkdirSync(path.join(staging, "source"), { mode: 0o700 });
    writeFileSync(path.join(staging, "source", "metadata"), "source\n", { mode: 0o600 });
    writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
    writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });

    /* This directory represents a racer winning after the CLI's early
     * existsSync check but before publication. The old whole-directory rename
     * replaced it on macOS; the exclusive mkdir claim must fail. */
    mkdirSync(target, { mode: 0o700 });
    const before = statSync(target, { bigint: true });
    assert.throws(() => publishTraceLabV002ArtifactDirectory(staging, target),
      /TARGET_CLAIM_FAILED/u);
    const after = statSync(target, { bigint: true });
    assert.equal(after.dev, before.dev);
    assert.equal(after.ino, before.ino);
    assert.deepEqual(readdirSync(target), []);
    assert.equal(existsSync(path.join(staging, "run-receipt.json")), true);

    rmSync(target, { recursive: true, force: true });
    assert.equal(publishTraceLabV002ArtifactDirectory(staging, target), target);
    assert.equal(existsSync(staging), false);
    assert.equal(readFileSync(path.join(target, "source", "metadata"), "utf8"), "source\n");
    assert.equal(readFileSync(path.join(target, "report.json"), "utf8"), "{}\n");
    assert.equal(readFileSync(path.join(target, "run-receipt.json"), "utf8"), "{}\n");
    assert.equal(statSync(target).mode & 0o777, 0o700);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("bounded acquired artifact replays, stays private and remains metadata-only",
  { skip: !ARTIFACT_READY }, () => {
    const report = JSON.parse(readFileSync(ARTIFACT_REPORT, "utf8"));
    const receipt = JSON.parse(readFileSync(path.join(ARTIFACT, "run-receipt.json"), "utf8"));
    const checked = verifyTraceLabV002SourceCandidate(report,
      { sourceDirectory: path.join(ARTIFACT, "source") });
    assert.equal(checked.ok, true);
    assert.equal(report.reportHash,
      "sha256:d1d69a90bb62708c43a5673cbc4c6f12a7a18eea0fa378024070818a2180b608");
    assert.equal(report.sourceTrust.sourceRoot,
      "sha256:512eb7dad76f2cec338dc5eff6ad0964ab78f59a31b357aa261b1bbe1ca60c3a");
    assert.equal(report.controlPlaneQueue.queueHash,
      "sha256:a17b92ec9567e08b0457f0eb35a6629b787132c44cbc43d63eec46d1947057dd");
    assert.equal(receipt.receiptHash,
      "sha256:def0a637a51fe469a68c252bb7772908a79f00238a6e7b187566398ac09ca4f7");
    assert.equal(receipt.sourceObjectsFetched, 7);
    assert.equal(receipt.sourceBytesFetched, 57_275);
    assert.equal(receipt.releasePayloadBytesFetched, 0);
    assert.equal(report.release.publisherCounts.agentSteps, 665_453);
    assert.equal(report.episodeCoverage.sourceReplayedRows, 0);
    assert.equal(report.training.admittedTrainingRows, 0);
    assert.equal(report.boundary.networkRecordsCreated, 0);
    assert.equal(statSync(ARTIFACT).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
    for (const name of [...Object.keys(TRACELAB_V002_SOURCE_URLS),
      "report.json", "run-receipt.json"]) {
      const file = name.endsWith(".json") && ["report.json", "run-receipt.json"].includes(name)
        ? path.join(ARTIFACT, name) : path.join(ARTIFACT, "source", name);
      assert.equal(statSync(file).mode & 0o777, 0o600, file);
    }
  });
