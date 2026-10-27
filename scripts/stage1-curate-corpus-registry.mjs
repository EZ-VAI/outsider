#!/usr/bin/env node

import {
  existsSync, lstatSync, readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { DurableStage1CurateCorpusRegistry } from
  "../src/outsider-corpus-registry.js";
import {
  buildPublicAgentCorpusArtifactSetFromSource,
  buildPublicAgentWave2CorpusArtifactSetFromSource,
  buildPublicAgentWave3MetadataCorpusArtifactSetFromSource,
  buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource,
  buildPublicEvidenceWave5CorpusArtifactSetFromSource,
  buildDroid100CorpusArtifactSetFromSource,
  buildPublicRoboticsCorpusArtifactSetFromSource,
  verifyKnownPublicCorpusRegistrySources,
  verifyPublicAgentWave3MetadataCorpusRegistrySource,
  verifyPublicAgentWave4FailureTraceCorpusRegistrySource,
  verifyPublicEvidenceWave5CorpusRegistrySource,
} from "../src/outsider-corpus-registry-intake.js";
import { buildStage05ContributionCorpusArtifactSetsFromEvidenceRegistry } from
  "../src/outsider-stage05-corpus-registry-intake.js";
import {
  NHTSA_SGO_STAGE1_FROZEN_SCOPE,
  buildNhtsaSgoIncidentCorpusArtifactSetFromSource,
  verifyNhtsaSgoIncidentCorpusRegistrySource,
} from "../src/outsider-nhtsa-corpus-registry-intake.js";

function usage() {
  process.stderr.write(`Outsider Stage 1 / CURATE corpus registry\n\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs init --dir <registry> --signing-key <private.pem> [--registry-id <id>] [--timestamp-authorities <json>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-public-agent --dir <registry> --signing-key <private.pem> --artifact-dir <public-agent-artifact> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-public-agent-wave2 --dir <registry> --signing-key <private.pem> --source-root <wave2-source> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-public-agent-wave3-metadata --dir <registry> --signing-key <private.pem> --source-root <wave3-source> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-public-agent-wave4-failure-traces --dir <registry> --signing-key <private.pem> --source-root <wave4-source> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-public-evidence-wave5-taxonomy --dir <registry> --signing-key <private.pem> --source-root <wave5-source> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-public-robotics --dir <registry> --signing-key <private.pem> --source-root <robot-source> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-droid100 --dir <registry> --signing-key <private.pem> --artifact-dir <pilot> --source-root <source> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-nhtsa-sgo-incidents --dir <registry> --signing-key <private.pem> --csv <official.csv> --data-dictionary <official.pdf> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs ingest-stage05-registry --dir <registry> --signing-key <private.pem> --evidence-registry <registry.json> --trust-store <json> [--after-import-hash <sha256>] [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs verify-sources --dir <registry> --agent-artifact-dir <public-agent-artifact> --wave2-source-root <wave2-source> --robotics-source-root <robot-source> --droid-artifact-dir <pilot> --droid-source-root <source> [--wave4-source-root <wave4-source>] [--nhtsa-csv <official.csv> --nhtsa-data-dictionary <official.pdf>] [--wave5-source-root <wave5-source>] [--now <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs verify-wave3-metadata-source --dir <registry> --source-root <wave3-source> [--now <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs verify-wave4-failure-trace-source --dir <registry> --source-root <wave4-source> [--now <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs verify-public-evidence-wave5-taxonomy-source --dir <registry> --source-root <wave5-source> [--now <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs verify-nhtsa-sgo-incident-source --dir <registry> --csv <official.csv> --data-dictionary <official.pdf> [--now <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs verify|status --dir <registry> [--now <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs repair --dir <registry> --signing-key <private.pem>\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs revoke <artifact-set-hash> --dir <registry> --signing-key <private.pem> --reason <code> [--evidence-hash <hash>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs timestamp-request <artifact-set-hash> --dir <registry> --signing-key <private.pem> --out <request.json>\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs timestamp-attach <receipt.json> --dir <registry> --signing-key <private.pem> [--at <ISO>]\n`
    + `  node scripts/stage1-curate-corpus-registry.mjs expire-due --dir <registry> --signing-key <private.pem> --now <ISO>\n`);
}

function parse(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { positional.push(value); continue; }
    const next = argv[index + 1];
    if (next == null || next.startsWith("--")) options[value.slice(2)] = true;
    else { options[value.slice(2)] = next; index += 1; }
  }
  return { positional, options };
}

function regularFile(file, code) {
  const target = path.resolve(file);
  if (!existsSync(target)) throw new Error(`${code}_MISSING`);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${code}_INVALID`);
  return target;
}

function readKey(file) {
  const target = regularFile(file, "CORPUS_REGISTRY_SIGNING_KEY");
  if (lstatSync(target).size > 32 * 1024) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_TOO_LARGE");
  return readFileSync(target, "utf8");
}

function readJson(file, code, maximumBytes = 8 * 1024 * 1024) {
  const target = regularFile(file, code);
  if (lstatSync(target).size > maximumBytes) throw new Error(`${code}_TOO_LARGE`);
  return JSON.parse(readFileSync(target, "utf8"));
}

function requireOption(options, name) {
  if (typeof options[name] !== "string" || options[name].length === 0) {
    throw new Error(`CORPUS_REGISTRY_OPTION_REQUIRED:${name}`);
  }
  return options[name];
}

function at(options, name = "at") {
  return options[name] == null ? new Date() : options[name];
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeExclusiveJson(file, value) {
  const target = path.resolve(file);
  if (existsSync(target)) throw new Error("CORPUS_REGISTRY_OUTPUT_EXISTS");
  writeFileSync(target, `${canonicalizeStrict(value)}\n`, { mode: 0o600, flag: "wx" });
  return target;
}

export async function main(argv = process.argv.slice(2)) {
  const { positional, options } = parse(argv);
  const action = positional[0];
  if (!action || options.help === true || action === "help") { usage(); return action ? 0 : 2; }
  try {
    const directory = path.resolve(requireOption(options, "dir"));
    const signingKey = options["signing-key"] ? readKey(options["signing-key"]) : null;
    if (action === "init") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const rawAuthorities = options["timestamp-authorities"]
        ? readJson(options["timestamp-authorities"], "CORPUS_REGISTRY_TIMESTAMP_AUTHORITIES") : [];
      const timestampAuthorities = Array.isArray(rawAuthorities)
        ? rawAuthorities : rawAuthorities.authorities;
      const registry = new DurableStage1CurateCorpusRegistry({ directory,
        privateKeyPem: signingKey, registryId: options["registry-id"]
          ?? "outsider-stage1-curate", createdAt: at(options), timestampAuthorities });
      const status = registry.status({ now: at(options) });
      output({ action, ...status });
      return status.ok ? 0 : 1;
    }
    const registry = new DurableStage1CurateCorpusRegistry({ directory,
      privateKeyPem: signingKey });
    if (action === "verify-sources") {
      const result = await verifyKnownPublicCorpusRegistrySources({ directory,
        agentArtifactDirectory: path.resolve(requireOption(options, "agent-artifact-dir")),
        wave2SourceRoot: path.resolve(requireOption(options, "wave2-source-root")),
        roboticsSourceRoot: path.resolve(requireOption(options, "robotics-source-root")),
        droidArtifactDirectory: path.resolve(requireOption(options, "droid-artifact-dir")),
        droidSourceRoot: path.resolve(requireOption(options, "droid-source-root")),
        wave4SourceRoot: typeof options["wave4-source-root"] === "string"
          ? path.resolve(options["wave4-source-root"]) : undefined,
        nhtsaCsvPath: typeof options["nhtsa-csv"] === "string"
          ? path.resolve(options["nhtsa-csv"]) : undefined,
        nhtsaDataDictionaryPath: typeof options["nhtsa-data-dictionary"] === "string"
          ? path.resolve(options["nhtsa-data-dictionary"]) : undefined,
        wave5SourceRoot: typeof options["wave5-source-root"] === "string"
          ? path.resolve(options["wave5-source-root"]) : undefined,
        now: at(options, "now"),
      });
      output({ action, ...result });
      return result.ok ? 0 : 1;
    }
    if (action === "verify-wave3-metadata-source") {
      const result = verifyPublicAgentWave3MetadataCorpusRegistrySource({ directory,
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        now: at(options, "now") });
      output({ action, ...result });
      return result.ok ? 0 : 1;
    }
    if (action === "verify-wave4-failure-trace-source") {
      const result = verifyPublicAgentWave4FailureTraceCorpusRegistrySource({ directory,
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        now: at(options, "now") });
      output({ action, ...result });
      return result.ok ? 0 : 1;
    }
    if (action === "verify-public-evidence-wave5-taxonomy-source") {
      const result = verifyPublicEvidenceWave5CorpusRegistrySource({ directory,
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        now: at(options, "now") });
      output({ action, ...result });
      return result.ok ? 0 : 1;
    }
    if (action === "verify-nhtsa-sgo-incident-source") {
      const result = verifyNhtsaSgoIncidentCorpusRegistrySource({ directory,
        csvPath: path.resolve(requireOption(options, "csv")),
        dataDictionaryPath: path.resolve(requireOption(options, "data-dictionary")),
        now: at(options, "now") });
      output({ action, ...result });
      return result.ok ? 0 : 1;
    }
    if (action === "verify" || action === "status") {
      const result = action === "verify" ? registry.verify({ now: at(options, "now") })
        : registry.status({ now: at(options, "now") });
      output({ action, ...result });
      return result.ok ? 0 : 1;
    }
    if (action === "repair") {
      output({ action, ok: true, ...registry.repairIndex() });
      return 0;
    }
    if (action === "ingest-public-agent") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = await buildPublicAgentCorpusArtifactSetFromSource({
        artifactDirectory: path.resolve(requireOption(options, "artifact-dir")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"] ?? "public-agent-full-source-20260820",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        candidates: artifactSet.counts.candidates, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-public-agent-wave2") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = buildPublicAgentWave2CorpusArtifactSetFromSource({
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"]
          ?? "public-agent-wave2-full-source-20260821",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        candidates: artifactSet.counts.candidates, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-public-agent-wave3-metadata") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = buildPublicAgentWave3MetadataCorpusArtifactSetFromSource({
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"]
          ?? "cuarewardbench-wave3-metadata-only-20260821",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        sourceCompleteness: artifactSet.sourceProof.sourceCompleteness,
        candidates: artifactSet.counts.candidates, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-public-agent-wave4-failure-traces") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource({
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"]
          ?? "agentrx-tau-wave4-failure-traces-20260821",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        sourceCompleteness: artifactSet.sourceProof.sourceCompleteness,
        candidates: artifactSet.counts.candidates, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-public-evidence-wave5-taxonomy") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = buildPublicEvidenceWave5CorpusArtifactSetFromSource({
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"]
          ?? "public-evidence-wave5-source-aware-taxonomy-20260822",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        sourceCompleteness: artifactSet.sourceProof.sourceCompleteness,
        rightsBasis: artifactSet.rightsBasis,
        candidates: artifactSet.counts.candidates, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-public-robotics") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = buildPublicRoboticsCorpusArtifactSetFromSource({
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"] ?? "public-robotics-full-source-20260820",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        candidates: artifactSet.counts.candidates, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-droid100") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = buildDroid100CorpusArtifactSetFromSource({
        artifactDirectory: path.resolve(requireOption(options, "artifact-dir")),
        sourceRoot: path.resolve(requireOption(options, "source-root")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"] ?? "droid100-full-source-pilot-20260820",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        candidates: artifactSet.counts.candidates, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-nhtsa-sgo-incidents") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const artifactSet = buildNhtsaSgoIncidentCorpusArtifactSetFromSource({
        csvPath: path.resolve(requireOption(options, "csv")),
        dataDictionaryPath: path.resolve(requireOption(options, "data-dictionary")),
        privateKeyPem: signingKey, createdAt: at(options),
        artifactSetId: options["artifact-set-id"]
          ?? "nhtsa-sgo-incident-taxonomy-20260820",
      });
      const result = registry.appendArtifactSet(artifactSet, { recordedAt: at(options) });
      output({ action, ok: true, stage: artifactSet.stage, stream: artifactSet.stream,
        candidates: artifactSet.counts.candidates,
        rawReportVersions: NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.rawReportVersions,
        supersededOrDuplicateVersions:
          NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.supersededOrDuplicateVersions,
        rightsBasis: artifactSet.rightsBasis, boundary: artifactSet.boundary, ...result });
      return 0;
    }
    if (action === "ingest-stage05-registry") {
      if (!signingKey) throw new Error("CORPUS_REGISTRY_SIGNING_KEY_REQUIRED");
      const evidenceRegistry = readJson(requireOption(options, "evidence-registry"),
        "CORPUS_REGISTRY_STAGE05_EVIDENCE", 128 * 1024 * 1024);
      const trust = readJson(requireOption(options, "trust-store"),
        "CORPUS_REGISTRY_STAGE05_TRUST");
      const intakeTime = options.at ?? options.now ?? new Date().toISOString();
      const intake = buildStage05ContributionCorpusArtifactSetsFromEvidenceRegistry({
        evidenceRegistry, privateKeyPem: signingKey,
        trustedRegistrySignerKeyIds: trust.registrySignerKeyIds,
        trustedSourceServerKeyIds: trust.sourceServerKeyIds,
        now: intakeTime, afterImportHash: options["after-import-hash"] ?? null,
        artifactSetIdPrefix: options["artifact-set-id-prefix"]
          ?? "stage05-live-contributions",
      });
      const result = intake.artifactSets.length > 0
        ? registry.appendArtifactSets(intake.artifactSets, { recordedAt: intakeTime })
        : { appended: 0, duplicateArtifactSets: 0, artifactSetHashes: [], eventHashes: [],
          indexHash: registry.verify({ now: intakeTime }).indexHash,
          counts: registry.status({ now: intakeTime }).counts };
      output({ action, ok: true, sourceRegistryHash: intake.sourceRegistryHash,
        sourceCompleteness: "SIGNED_PRIVACY_PROJECTION_ONLY",
        sealedRunArtifactsReverified: false, selection: intake.selection,
        intakeCounts: intake.counts,
        boundary: intake.boundary, ...result });
      return 0;
    }
    if (action === "revoke") {
      const artifactSetHash = positional[1];
      if (!artifactSetHash) throw new Error("CORPUS_REGISTRY_ARTIFACT_SET_HASH_REQUIRED");
      const result = registry.revoke(artifactSetHash, {
        reasonCode: requireOption(options, "reason"),
        evidenceHash: options["evidence-hash"] ?? null, recordedAt: at(options),
      });
      output({ action, ok: true, ...result });
      return 0;
    }
    if (action === "timestamp-request") {
      const artifactSetHash = positional[1];
      if (!artifactSetHash) throw new Error("CORPUS_REGISTRY_ARTIFACT_SET_HASH_REQUIRED");
      const requestedOutput = path.resolve(requireOption(options, "out"));
      if (existsSync(requestedOutput)) throw new Error("CORPUS_REGISTRY_OUTPUT_EXISTS");
      const result = registry.requestExternalTimestamp(artifactSetHash,
        { requestedAt: at(options) });
      const requestFile = writeExclusiveJson(requestedOutput, result.request);
      output({ action, ok: true, artifactSetHash, requestFile, requestHash: result.request.requestHash,
        externallyTimestamped: false, eventHash: result.eventHash, indexHash: result.indexHash });
      return 0;
    }
    if (action === "timestamp-attach") {
      if (!positional[1]) throw new Error("CORPUS_REGISTRY_TIMESTAMP_RECEIPT_REQUIRED");
      const receipt = readJson(positional[1], "CORPUS_REGISTRY_TIMESTAMP_RECEIPT");
      const result = registry.attachExternalTimestamp(receipt, { recordedAt: at(options) });
      output({ action, ok: true, ...result });
      return 0;
    }
    if (action === "expire-due") {
      if (!options.now) throw new Error("CORPUS_REGISTRY_OPTION_REQUIRED:now");
      const result = registry.expireDue({ now: options.now });
      output({ action, ok: true, ...result });
      return 0;
    }
    usage();
    return 2;
  } catch (error) {
    process.stderr.write(`corpus registry ${action ?? "unknown"} failed: `
      + `${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

let direct = false;
try {
  direct = realpathSync(process.argv[1])
    === realpathSync(fileURLToPath(import.meta.url));
} catch { /* import */ }
if (direct) process.exitCode = await main();
