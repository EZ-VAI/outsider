import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA,
  STALE_CONSTRAINT_EPISODES_SCHEMA,
  STALE_CONSTRAINT_EXPECTED_FILES,
  STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA,
  STALE_CONSTRAINT_SOURCE_FILES,
  STALE_CONSTRAINT_ZENODO_RECORD,
  buildStaleConstraintEpisodeArtifactFromDirectory,
  buildStaleConstraintRunReceipt,
  publishStaleConstraintArtifactDirectory,
  staleConstraintPreOutcomeFeatures,
  verifyStaleConstraintEpisodeArtifact,
  verifyStaleConstraintRunReceipt,
} from "../src/outsider-stale-constraint-episodes.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-stale-constraint-episodes-20260828-v2");
const PREDECESSOR_SOURCE = path.resolve(
  "artifacts/outsider-stale-constraint-episodes-20260828-v1/source");
const PREDECESSOR_MARKER = path.resolve(
  "artifacts/outsider-stale-constraint-episodes-20260828-v1/SUPERSEDED-REJECTED.json");
const REPORT_FILE = path.join(ARTIFACT, "report.json");
const ARTIFACT_READY = existsSync(REPORT_FILE);

function readArtifact() {
  return {
    report: JSON.parse(readFileSync(REPORT_FILE, "utf8")),
    archiveIndex: JSON.parse(readFileSync(
      path.join(ARTIFACT, "archive-index.json"), "utf8")),
    receipt: JSON.parse(readFileSync(path.join(ARTIFACT, "run-receipt.json"), "utf8")),
    sourceDirectory: path.join(ARTIFACT, "source"),
  };
}

test("record and file pins are exact v2 CC-BY-4.0 official revisions", () => {
  assert.equal(STALE_CONSTRAINT_EPISODES_SCHEMA,
    "outsider/stale-constraint-constructed-episodes/v2");
  assert.equal(STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA,
    "outsider/stale-constraint-safe-archive-index/v2");
  assert.equal(STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA,
    "outsider/stale-constraint-constructed-episodes-run-receipt/v2");
  assert.deepEqual(STALE_CONSTRAINT_ZENODO_RECORD, {
    recordId: "22117197",
    conceptRecordId: "22108557",
    doi: "10.5281/zenodo.22117197",
    conceptDoi: "10.5281/zenodo.22108557",
    version: "v2",
    revision: 3,
    created: "2026-08-26T19:36:24.394138+00:00",
    modified: "2026-08-26T19:36:24.872110+00:00",
    licenseId: "cc-by-4.0",
    title: "When Stale Constraints Go Unchecked: Budgeted Verification Failures in Inherited Agent Memory",
  });
  assert.deepEqual(STALE_CONSTRAINT_EXPECTED_FILES["paper2-data-and-code-v2.zip"], {
    bytes: 22_808_747,
    md5: "6296f47aba45921fc12b9e3ef87d255f",
    sha256: "3825d8bae84706deba9cef8d5ddbb9eebc73a13fa0e898c83fb008bc05a55973",
  });
  assert.deepEqual(STALE_CONSTRAINT_EXPECTED_FILES.SHA256SUMS, {
    bytes: 279,
    md5: "71e3cdd016c0c6731069743a3927fa6c",
  });
});

test("feature extraction is pre-outcome structural and invariant to every forbidden field", () => {
  const structural = {
    form: "stated",
    policy: "native",
    model: "model-a",
    family: "f1",
    kind: "primary",
    world_key: "growth",
    world: "superseded",
    budget: 2,
    target_shape: { chars: 100, numerics: 3, clauses: 4 },
    raw_response_t1: "first secret response",
    raw_response_t2: "second secret response",
    answer_t1: { intended_action: "a" },
    answer_t2: { intended_action: "b" },
    returned_records: ["post verification content"],
    resolved_ids: ["memory_73"],
    usage: [{ tokens: 1 }],
    retries: [{ reason: "provider" }],
    scored: { authoritative_consistent: false, stale_consistent: true },
  };
  const first = staleConstraintPreOutcomeFeatures(structural);
  const changedForbidden = {
    ...structural,
    world: "valid",
    raw_response_t1: "changed",
    raw_response_t2: "changed",
    answer_t1: { intended_action: "changed" },
    answer_t2: { intended_action: "changed" },
    returned_records: ["changed"],
    resolved_ids: [],
    usage: [{ tokens: 999_999 }],
    retries: [],
    scored: { authoritative_consistent: true, stale_consistent: null },
  };
  assert.deepEqual(staleConstraintPreOutcomeFeatures(changedForbidden), first);
  assert.deepEqual(Object.keys(first).sort(), [
    "budget", "family", "form", "kind", "model", "policy", "targetChars",
    "targetClauses", "targetNumerics", "worldKey",
  ].sort());
  assert.equal(Object.isFrozen(first), true);
});

test("feature extractor rejects accessors and proxies without reading raw response getters", () => {
  let getterRan = false;
  const episode = {
    form: "stated", policy: "native", model: "m", family: "f", kind: "primary",
    world_key: "growth", budget: 2,
    target_shape: { chars: 1, numerics: 0, clauses: 1 },
  };
  Object.defineProperty(episode, "raw_response_t1", { enumerable: true,
    get() { getterRan = true; throw new Error("must not run"); } });
  assert.throws(() => staleConstraintPreOutcomeFeatures(episode), /EPISODE_INVALID/u);
  assert.equal(getterRan, false);
  assert.throws(() => staleConstraintPreOutcomeFeatures(new Proxy({}, {})),
    /EPISODE_INVALID/u);
});

test("feature extractor rejects inherited fields without invoking polluted prototype getters", () => {
  let getterRuns = 0;
  Object.defineProperty(Object.prototype, "form", { configurable: true,
    get() { getterRuns += 1; throw new Error("must not run"); } });
  try {
    const episode = {
      policy: "native", model: "m", family: "f", kind: "primary",
      world_key: "growth", budget: 2,
      target_shape: { chars: 1, numerics: 0, clauses: 1 },
    };
    assert.throws(() => staleConstraintPreOutcomeFeatures(episode),
      /EPISODE_FORM_INVALID/u);
    assert.equal(getterRuns, 0);
  } finally {
    delete Object.prototype.form;
  }
});

test("post-import JSON.parse poisoning cannot bless two-byte record snapshots", () => {
  const moduleUrl = pathToFileURL(path.resolve(
    "src/outsider-stale-constraint-episodes.js")).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { Buffer } from "node:buffer";
    import { readFileSync } from "node:fs";
    const adapter = await import(${JSON.stringify(moduleUrl)});
    const root = ${JSON.stringify(PREDECESSOR_SOURCE)};
    const source = {};
    for (const name of Object.values(adapter.STALE_CONSTRAINT_SOURCE_FILES)) {
      source[name] = readFileSync(root + "/" + name);
    }
    const originalParse = JSON.parse;
    const beforeName = adapter.STALE_CONSTRAINT_SOURCE_FILES.recordBefore;
    const afterName = adapter.STALE_CONSTRAINT_SOURCE_FILES.recordAfter;
    const fakeOfficial = originalParse(source[beforeName].toString("utf8"));
    source[beforeName] = Buffer.from("{}", "utf8");
    source[afterName] = Buffer.from("{}", "utf8");
    JSON.parse = () => fakeOfficial;
    let rejected = false;
    let message = null;
    try { adapter.buildStaleConstraintEpisodeArtifact(source); }
    catch (error) { rejected = true; message = error.message; }
    process.stdout.write(JSON.stringify({ rejected, message,
      recordBeforeBytes: source[beforeName].length,
      recordAfterBytes: source[afterName].length }));
  `], { cwd: path.resolve("."), encoding: "utf8", timeout: 120_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    rejected: true,
    message: "STALE_CONSTRAINT_EPISODES_RECORD_METADATA_INVALID:metadata",
    recordBeforeBytes: 2,
    recordAfterBytes: 2,
  });
});

test("full replay retains captured intrinsics after broad post-import poisoning", () => {
  const moduleUrl = pathToFileURL(path.resolve(
    "src/outsider-stale-constraint-episodes.js")).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { Buffer } from "node:buffer";
    import { createHash } from "node:crypto";
    import { lstatSync } from "node:fs";
    import path from "node:path";
    const adapter = await import(${JSON.stringify(moduleUrl)});
    const sourceDirectory = ${JSON.stringify(PREDECESSOR_SOURCE)};
    const baseline = adapter.buildStaleConstraintEpisodeArtifactFromDirectory(
      sourceDirectory);
    const Define = Object.defineProperty;
    const Descriptor = Object.getOwnPropertyDescriptor;
    const Delete = Reflect.deleteProperty;
    const OriginalError = Error;
    const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
    const StatsPrototype = Object.getPrototypeOf(lstatSync(sourceDirectory));
    const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
    const targets = [
      [JSON, "parse", "value"],
      [Object, "entries", "value"], [Object, "freeze", "value"],
      [Object, "getOwnPropertyDescriptor", "value"],
      [Object, "getPrototypeOf", "value"], [Object, "hasOwn", "value"],
      [Object, "isFrozen", "value"], [Object, "keys", "value"],
      [Object, "values", "value"], [Reflect, "ownKeys", "value"],
      [Reflect, "apply", "value"], [Array, "isArray", "value"],
      [Array.prototype, "at", "value"], [Array.prototype, "every", "value"],
      [Array.prototype, "fill", "value"], [Array.prototype, "filter", "value"],
      [Array.prototype, "find", "value"], [Array.prototype, "flatMap", "value"],
      [Array.prototype, "forEach", "value"],
      [Array.prototype, "includes", "value"], [Array.prototype, "map", "value"],
      [Array.prototype, "reduce", "value"],
      [Array.prototype, "shift", "value"], [Array.prototype, "slice", "value"],
      [Array.prototype, "some", "value"], [Array.prototype, "sort", "value"],
      [Array.prototype, Symbol.iterator, "value"], [Array, Symbol.species, "get"],
      [Map.prototype, "entries", "value"], [Map.prototype, "forEach", "value"],
      [Map.prototype, "get", "value"], [Map.prototype, "has", "value"],
      [Map.prototype, "set", "value"], [Map.prototype, "values", "value"],
      [Map.prototype, Symbol.iterator, "value"], [Map.prototype, "size", "get"],
      [Set.prototype, "add", "value"], [Set.prototype, "forEach", "value"],
      [Set.prototype, "has", "value"], [Set.prototype, "values", "value"],
      [Set.prototype, Symbol.iterator, "value"], [Set.prototype, "size", "get"],
      [Buffer, "byteLength", "value"], [Buffer, "from", "value"],
      [Buffer, "isBuffer", "value"], [Buffer.prototype, "readUInt16LE", "value"],
      [Buffer.prototype, "readUInt32LE", "value"],
      [Buffer.prototype, "toString", "value"],
      [HashPrototype, "update", "value"], [HashPrototype, "digest", "value"],
      [RegExp.prototype, "exec", "value"], [RegExp.prototype, "test", "value"],
      [String.prototype, "includes", "value"],
      [String.prototype, "localeCompare", "value"],
      [String.prototype, "match", "value"], [String.prototype, "padStart", "value"],
      [String.prototype, "slice", "value"], [String.prototype, "split", "value"],
      [String.prototype, "startsWith", "value"],
      [String.prototype, "toLocaleLowerCase", "value"],
      [String.prototype, "trimEnd", "value"],
      [Number, "isFinite", "value"], [Number, "isSafeInteger", "value"],
      [Number.prototype, "toFixed", "value"],
      [Number.prototype, "toString", "value"],
      [Math, "exp", "value"], [Math, "floor", "value"],
      [Math, "log", "value"], [Math, "max", "value"],
      [Math, "min", "value"], [Math, "sqrt", "value"],
      [path, "dirname", "value"], [path, "join", "value"],
      [path, "resolve", "value"], [StatsPrototype, "isDirectory", "value"],
      [StatsPrototype, "isFile", "value"],
      [StatsPrototype, "isSymbolicLink", "value"],
      [globalThis, "Array", "value"], [globalThis, "BigInt", "value"],
      [globalThis, "Error", "value"], [globalThis, "Map", "value"],
      [globalThis, "Number", "value"], [globalThis, "Set", "value"],
      [globalThis, "String", "value"],
    ];
    const poisonLimit = Number(process.env.OUTSIDER_POISON_LIMIT ?? targets.length);
    const saved = new Array(targets.length);
    let applied = 0;
    let rebuilt;
    let thrown = null;
    try {
      for (let index = 0; index < poisonLimit; index += 1) {
        const owner = targets[index][0];
        const key = targets[index][1];
        const kind = targets[index][2];
        const descriptor = Descriptor(owner, key);
        saved[index] = [owner, key, descriptor];
        const boom = () => {
          throw new OriginalError("poisoned intrinsic invoked:" + index);
        };
        const poisoned = descriptor ? { ...descriptor }
          : { configurable: true, enumerable: false, writable: true };
        if (kind === "get") poisoned.get = boom;
        else poisoned.value = boom;
        Define(owner, key, poisoned);
        applied += 1;
      }
      rebuilt = adapter.buildStaleConstraintEpisodeArtifactFromDirectory(sourceDirectory);
    } catch (error) {
      thrown = error && error.message ? error.message : "unknown";
    } finally {
      for (let index = applied - 1; index >= 0; index -= 1) {
        if (saved[index][2]) Define(saved[index][0], saved[index][1], saved[index][2]);
        else Delete(saved[index][0], saved[index][1]);
      }
    }
    process.stdout.write(JSON.stringify({
      thrown,
      reportHashEqual: rebuilt?.report.reportHash === baseline.report.reportHash,
      archiveHashEqual: rebuilt?.archiveIndex.archiveIndexHash
        === baseline.archiveIndex.archiveIndexHash,
      sourceRootEqual: rebuilt?.report.sourceTrust.sourceRoot
        === baseline.report.sourceTrust.sourceRoot,
      auditJsonParses: rebuilt?.report.sourceReplay.auditJsonParses,
      auditEpisodes: rebuilt?.report.sourceReplay.opaqueAuditByteCommitments,
      productionDecision: rebuilt?.report.offlineResearchTraining.productionDecision,
    }));
  `], { cwd: path.resolve("."), encoding: "utf8", timeout: 180_000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    thrown: null,
    reportHashEqual: true,
    archiveHashEqual: true,
    sourceRootEqual: true,
    auditJsonParses: 0,
    auditEpisodes: 504,
    productionDecision: "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED",
  });
});

test("runtime-native prototype disruption fails closed with no positive result or target",
  { skip: !ARTIFACT_READY }, () => {
    const moduleUrl = pathToFileURL(path.resolve(
      "src/outsider-stale-constraint-episodes.js")).href;
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import { Buffer } from "node:buffer";
      import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
      import { tmpdir } from "node:os";
      import path from "node:path";
      const adapter = await import(${JSON.stringify(moduleUrl)});
      const artifact = ${JSON.stringify(ARTIFACT)};
      const sourceDirectory = path.join(artifact, "source");
      const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
      const archiveIndex = JSON.parse(readFileSync(
        path.join(artifact, "archive-index.json"), "utf8"));
      const Define = Object.defineProperty;
      const Descriptor = Object.getOwnPropertyDescriptor;
      const OriginalError = Error;
      const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
      const tempRoot = mkdtempSync(path.join(tmpdir(), "outsider-stale-poison-target-"));
      const target = path.join(tempRoot, "artifact");
      const outcomes = [];
      const check = (owner, key, kind, label) => {
        const descriptor = Descriptor(owner, key);
        const poisoned = { ...descriptor };
        const boom = () => { throw new OriginalError("runtime-native poison:" + label); };
        if (kind === "get") poisoned.get = boom;
        else poisoned.value = boom;
        Define(owner, key, poisoned);
        let result;
        try {
          result = adapter.verifyStaleConstraintEpisodeArtifact(report, archiveIndex,
            { sourceDirectory });
        } catch (error) {
          result = { ok: false, error: "THREW:" + error.message };
        } finally {
          Define(owner, key, descriptor);
        }
        outcomes[outcomes.length] = { label, ok: result.ok === true,
          errorPresent: typeof result.error === "string" && result.error.length > 0 };
      };
      check(Array.prototype, "push", "value", "ARRAY_PUSH");
      check(Buffer.prototype, "subarray", "value", "BUFFER_SUBARRAY");
      check(TypedArrayPrototype, "length", "get", "TYPED_ARRAY_LENGTH");
      const targetExists = existsSync(target);
      rmSync(tempRoot, { recursive: true, force: true });
      process.stdout.write(JSON.stringify({ outcomes, targetExists }));
    `], { cwd: path.resolve("."), encoding: "utf8", timeout: 120_000 });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), {
      outcomes: [
        { label: "ARRAY_PUSH", ok: false, errorPresent: true },
        { label: "BUFFER_SUBARRAY", ok: false, errorPresent: true },
        { label: "TYPED_ARRAY_LENGTH", ok: false, errorPresent: true },
      ],
      targetExists: false,
    });
  });

test("atomic publish never replaces a concurrently-created target and publishes receipt last", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-stale-publish-test-"));
  const staging = path.join(parent, ".staging");
  const target = path.join(parent, "artifact");
  const prepare = () => {
    mkdirSync(staging, { mode: 0o700 });
    mkdirSync(path.join(staging, "source"), { mode: 0o700 });
    writeFileSync(path.join(staging, "source", "source"), "x", { mode: 0o600 });
    for (const name of ["archive-index.json", "report.json", "run-receipt.json"]) {
      writeFileSync(path.join(staging, name), "{}\n", { mode: 0o600 });
    }
  };
  try {
    prepare();
    mkdirSync(target, { mode: 0o700 });
    const before = statSync(target, { bigint: true });
    assert.throws(() => publishStaleConstraintArtifactDirectory(staging, target),
      /TARGET_CLAIM_FAILED/u);
    const after = statSync(target, { bigint: true });
    assert.equal(after.dev, before.dev);
    assert.equal(after.ino, before.ino);
    assert.deepEqual(readdirSync(target), []);
    rmSync(target, { recursive: true, force: true });
    assert.equal(publishStaleConstraintArtifactDirectory(staging, target), target);
    assert.deepEqual(readdirSync(target).sort(), [
      "archive-index.json", "report.json", "run-receipt.json", "source",
    ]);
    assert.equal(statSync(target).mode & 0o777, 0o700);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("successor replays every episode byte while the audit stays opaque and HOLD-only",
  { skip: !ARTIFACT_READY }, () => {
    const { report, archiveIndex, receipt, sourceDirectory } = readArtifact();
    assert.equal(report.schema, STALE_CONSTRAINT_EPISODES_SCHEMA);
    assert.equal(archiveIndex.schema, STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA);
    assert.equal(receipt.schema, STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA);
    const verified = verifyStaleConstraintEpisodeArtifact(report, archiveIndex,
      { sourceDirectory });
    assert.deepEqual(verified, {
      ok: true,
      reportHash: report.reportHash,
      archiveIndexHash: archiveIndex.archiveIndexHash,
      sourceRoot: report.sourceTrust.sourceRoot,
      episodes: 5_400,
      schemaInspectedEpisodes: 4_896,
      opaqueAuditByteCommitments: 504,
      datasetWidePinnedKeptCalls: 10_800,
      researchQueueDecision: report.offlineResearchTraining.researchQueueDecision,
    });
    assert.equal(verifyStaleConstraintRunReceipt(receipt, report, archiveIndex,
      { sourceDirectory }).ok, true);
    assert.equal(report.sourceTrust.materialRecordStateStable, true);
    assert.equal(report.sourceTrust.externalChecksumFile.bytes, 279);
    assert.equal(report.sourceTrust.externalChecksumFile.md5,
      "71e3cdd016c0c6731069743a3927fa6c");
    assert.equal(report.sourceTrust.externalChecksumFile.entries[
      "paper2-data-and-code-v2.zip"],
    "3825d8bae84706deba9cef8d5ddbb9eebc73a13fa0e898c83fb008bc05a55973");
    assert.equal(archiveIndex.archive.bytes, 22_808_747);
    assert.equal(archiveIndex.summary.entries, 5_588);
    assert.equal(archiveIndex.summary.uncompressedBytes, 76_192_717);
    assert.equal(archiveIndex.summary.encryptedEntries, 0);
    assert.equal(archiveIndex.summary.symlinkEntries, 0);
    assert.equal(archiveIndex.summary.unsafePathEntries, 0);
    assert.equal(archiveIndex.summary.duplicateEntries, 0);
    assert.equal(archiveIndex.summary.unknownTypeEntries, 5_588);
    assert.equal(archiveIndex.summary.regularFileTypeEntries, 0);
    assert.equal(archiveIndex.summary.unsupportedTypeEntries, 0);
    assert.equal(new Set(archiveIndex.entries.map((entry) => entry.path)).size, 5_588);
    assert.equal(report.sourceReplay.confirmatoryEpisodes, 5_400);
    assert.equal(report.sourceReplay.archiveEpisodeBytesAndCrcReplayed, 5_400);
    assert.equal(report.sourceReplay.schemaInspectedEpisodes, 4_896);
    assert.equal(report.sourceReplay.opaqueAuditByteCommitments, 504);
    assert.equal(report.sourceReplay.schemaInspectedKeptTwoPhaseCalls, 9_792);
    assert.equal(report.sourceReplay.schemaInspectedProviderUsageRecords, 9_793);
    assert.equal(report.sourceReplay.schemaInspectedProviderCallAttempts, 9_797);
    assert.equal(report.sourceReplay.schemaInspectedRetryRecords, 5);
    assert.deepEqual(report.sourceReplay
      .datasetWidePinnedAggregateCountsNotRecomputedFromOpaqueAudit, {
      keptTwoPhaseCalls: 10_800,
      providerUsageRecords: 10_801,
      providerCallAttempts: 10_805,
      retryRecords: 5,
      provenance:
        "PINNED_EXPECTATION_ONLY_AUDIT_EPISODES_NOT_JSON_PARSED_IN_THIS_SUCCESSOR",
    });
    assert.equal(report.sourceReplay.deterministicLabelsInspectedEpisodes, 4_896);
    assert.equal(report.sourceReplay.outcomeBlindAuditEpisodes, 504);
    assert.equal(report.sourceReplay.auditJsonParses, 0);
    assert.equal(report.sourceReplay.auditScoreContainerAccesses, 0);
    assert.equal(report.sourceReplay.auditScoreOwnKeyEnumerations, 0);
    assert.equal(report.sourceReplay.auditScorePropertyDescriptorReads, 0);
    assert.equal(report.sourceReplay.auditScoreValueReads, 0);
    assert.equal(report.sourceReplay.auditMetricsComputed, 0);
    assert.equal(report.sourceReplay.outcomeBlindAuditScorePropertiesAccessedByAdapter, 0);
    assert.equal(report.sourceReplay.labelledPilotEpisodesNotUsed, 48);
    assert.equal(report.sourceReplay.realWorldCompleteThreeSegmentEpisodes, 0);
    assert.equal(report.privacyReview.highConfidenceSecretMatches, 0);
    assert.equal(report.privacyReview.episodeFilesScanned, 5_400);
    assert.equal(report.privacyReview.episodeBytesScanned, 72_717_259);
    assert.equal(report.privacyReview.auditEpisodeFilesScanned, 504);
    assert.equal(report.privacyReview.auditEpisodeBytesScanned, 6_733_347);
    assert.equal(report.privacyReview.emailAddressCandidates, 0);
    assert.equal(report.privacyReview.ipv4AddressCandidates, 0);
    assert.equal(report.privacyReview.valuesOrMatchesEmitted, false);
    assert.equal(report.rightsReview.recordLicenseId, "cc-by-4.0");
    assert.equal(report.rightsReview.chainOfTitleIndependentlyAdjudicated, false);
    assert.equal(report.rightsReview.providerOutputTermsIndependentlyAdjudicated, false);
    assert.equal(report.boundary.rawPromptAndResponseNetworkProjection, false);
    assert.equal(report.boundary.networkRecordsCreated, 0);
    assert.equal(report.boundary.productionTrainingRows, 0);
    assert.equal(report.boundary.authority, "NONE");
    assert.equal(report.boundary.CEU, 0);
    assert.equal(report.boundary.PRICE, false);
    assert.equal(report.boundary.GUARANTEE, false);
    assert.equal(report.boundary.SETTLE, false);
    assert.equal(report.successorBoundary.predecessorStatus,
      "REJECTED_P1_INTRINSIC_AND_STRICT_AUDIT_ZERO_ACCESS_CLAIMS");
    assert.equal(report.sourceTrust.acquisitionAuditGaps.perRangeResponseTranscriptPersisted,
      false);
  });

test("successor source files are byte-identical to the immutable predecessor raw source",
  { skip: !ARTIFACT_READY }, () => {
    for (const name of Object.values(STALE_CONSTRAINT_SOURCE_FILES)) {
      const predecessor = readFileSync(path.join(PREDECESSOR_SOURCE, name));
      const successor = readFileSync(path.join(ARTIFACT, "source", name));
      assert.equal(predecessor.length, successor.length, name);
      assert.equal(createHash("sha256").update(predecessor).digest("hex"),
        createHash("sha256").update(successor).digest("hex"), name);
      assert.equal(Buffer.compare(predecessor, successor), 0, name);
    }
  });

test("predecessor is explicitly rejected by a private marker that binds the successor",
  { skip: !ARTIFACT_READY }, () => {
    const marker = JSON.parse(readFileSync(PREDECESSOR_MARKER, "utf8"));
    assert.equal(statSync(PREDECESSOR_MARKER).mode & 0o777, 0o600);
    assert.equal(marker.status,
      "REJECTED_SUPERSEDED_DO_NOT_USE_DERIVED_REPORT_OR_RECEIPT");
    assert.equal(marker.rejectionReasons.length, 2);
    assert.equal(marker.predecessorSemanticHashes.reportHash,
      "sha256:993cc8962cdd3c6e1ceec1790e83d4ec754219ade3bcd12c81adaf35973a3163");
    assert.equal(marker.successorSemanticHashes.reportHash,
      "sha256:80776546230f6a819a511ab1719be0b47e7d7323d0fb3c847209cd87ba99e954");
    assert.equal(marker.successorSemanticHashes.receiptHash,
      "sha256:540855196cc13c68fd0d98178143dafbc7183e79fa4410180460e3d8504ce9c5");
    assert.equal(marker.predecessorDerivedReportOrReceiptAuthorized, false);
  });

test("frozen block split bridges every run version and reserves labels outcome-blind",
  { skip: !ARTIFACT_READY }, () => {
    const { report } = readArtifact();
    const split = report.offlineResearchTraining.split;
    assert.equal(split.groupingBasis,
      "FROZEN_DESIGN_BLOCK_(FORM_MODEL_RUN)_MERGED_ACROSS_PRIMARY_REPLICATION_HELDOUT_CORRECTED_HELDOUT");
    assert.equal(split.groupingEvidence.sourcePath,
      "paper2-data-and-code-v2/next_studies/stale_constraints/STALE_CONSTRAINT_DESIGN.md");
    assert.match(split.groupingEvidence.frozenDefinition,
      /block is \(F, model, run\)/u);
    assert.match(split.groupingEvidence.conservativeMerge,
      /kind, world_key, family, block_seed and cell_seed are excluded/u);
    assert.equal(split.totalGroups, 300);
    assert.equal(split.holdoutPoolGroups, 90);
    assert.equal(split.auditReserve.selectedFromHoldoutPool, true);
    assert.equal(split.trainGroups, 210);
    assert.equal(split.holdoutGroups, 60);
    assert.equal(split.auditReserveGroups, 30);
    assert.equal(split.trainEpisodes, 3_816);
    assert.equal(split.holdoutEpisodes, 1_080);
    assert.equal(split.auditReserveEpisodes, 504);
    assert.equal(split.groupOverlap, 0);
    assert.equal(split.auditReserve.selectedBeforeLabelInspection, true);
    assert.equal(split.auditReserve.labelsUsedForSelection, false);
    assert.equal(split.auditReserve.labelsInspectedForThisReport, false);
    assert.equal(split.auditReserve.metricsComputed, false);
    assert.equal(split.auditReserve.jsonParses, 0);
    assert.equal(split.auditReserve.scoreContainerAccesses, 0);
    assert.equal(split.auditReserve.scoreOwnKeyEnumerations, 0);
    assert.equal(split.auditReserve.scorePropertyDescriptorReads, 0);
    assert.equal(split.auditReserve.scoreValueReads, 0);
    assert.equal(split.episodeJsonParsesBeforeAuditRootsFrozen, 0);
    assert.match(report.offlineResearchTraining.candidate.model.standardizer.fittedOnTrainingOnly
      ? "true" : "false", /true/u);
    assert.equal(report.offlineResearchTraining.candidate.model.featurePolicy
      .preOutcomeStructuralOnly, true);
    assert.equal(report.offlineResearchTraining.candidate.model.featurePolicy
      .encoderFittedOnTrainingOnly, true);
    assert.equal(report.offlineResearchTraining.candidate.model.featurePolicy
      .holdoutParticipatedInFit, false);
    assert.equal(report.offlineResearchTraining.candidate.model.featurePolicy
      .auditParticipatedInFit, false);
    assert.equal(report.offlineResearchTraining.candidate.model.featurePolicy
      .explicitlyForbidden.includes("raw responses"), true);
  });

test("real offline candidate improves every predeclared research gate but cannot promote production",
  { skip: !ARTIFACT_READY }, () => {
    const { report, receipt } = readArtifact();
    const training = report.offlineResearchTraining;
    assert.equal(training.baseline.holdoutMetrics.auc, 0.5);
    assert.equal(training.candidate.holdoutMetrics.auc > training.baseline.holdoutMetrics.auc,
      true);
    assert.equal(training.candidate.holdoutMetrics.brier < training.baseline.holdoutMetrics.brier,
      true);
    assert.equal(Object.values(training.predeclaredPromotionGates).every(Boolean), true);
    assert.equal(training.researchQueueDecision,
      "USE_CANDIDATE_FOR_NEXT_OFFLINE_REVIEW_QUEUE");
    assert.equal(training.selectedQueue.dispatched, false);
    assert.equal(training.selectedQueue.automaticAcquisition, false);
    assert.equal(training.selectedQueue.rawTextIncluded, false);
    assert.equal(training.selectedQueue.executable, false);
    assert.equal(training.productionDecision,
      "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED");
    assert.equal(receipt.productionDecision,
      "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED");
    assert.equal(receipt.admissions.offlineDerivedStructuralResearchRows, 4_896);
    assert.equal(receipt.admissions.opaqueAuditByteCommitments, 504);
    assert.equal(receipt.admissions.productionTrainingRows, 0);
    assert.equal(receipt.admissions.networkRows, 0);
  });

test("source mutation invalidates replay", { skip: !ARTIFACT_READY }, () => {
  const { report, archiveIndex, sourceDirectory } = readArtifact();
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stale-source-mutation-"));
  try {
    for (const name of Object.values(STALE_CONSTRAINT_SOURCE_FILES)) {
      const bytes = readFileSync(path.join(sourceDirectory, name));
      writeFileSync(path.join(root, name), bytes, { mode: 0o600 });
      chmodSync(path.join(root, name), 0o600);
    }
    const sums = path.join(root, STALE_CONSTRAINT_SOURCE_FILES.checksums);
    const bytes = readFileSync(sums);
    bytes[0] ^= 1;
    writeFileSync(sums, bytes, { mode: 0o600 });
    const checked = verifyStaleConstraintEpisodeArtifact(report, archiveIndex,
      { sourceDirectory: root });
    assert.equal(checked.ok, false);
    assert.match(checked.error, /CHECKSUM_FILE_PIN_MISMATCH/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("acquired source and derived artifacts are private", { skip: !ARTIFACT_READY }, () => {
  assert.equal(statSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  for (const name of Object.values(STALE_CONSTRAINT_SOURCE_FILES)) {
    assert.equal(statSync(path.join(ARTIFACT, "source", name)).mode & 0o777,
      0o600, name);
  }
  for (const name of ["archive-index.json", "report.json", "run-receipt.json"]) {
    assert.equal(statSync(path.join(ARTIFACT, name)).mode & 0o777, 0o600, name);
  }
});
