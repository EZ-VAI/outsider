import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PUBLIC_AGENT_SOURCE_OBJECT_PINS, readPinnedPublicAgentSourceSnapshot,
  verifyPublicAgentArtifactsAgainstSource } from
  "../src/outsider-public-agent-artifacts.js";
import { PUBLIC_AGENT_PINS } from "../src/outsider-public-agent-corpus.js";

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

test("full-source verifier rejects an incomplete TraceLab object before replay", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "outsider-agent-artifacts-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "source");
  mkdirSync(source);
  writeFileSync(join(source, "syfi_coding_trace.jsonl.gz"), "incomplete");

  const incomplete = await verifyPublicAgentArtifactsAgainstSource({
    sourceDirectory: source,
    artifactDirectory: root,
  });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.status, "FULL_SOURCE_REPRODUCTION_FAILED");
  assert.match(incomplete.error, /PUBLIC_AGENT_TRACELAB_SOURCE_INCOMPLETE/);

  const escaped = await verifyPublicAgentArtifactsAgainstSource({
    sourceDirectory: root,
    artifactDirectory: root,
  });
  assert.equal(escaped.ok, false);
  assert.match(escaped.error, /PUBLIC_AGENT_SOURCE_DIRECTORY_NOT_ARTIFACT_CHILD/);
});

const REAL_ARTIFACT = resolve("artifacts/public-agent-corpus-20260820");
const REAL_SOURCE = join(REAL_ARTIFACT, "source");
const CURRENT_THREE_READY = [
  join(REAL_SOURCE, "computer-agent-arena", "agent_arena_data.jsonl"),
  join(REAL_SOURCE, "computer-agent-arena", "sessions.csv"),
  ...Object.keys(PUBLIC_AGENT_SOURCE_OBJECT_PINS.computerAgentArenaProvenance)
    .map((name) => join(REAL_SOURCE, name)),
  ...Object.keys(PUBLIC_AGENT_SOURCE_OBJECT_PINS.traceLabProvenance)
    .map((name) => join(REAL_SOURCE, name)),
  ...Object.keys(PUBLIC_AGENT_SOURCE_OBJECT_PINS.openHandsAcquisition)
    .map((name) => join(REAL_SOURCE, name)),
  join(REAL_SOURCE, "openhands-feedback.README.md"),
  ...Object.keys(PUBLIC_AGENT_SOURCE_OBJECT_PINS.nebiusAcquisition)
    .map((name) => join(REAL_SOURCE, name)),
  join(REAL_SOURCE, "nebius-openhands.README.md"),
  join(REAL_SOURCE, "nebius-openhands.LICENSE"),
].every(existsSync);

test("current CAA, OpenHands and Nebius source objects match frozen acquisition pins", {
  skip: !CURRENT_THREE_READY,
}, async () => {
  const objects = [
    [join(REAL_SOURCE, "computer-agent-arena", "agent_arena_data.jsonl"),
      PUBLIC_AGENT_PINS.computerAgentArena.upstreamObject],
    [join(REAL_SOURCE, "computer-agent-arena", "sessions.csv"),
      PUBLIC_AGENT_SOURCE_OBJECT_PINS.computerAgentArenaSessions],
    ...Object.entries(PUBLIC_AGENT_SOURCE_OBJECT_PINS.computerAgentArenaProvenance)
      .map(([name, pin]) => [join(REAL_SOURCE, name), pin]),
    ...Object.entries(PUBLIC_AGENT_SOURCE_OBJECT_PINS.traceLabProvenance)
      .map(([name, pin]) => [join(REAL_SOURCE, name), pin]),
    ...Object.entries(PUBLIC_AGENT_SOURCE_OBJECT_PINS.openHandsAcquisition)
      .map(([name, pin]) => [join(REAL_SOURCE, name), pin]),
    [join(REAL_SOURCE, "openhands-feedback.README.md"),
      PUBLIC_AGENT_SOURCE_OBJECT_PINS.openHandsReadme],
    ...Object.entries(PUBLIC_AGENT_SOURCE_OBJECT_PINS.nebiusAcquisition)
      .map(([name, pin]) => [join(REAL_SOURCE, name), pin]),
    [join(REAL_SOURCE, "nebius-openhands.README.md"),
      PUBLIC_AGENT_SOURCE_OBJECT_PINS.nebiusReadme],
    [join(REAL_SOURCE, "nebius-openhands.LICENSE"),
      PUBLIC_AGENT_SOURCE_OBJECT_PINS.nebiusLicense],
  ];
  for (const [path, pin] of objects) {
    assert.equal(statSync(path).size, pin.sizeBytes, path);
    assert.equal(await sha256(path), pin.sha256, path);
  }
});

const REAL_READY = [
  "acquisition-manifest.json",
  "normalized-computer-agent-arena.jsonl",
  "normalized-tracelab.jsonl",
  "normalized-openhands-feedback.jsonl",
  "normalized-nebius-openhands.jsonl",
  "normalized-records.jsonl",
  "effect-summary.json",
  "source/syfi_coding_trace.jsonl.gz",
].every((name) => existsSync(join(REAL_ARTIFACT, name)))
  && (() => {
    try {
      return JSON.parse(readFileSync(join(REAL_ARTIFACT, "acquisition-manifest.json"), "utf8"))
        .schema === "outsider/public-agent-acquisition-manifest/v2";
    } catch { return false; }
  })();

test("same-size path swap after verification cannot change the parsed source snapshot",
  (context) => {
    const root = mkdtempSync(join(tmpdir(), "outsider-agent-snapshot-swap-"));
    context.after(() => rmSync(root, { recursive: true, force: true }));
    const path = join(root, "source.json");
    const before = '{"value":"A"}\n';
    const after = '{"value":"B"}\n';
    writeFileSync(path, before);
    const pin = { sizeBytes: Buffer.byteLength(before), sha256: `sha256:${createHash("sha256")
      .update(before).digest("hex")}` };
    const snapshot = readPinnedPublicAgentSourceSnapshot(path, pin);
    writeFileSync(path, after);
    assert.equal(JSON.parse(snapshot.bytes.toString("utf8")).value, "A");
    assert.deepEqual(snapshot.object, pin);
    assert.throws(() => readPinnedPublicAgentSourceSnapshot(path, pin),
      /PUBLIC_AGENT_SOURCE_SNAPSHOT_MISMATCH/);
  });

test("real four-source corpus is reproduced from source bytes", {
  skip: !REAL_READY,
}, async () => {
  const result = await verifyPublicAgentArtifactsAgainstSource({
    sourceDirectory: join(REAL_ARTIFACT, "source"),
    artifactDirectory: REAL_ARTIFACT,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.status, "FULL_SOURCE_REPRODUCED");
  assert.equal(result.attestation.derivation, "FULL_SOURCE_REDERIVED");
  assert.equal(result.attestation.records, 9381);
  assert.deepEqual(result.recordSetProof.counts, {
    "OpenHands/openhands-feedback": 275,
    "nebius/SWE-rebench-openhands-trajectories": 200,
    "uw-syfi/TraceLab": 4265,
    "xlangai/computer-agent-arena": 4641,
  });
  assert.match(result.attestation.verificationHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.attestation.scope.generatedAt,
    "SELF_ASSERTED_LOCAL_TIME_NOT_EXTERNALLY_VERIFIED");
  const caa = result.manifest.sources.find((source) =>
    source.id === PUBLIC_AGENT_PINS.computerAgentArena.id);
  const trace = result.manifest.sources.find((source) =>
    source.id === PUBLIC_AGENT_PINS.traceLab.id);
  assert.equal(caa.provenanceProof.byteIdentity.status,
    "FULL_UPSTREAM_OBJECT_BYTES_VERIFIED");
  assert.equal(caa.provenanceProof.revisionBinding.status,
    "HOST_PINNED_REVISION_TREE_WITH_CONTENT_IDS");
  assert.equal(trace.provenanceProof.byteIdentity.status,
    "FULL_RELEASE_ASSET_BYTES_AND_PUBLISHED_DIGEST_VERIFIED");
  assert.equal(trace.provenanceProof.licenseDeclaration.legalConclusion, false);
});

test("full-source verifier rejects an artifact that does not match its source replay", {
  skip: !REAL_READY,
}, async (context) => {
  const root = mkdtempSync(join(tmpdir(), "outsider-agent-artifact-tamper-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(join(REAL_ARTIFACT, "source"), join(root, "source"), "dir");
  for (const name of ["acquisition-manifest.json", "normalized-computer-agent-arena.jsonl",
    "normalized-tracelab.jsonl", "normalized-openhands-feedback.jsonl",
    "normalized-nebius-openhands.jsonl", "normalized-records.jsonl"]) {
    symlinkSync(join(REAL_ARTIFACT, name), join(root, name), "file");
  }
  copyFileSync(join(REAL_ARTIFACT, "effect-summary.json"), join(root, "effect-summary.json"));
  const summary = JSON.parse(readFileSync(join(root, "effect-summary.json"), "utf8"));
  summary.interpretation.economicLossRows = 1;
  writeFileSync(join(root, "effect-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  const result = await verifyPublicAgentArtifactsAgainstSource({
    sourceDirectory: join(root, "source"),
    artifactDirectory: root,
  });
  assert.equal(result.ok, false);
  assert.match(result.error,
    /PUBLIC_AGENT_ARTIFACT_EXACT_MISMATCH:effect-summary\.json/);
});
